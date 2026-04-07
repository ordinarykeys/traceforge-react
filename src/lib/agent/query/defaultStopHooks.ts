import { translate, type AppLocale } from "@/lib/i18n";
import type { AgentStepData } from "../QueryEngine";
import type { StopHook } from "./stopHooks";

const COMPLETION_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:done|completed|complete|fixed|resolved|successful|successfully)\b/i,
  /(?:\u5df2\u5b8c\u6210|\u5df2\u4fee\u590d|\u5df2\u89e3\u51b3|\u5b8c\u6210\u4e86|\u6210\u529f)/u,
];

const FAILURE_DISCLOSURE_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\brejected\b/i,
  /\bpermission denied\b/i,
  /\bcould not\b/i,
  /\bunable to\b/i,
  /\bnot run\b/i,
  /(?:\u9519\u8bef|\u5931\u8d25|\u62d2\u7edd|\u65e0\u6cd5|\u672a\u6267\u884c|\u672a\u901a\u8fc7)/u,
];

const TESTS_PASSED_PATTERNS: RegExp[] = [
  /\b(?:all\s+)?tests?\s+(?:have\s+)?(?:pass|passed|passing|green)\b/i,
  /\btest suite\b.*\bpass(?:ed|ing)?\b/i,
  /(?:\u6d4b\u8bd5(?:\u5168\u90e8)?\u901a\u8fc7|\u6240\u6709\u6d4b\u8bd5\u901a\u8fc7)/u,
];

const BUILD_PASSED_PATTERNS: RegExp[] = [
  /\b(?:build|compile|compilation)\s+(?:is\s+)?(?:pass(?:ed|ing)?|success(?:ful|fully)?|green|ok(?:ay)?)\b/i,
  /\b(?:successfully\s+)?built\b/i,
  /(?:\u6784\u5efa(?:\u5df2)?(?:\u6210\u529f|\u901a\u8fc7)|\u7f16\u8bd1(?:\u5df2)?(?:\u6210\u529f|\u901a\u8fc7))/u,
];

const LINT_PASSED_PATTERNS: RegExp[] = [
  /\b(?:lint|linting|eslint|stylelint|clippy)\s+(?:is\s+)?(?:pass(?:ed|ing)?|success(?:ful|fully)?|clean|green|ok(?:ay)?)\b/i,
  /\bno\s+lint(?:ing)?\s+errors?\b/i,
  /(?:lint(?:\u68c0\u67e5)?(?:\u5df2)?(?:\u901a\u8fc7|\u6210\u529f)|\u4ee3\u7801\u68c0\u67e5(?:\u5df2)?(?:\u901a\u8fc7|\u6210\u529f))/u,
];

const TYPECHECK_PASSED_PATTERNS: RegExp[] = [
  /\b(?:type(?:\s|-)?check|typecheck|types?)\s+(?:is\s+)?(?:pass(?:ed|ing)?|success(?:ful|fully)?|clean|green|ok(?:ay)?)\b/i,
  /\bno\s+type\s+errors?\b/i,
  /(?:\u7c7b\u578b(?:\u68c0\u67e5)?(?:\u5df2)?(?:\u901a\u8fc7|\u6210\u529f)|\u65e0\u7c7b\u578b\u9519\u8bef)/u,
];

const TEST_VERIFICATION_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?:\s|$)/i,
  /\bpytest\b/i,
  /\bvitest\b/i,
  /\bjest\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
  /\bdotnet\s+test\b/i,
  /\bphpunit\b/i,
  /\bmvn\s+test\b/i,
  /\bgradle(?:w)?\s+test\b/i,
  /\bctest\b/i,
];

const BUILD_VERIFICATION_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build(?:\s|$)/i,
  /\bvite\s+build\b/i,
  /\bwebpack\b/i,
  /\btsc(?:\s|$)/i,
  /\bcargo\s+build\b/i,
  /\bgo\s+build\b/i,
  /\bdotnet\s+build\b/i,
  /\bmvn\s+(?:package|install|verify|compile)\b/i,
  /\bgradle(?:w)?\s+(?:build|assemble)\b/i,
];

const LINT_VERIFICATION_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint(?:\s|$)/i,
  /\beslint(?:\s|$)/i,
  /\bstylelint(?:\s|$)/i,
  /\bcargo\s+clippy\b/i,
  /\bgolangci-lint\b/i,
  /\bruff(?:\s|$)/i,
];

const TYPECHECK_VERIFICATION_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?type(?:\s|-)?check(?:\s|$)/i,
  /\btsc(?:\s|$)/i,
  /\bpyright(?:\s|$)/i,
  /\bmypy(?:\s|$)/i,
  /\bflow(?:\s|$)/i,
  /\bdotnet\s+build\b/i,
];

