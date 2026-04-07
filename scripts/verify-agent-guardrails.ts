import { createDefaultStopHooks } from "../src/lib/agent/query/defaultStopHooks";
import { executeStopHooks } from "../src/lib/agent/query/stopHooks";
import type { AgentMessage, AgentStepData } from "../src/lib/agent/QueryEngine";
import {
  getPriorScopedApprovalsForTool,
  noteScopedAuthorizationApproval,
  updateToolFailureStreak,
} from "../src/lib/agent/query/guardrails";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFailedToolStep(id: string, toolName: string, callArguments = `{"cmd":"npm","args":["run","test"]}`): AgentStepData {
  return {
    id,
    title: `${toolName} failed`,
    status: "error",
    logs: ["execution failed: non-zero exit code"],
    toolRender: {
      toolName,
      argsSummary: "mock",
      callArguments,
      outcome: "error",
      outcomePreview: "Error: command failed",
    },
  };
}

function makeAssistantMessage(content: string, steps: AgentStepData[]): AgentMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content,
    status: "completed",
    steps,
  };
}

async function verifyDiagnoseBeforePivotHook() {
  const hooks = createDefaultStopHooks("en-US");
  const steps = [
    makeFailedToolStep("s1", "shell"),
    makeFailedToolStep("s2", "read", `{"path":"src/App.tsx"}`),
  ];
  const result = await executeStopHooks(hooks, {
    messages: [],
    assistantMessage: makeAssistantMessage(
      "Switched to an alternative approach after that path failed.",
      steps,
    ),
    iteration: 2,
  });
  assert(
    result.continuationMessages.length > 0,
    "diagnose-before-pivot hook should request continuation when pivot has no diagnosis",
  );

  const withDiagnosis = await executeStopHooks(hooks, {
    messages: [],
    assistantMessage: makeAssistantMessage(
      "Switched to an alternative approach because the root cause was missing filesystem permission.",
      steps,
    ),
    iteration: 3,
  });
  assert(
    withDiagnosis.continuationMessages.length === 0,
    "diagnose-before-pivot hook should not trigger when diagnosis is disclosed",
  );
}

async function verifyFaithfulReportingHook() {
  const hooks = createDefaultStopHooks("en-US");

  const withoutVerification = await executeStopHooks(hooks, {
    messages: [],
    assistantMessage: makeAssistantMessage("All tests passed and the build is successful.", []),
    iteration: 1,
  });
  assert(
    withoutVerification.continuationMessages.length > 0,
    "faithful-reporting hook should request continuation for unverifiable success claims",
  );

  const contradictoryVerification = await executeStopHooks(hooks, {
    messages: [],
    assistantMessage: makeAssistantMessage("All tests passed.", [
      makeFailedToolStep("t1", "shell", `{"cmd":"npm","args":["run","test"]}`),
    ]),
    iteration: 4,
  });
  assert(
    contradictoryVerification.continuationMessages.length > 0,
    "faithful-reporting hook should request continuation for contradictory test claims",
  );
}

function verifyToolRetryGuardHelper() {
  const streaks = new Map<string, { tool: string; streak: number }>();
  const emitted = new Set<string>();
  const signature = "shell::{\"cmd\":\"npm test\"}";

  const first = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "error",
    threshold: 3,
  });
  const second = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "error",
    threshold: 3,
  });
  const third = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "error",
    threshold: 3,
  });
  const fourth = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "error",
    threshold: 3,
  });

  assert(first === null, "first failure should not emit retry guard hint");
  assert(second === null, "second failure should not emit retry guard hint");
  assert(third?.streak === 3, "third failure should emit retry guard hint");
  assert(fourth === null, "same signature should not emit duplicate retry guard hint");

  updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "result",
    threshold: 3,
  });

  const restart1 = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "rejected",
    threshold: 3,
  });
  const restart2 = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "rejected",
    threshold: 3,
  });
  const restart3 = updateToolFailureStreak(streaks, emitted, {
    signature,
    tool: "shell",
    outcome: "rejected",
    threshold: 3,
  });

  assert(restart1 === null && restart2 === null, "retry guard should reset after a successful outcome");
  assert(restart3?.streak === 3, "retry guard should emit again after reset and repeated failures");
}

function verifyAuthorizationScopeHelpers() {
  const counts = new Map<string, number>([["shell", 2]]);
  const priorTracked = getPriorScopedApprovalsForTool(counts, "shell", "critical");
  assert(
    priorTracked.trackedRiskClass === "critical" && priorTracked.priorApprovals === 2,
    "critical risk should return tracked prior approval count",
  );

  const priorUntracked = getPriorScopedApprovalsForTool(counts, "shell", "policy");
  assert(
    priorUntracked.trackedRiskClass === undefined && priorUntracked.priorApprovals === 0,
    "policy risk should not be tracked for scoped authorization reminders",
  );

  const noted = noteScopedAuthorizationApproval(counts, "shell", "critical");
  assert(
    noted.previousApprovals === 2 && noted.nextApprovals === 3,
    "noteScopedAuthorizationApproval should increase tracked approval counts",
  );

  const ignored = noteScopedAuthorizationApproval(counts, "shell", "policy");
  assert(
    ignored.trackedRiskClass === undefined && (counts.get("shell") ?? 0) === 3,
    "noteScopedAuthorizationApproval should ignore untracked risks",
  );
}

async function main() {
  await verifyDiagnoseBeforePivotHook();
  console.log("PASS stop hook: diagnose-before-pivot");

  await verifyFaithfulReportingHook();
  console.log("PASS stop hook: faithful-reporting");

  verifyToolRetryGuardHelper();
  console.log("PASS guard helper: tool retry guard");

  verifyAuthorizationScopeHelpers();
  console.log("PASS guard helper: authorization scope");

  console.log("All agent guardrail verification cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