const DIAGNOSIS_DISCLOSURE_PATTERNS: RegExp[] = [
  /\b(?:because|due to|root cause|caused by|diagnos(?:e|ed|is)|reason)\b/i,
  /(?:\u539f\u56e0|\u6839\u56e0|\u5b9a\u4f4d|\u5206\u6790|\u6392\u67e5|\u56e0\u4e3a|\u5bfc\u81f4)/u,
];

const PIVOT_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:instead|switched|switching|fallback|alternative approach|changed approach|pivot)\b/i,
  /(?:\u6539\u7528|\u6362\u6210|\u5207\u6362|\u66ff\u4ee3|\u5907\u9009|\u56de\u9000\u65b9\u6848)/u,
];

function hasAnyPattern(value: string, patterns: RegExp[]): boolean {
  if (!value.trim()) {
    return false;
  }
  return patterns.some((pattern) => pattern.test(value));
}

function collectStepText(step: AgentStepData): string {
  const parts: string[] = [step.title, ...(step.logs ?? [])];
  if (step.toolRender?.outcomePreview) {
    parts.push(step.toolRender.outcomePreview);
  }
  return parts.join("\n");
}

function parseShellCommandFromCallArguments(callArguments: string | undefined): string {
  if (!callArguments) {
    return "";
  }
  try {
    const parsed = JSON.parse(callArguments) as {
      cmd?: unknown;
      args?: unknown;
    };
    const cmd = typeof parsed.cmd === "string" ? parsed.cmd.trim() : "";
    const args = Array.isArray(parsed.args)
      ? parsed.args.map((item) => String(item)).join(" ").trim()
      : "";
    return `${cmd}${args ? ` ${args}` : ""}`.trim();
  } catch {
    return callArguments;
  }
}

function stepHasFailure(step: AgentStepData): boolean {
  if (step.status === "error" || step.status === "rejected") {
    return true;
  }
  return hasAnyPattern(collectStepText(step), FAILURE_DISCLOSURE_PATTERNS);
}

function stepMatchesVerificationCommand(
  step: AgentStepData,
  commandPatterns: RegExp[],
): boolean {
  const toolName = step.toolRender?.toolName;
  if (!toolName || toolName !== "shell") {
    return false;
  }

  const command = parseShellCommandFromCallArguments(step.toolRender?.callArguments);
  if (hasAnyPattern(command, commandPatterns)) {
    return true;
  }

  return hasAnyPattern(collectStepText(step), commandPatterns);
}

function collectVerificationStatus(
  steps: AgentStepData[],
  commandPatterns: RegExp[],
): { hasVerification: boolean; hasFailure: boolean } {
  const matched = steps.filter((step) => stepMatchesVerificationCommand(step, commandPatterns));
  if (matched.length === 0) {
    return { hasVerification: false, hasFailure: false };
  }
  return {
    hasVerification: true,
    hasFailure: matched.some((step) => stepHasFailure(step)),
  };
}

function summarizeFailedToolSignals(steps: AgentStepData[]): string {
  const counter = new Map<string, number>();
  for (const step of steps) {
    if (!stepHasFailure(step)) {
      continue;
    }
    const tool = step.toolRender?.toolName?.trim() || "unknown";
    counter.set(tool, (counter.get(tool) ?? 0) + 1);
  }
  if (counter.size === 0) {
    return "";
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([tool, count]) => `${tool}x${count}`)
    .join(", ");
}

function buildFaithfulReportingStopHook(locale: AppLocale): StopHook {
  return ({ assistantMessage }) => {
    const content = assistantMessage.content?.trim() ?? "";
    if (!content) {
      return {};
    }

    const steps = assistantMessage.steps ?? [];
    const hasStepFailures = steps.some((step) => stepHasFailure(step));
    const hasCompletionClaim = hasAnyPattern(content, COMPLETION_CLAIM_PATTERNS);
    const alreadyDisclosedFailure = hasAnyPattern(content, FAILURE_DISCLOSURE_PATTERNS);

    const continuationMessages: string[] = [];
    const notes: string[] = [];

    if (hasStepFailures && hasCompletionClaim && !alreadyDisclosedFailure) {
      notes.push(translate(locale, "agent.runtime.stopHooksFaithfulReportingNote"));
      continuationMessages.push(translate(locale, "agent.runtime.stopHooksFaithfulReportingContinuation"));
    }

    const claimsTestsPassed = hasAnyPattern(content, TESTS_PASSED_PATTERNS);
    const testVerificationStatus = collectVerificationStatus(
      steps,
      TEST_VERIFICATION_COMMAND_PATTERNS,
    );
    if (claimsTestsPassed && !testVerificationStatus.hasVerification) {
      notes.push(translate(locale, "agent.runtime.stopHooksMissingVerificationNote"));
      continuationMessages.push(translate(locale, "agent.runtime.stopHooksMissingVerificationContinuation"));
    } else if (claimsTestsPassed && testVerificationStatus.hasFailure) {
      const target = translate(locale, "agent.runtime.stopHooksVerificationTarget.tests");
      notes.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationNote", { target }),
      );
      continuationMessages.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationContinuation", { target }),
      );
    }

    const claimsBuildPassed = hasAnyPattern(content, BUILD_PASSED_PATTERNS);
    const buildVerificationStatus = collectVerificationStatus(
      steps,
      BUILD_VERIFICATION_COMMAND_PATTERNS,
    );
    if (claimsBuildPassed && !buildVerificationStatus.hasVerification) {
      notes.push(translate(locale, "agent.runtime.stopHooksMissingBuildVerificationNote"));
      continuationMessages.push(translate(locale, "agent.runtime.stopHooksMissingBuildVerificationContinuation"));
    } else if (claimsBuildPassed && buildVerificationStatus.hasFailure) {
      const target = translate(locale, "agent.runtime.stopHooksVerificationTarget.build");
      notes.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationNote", { target }),
      );
      continuationMessages.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationContinuation", { target }),
      );
    }

    const claimsLintPassed = hasAnyPattern(content, LINT_PASSED_PATTERNS);
    const lintVerificationStatus = collectVerificationStatus(
      steps,
      LINT_VERIFICATION_COMMAND_PATTERNS,
    );
    if (claimsLintPassed && !lintVerificationStatus.hasVerification) {
      notes.push(translate(locale, "agent.runtime.stopHooksMissingLintVerificationNote"));
      continuationMessages.push(translate(locale, "agent.runtime.stopHooksMissingLintVerificationContinuation"));
    } else if (claimsLintPassed && lintVerificationStatus.hasFailure) {
      const target = translate(locale, "agent.runtime.stopHooksVerificationTarget.lint");
      notes.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationNote", { target }),
      );
      continuationMessages.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationContinuation", { target }),
      );
    }

    const claimsTypecheckPassed = hasAnyPattern(content, TYPECHECK_PASSED_PATTERNS);
    const typecheckVerificationStatus = collectVerificationStatus(
      steps,
      TYPECHECK_VERIFICATION_COMMAND_PATTERNS,
    );
    if (claimsTypecheckPassed && !typecheckVerificationStatus.hasVerification) {
      notes.push(translate(locale, "agent.runtime.stopHooksMissingTypecheckVerificationNote"));
      continuationMessages.push(translate(locale, "agent.runtime.stopHooksMissingTypecheckVerificationContinuation"));
    } else if (claimsTypecheckPassed && typecheckVerificationStatus.hasFailure) {
      const target = translate(locale, "agent.runtime.stopHooksVerificationTarget.typecheck");
      notes.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationNote", { target }),
      );
      continuationMessages.push(
        translate(locale, "agent.runtime.stopHooksContradictVerificationContinuation", { target }),
      );
    }

    if (continuationMessages.length === 0 && notes.length === 0) {
      return {};
    }

    return {
      note: notes.join("\n"),
      continuationMessage: continuationMessages.join("\n\n"),
    };
  };
}

function buildDiagnoseBeforePivotStopHook(locale: AppLocale): StopHook {
  return ({ assistantMessage }) => {
    const content = assistantMessage.content?.trim() ?? "";
    if (!content) {
      return {};
    }

    const steps = assistantMessage.steps ?? [];
    const failedToolSteps = steps.filter((step) => step.toolRender?.toolName && stepHasFailure(step));
    if (failedToolSteps.length < 2) {
      return {};
    }

    const hasDiagnosis = hasAnyPattern(content, DIAGNOSIS_DISCLOSURE_PATTERNS);
    if (hasDiagnosis) {
      return {};
    }

    const hasPivotClaim = hasAnyPattern(content, PIVOT_CLAIM_PATTERNS);
    if (!hasPivotClaim && failedToolSteps.length < 3) {
      return {};
    }

    const tools = summarizeFailedToolSignals(failedToolSteps);
    return {
      note: translate(locale, "agent.runtime.stopHooksDiagnoseBeforePivotNote", { tools }),
      continuationMessage: translate(locale, "agent.runtime.stopHooksDiagnoseBeforePivotContinuation", { tools }),
    };
  };
}

export function createDefaultStopHooks(locale: AppLocale): StopHook[] {
  return [
    buildFaithfulReportingStopHook(locale),
    buildDiagnoseBeforePivotStopHook(locale),
  ];
}
