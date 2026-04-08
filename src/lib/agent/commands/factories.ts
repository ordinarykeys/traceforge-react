import { invoke } from "@tauri-apps/api/core";
import { translate, type AppLocale } from "@/lib/i18n";
import {
  getRecoverDoctorRecommendationDescriptor,
  type RecoverDoctorRecommendation,
} from "../recoveryPolicy";
import {
  prioritizeDoctorRecommendations,
  type DoctorRecommendationEntry,
  type DoctorRecommendationId,
} from "../diagnosisRecommendationPolicy";
import {
  deriveDoctorOperationalSectionRuntime,
} from "../doctorOperationalSectionRuntime";
import { deriveDoctorPromptSectionLineDescriptors } from "../doctorPromptRuntime";
import { deriveDoctorQueueSectionRuntime } from "../doctorQueueSectionRuntime";
import { deriveDoctorRecoverySectionRuntime } from "../doctorRecoverySectionRuntime";
import { deriveDoctorPermissionSectionRuntime } from "../doctorPermissionSectionRuntime";
import { deriveDoctorQueueInvestigateRuntime } from "../doctorQueueInvestigateRuntime";
import { deriveDoctorFallbackInvestigateRuntime } from "../doctorFallbackInvestigateRuntime";
import {
  deriveDoctorRecoverInvestigateRuntime,
  deriveDoctorRecoverInvestigateStats,
} from "../doctorRecoverInvestigateRuntime";
import {
  deriveDoctorApiStateLine,
  deriveDoctorGitLineFromError,
  deriveDoctorGitLineFromSnapshot,
  deriveDoctorWorkspaceFail,
  deriveDoctorWorkspaceMissing,
  deriveDoctorWorkspaceOk,
  type DoctorEnvironmentEvaluation,
} from "../doctorEnvironmentRuntime";
import {
  getDoctorRecommendationTextDescriptor,
  getDoctorRecommendationTextVars,
} from "../doctorRecommendationTextRuntime";
import {
  formatDoctorLine,
} from "../doctorLineRuntime";
import { createDoctorSectionComposer } from "../doctorSectionRuntime";
import {
  buildRecoverContinuePromptFingerprintSet,
  deriveQueuePressure,
  normalizeRecoverContinuePromptFingerprint,
  RECOVER_CONTINUE_PROMPT_LOCALES,
  type RecoverStateKind,
} from "../recoveryRuntime";
import { buildRecoverCommandRuntimeSnapshot } from "../recoverCommandRuntime";
import { deriveTraceCommandParseSnapshot } from "../traceCommandParseRuntime";
import { createTraceAppliedFilterLabelOptions } from "../traceFilterLabelOptionsRuntime";
import { deriveTraceVisibilitySnapshot } from "../traceVisibilityRuntime";
import {
  buildTraceFallbackStats,
  buildTraceQueuePriorityStats,
  buildTraceQueueReasonStats,
  type TraceQueuePriority,
} from "../traceSummaryRuntime";
import {
  parseQueueOpsActionFilter,
  parseQueueOpsPriorityFilter,
  parseQueueOpsReasonFilter,
} from "../queueOpsFilterRuntime";
import {
  collectQueueUpdateEvents,
  deriveQueueOpsSummarySnapshot,
  filterQueueOpsEvents,
} from "../queueOpsRuntime";
import {
  deriveCompactDuplicateRemovalPlan,
  deriveHealDuplicateRemovalPlan,
  deriveStaleQueuedQueryIds,
} from "../queueMaintenanceRuntime";
import {
  buildRecoverResumeFailedLineDescriptors,
  buildRecoverResumeNoInterruptionLineDescriptors,
  buildRecoverResumeQueueFullLineDescriptors,
  buildRecoverResumeQueuedLineDescriptors,
  buildRecoverResumeQueuedReuseLineDescriptors,
  buildRecoverResumeStartedLineDescriptors,
  deriveRecoverResumePolicy,
  shouldPromoteRecoverQueuedPriority,
  type RecoverResumeLineDescriptor,
} from "../recoverResumeRuntime";
import {
  deriveTraceInvestigateMessage,
  deriveTraceInvestigateSubmitResultLine,
} from "../traceInvestigateMessageRuntime";
import { deriveTraceInvestigateActionPlan } from "../traceInvestigateActionRuntime";
import { deriveTraceListMessage } from "../traceListMessageRuntime";
import { deriveTraceSummarySnapshot } from "../traceSummaryRenderRuntime";
import { deriveTraceHotspotsMessage } from "../traceHotspotsMessageRuntime";
import { deriveTraceSummaryMessage } from "../traceSummaryMessageRuntime";
import {
  createTraceHotspotsMessageOptions,
  createTraceInvestigateMessageOptions,
  createTraceListMessageOptions,
  createTraceSummaryMessageOptions,
} from "../traceMessageOptionsRuntime";
import { deriveTraceAppliedFilterLabelSnapshot } from "../traceFilterRuntime";
import {
  buildToolBudgetGuardReasonStats,
  buildToolFailureClassStats,
  collectToolFailureClassCounts,
  countToolBudgetGuards,
} from "../traceToolingRuntime";
import {
  formatTraceFallbackSuppressedReasonLabel,
  formatTraceRetryStrategyLabel,
  formatTraceTerminalReasonLabel,
  formatTraceToolBudgetReasonLabel,
  formatTraceToolFailureClassLabel,
} from "../traceLabelRuntime";
import { renderTraceEventLine } from "../traceEventRendererRuntime";
import type { QueuePriority, ToolCallBudgetPolicy } from "../QueryEngine";
import type { PermissionRule } from "../permissions/toolPermissions";
import type { AgentTask, AgentTaskStatus } from "../tasks/types";
import type {
  PromptCompiledSectionMetadata,
  QueryStreamEvent,
} from "../query/events";
import type {
  CommandContext,
  CommandResult,
  ParsedSlashCommand,
  SlashCommand,
  SlashCommandDescriptor,
} from "./types";

function formatDateTime(locale: AppLocale, value: number): string {
  return new Date(value).toLocaleString(locale);
}

function formatTime(locale: AppLocale, value: number): string {
  return new Date(value).toLocaleTimeString(locale);
}

function traceTranslate(context: CommandContext) {
  return (key: string, vars?: Record<string, string | number>) =>
    context.t(key as any, vars);
}

const DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT = 50;
const RECOVER_CONTINUE_PROMPT_FINGERPRINTS = buildRecoverContinuePromptFingerprintSet(
  RECOVER_CONTINUE_PROMPT_LOCALES.map((locale) =>
    translate(locale as AppLocale, "agent.command.recover.continuePrompt"),
  ),
);

function isRecoverContinuePrompt(query: string): boolean {
  return RECOVER_CONTINUE_PROMPT_FINGERPRINTS.has(normalizeRecoverContinuePromptFingerprint(query));
}

function parseKeyValueArgs(args: string[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const token of args) {
    const index = token.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = token.slice(0, index).trim().toLowerCase();
    const value = token.slice(index + 1).trim();
    if (!key || value.length === 0) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function parseNonNegativeNumber(value: string | undefined, fallback = 0): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.round(parsed));
}

const QUEUE_HEAL_STALE_AGE_MS = 10 * 60_000;

function parseToolBudgetPolicyPatch(args: string[]): {
  patch: Partial<ToolCallBudgetPolicy>;
  unknownKeys: string[];
  invalidKeys: string[];
} {
  const kv = parseKeyValueArgs(args);
  const patch: Partial<ToolCallBudgetPolicy> = {};
  const unknownKeys: string[] = [];
  const invalidKeys: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(kv)) {
    const key = rawKey.replace(/[\s_-]+/g, "").toLowerCase();
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      invalidKeys.push(rawKey);
      continue;
    }
    const rounded = Math.round(parsed);
    switch (key) {
      case "readonly":
      case "readbase":
      case "readonlybase":
      case "ro":
        patch.readOnlyBase = rounded;
        break;
      case "mutating":
      case "mutate":
      case "writebase":
      case "mutatingbase":
      case "rw":
        patch.mutatingBase = rounded;
        break;
      case "shell":
      case "shellbase":
        patch.shellBase = rounded;
        break;
      case "backoff":
      case "backoffstep":
      case "failurebackoffstep":
        patch.failureBackoffStep = rounded;
        break;
      case "min":
      case "minimum":
        patch.minimum = rounded;
        break;
      default:
        unknownKeys.push(rawKey);
        break;
    }
  }
  return {
    patch,
    unknownKeys,
    invalidKeys,
  };
}

function formatTraceEventLine(context: CommandContext, event: QueryStreamEvent): string {
  const t = traceTranslate(context);
  return renderTraceEventLine(
    {
      t,
    },
    event,
  );
}

function summarizePromptGovernance(sectionMetadata: PromptCompiledSectionMetadata[]) {
  const ownerCounts = {
    core: 0,
    safeguards: 0,
    runtime: 0,
  };
  let immutableCount = 0;
  let modelLaunchCount = 0;
  for (const section of sectionMetadata) {
    ownerCounts[section.owner] += 1;
    if (!section.mutable) {
      immutableCount += 1;
    }
    if (section.modelLaunchTag) {
      modelLaunchCount += 1;
    }
  }
  return {
    ownerCounts,
    immutableCount,
    modelLaunchCount,
  };
}

function getDominantQueuePriorityLabel(
  context: CommandContext,
  counter: Record<TraceQueuePriority, number>,
): string {
  const now = counter.now;
  const next = counter.next;
  const later = counter.later;
  if (now === 0 && next === 0 && later === 0) {
    return context.t("agent.command.notSet");
  }
  if (now >= next && now >= later) {
    return context.t("agent.queue.priority.now");
  }
  if (next >= now && next >= later) {
    return context.t("agent.queue.priority.next");
  }
  return context.t("agent.queue.priority.later");
}

function formatTaskStatus(context: CommandContext, status: AgentTaskStatus): string {
  switch (status) {
    case "pending":
      return context.t("agent.command.task.status.pending");
    case "running":
      return context.t("agent.command.task.status.running");
    case "completed":
      return context.t("agent.command.task.status.completed");
    case "failed":
      return context.t("agent.command.task.status.failed");
    case "killed":
      return context.t("agent.command.task.status.killed");
    default:
      return status;
  }
}

function formatTask(task: AgentTask, context: CommandContext): string {
  const end = task.endTime ? formatTime(context.locale, task.endTime) : context.t("agent.command.notSet");
  return context.t("agent.command.task.listItem", {
    id: task.id,
    status: formatTaskStatus(context, task.status),
    type: task.type,
    description: task.description,
    end,
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRecoverReasonLabel(context: CommandContext, kind: Exclude<RecoverStateKind, "none">): string {
  return context.t(`agent.command.recover.reason.${kind}`);
}

function renderRecoverResumeLines(
  context: CommandContext,
  lines: readonly RecoverResumeLineDescriptor[],
): string {
  return lines
    .map((line) => context.t(line.key as any, line.vars))
    .join("\n");
}

function getRecoverRecommendationEntry(
  context: CommandContext,
  recommendation: RecoverDoctorRecommendation,
): DoctorRecommendationEntry {
  return {
    id: recommendation,
    text: context.t(getRecoverDoctorRecommendationDescriptor(recommendation).doctorTextKey),
  };
}

function getDoctorRecommendationText(
  context: CommandContext,
  id: DoctorRecommendationId,
  options?: { workspace?: string | null },
): string {
  const descriptor = getDoctorRecommendationTextDescriptor(id);
  const vars = getDoctorRecommendationTextVars(id, {
    workspace: options?.workspace,
    fallbackWorkspace: context.workingDir ?? context.t("agent.command.notSet"),
  });
  return context.t(descriptor.key, vars);
}

function buildRecoverInvestigateMessage(context: CommandContext, kv: Record<string, string>): string {
  const recentEvents = context.getRecentQueryEvents(320);
  const queuedQueries = context.getQueuedQueries();
  const currentQueueCount = Math.max(0, queuedQueries.length);
  const queueLimit = parseNonNegativeNumber(kv.queue_limit, Math.max(0, context.queueLimit));
  const queueCount = parseNonNegativeNumber(kv.queue_count, currentQueueCount);
  const recoverRuntimeSnapshot = buildRecoverCommandRuntimeSnapshot({
    messages: context.getMessages(),
    queuedQueries,
    queueLimit: context.queueLimit,
    queueCountOverride: queueCount,
    queueLimitOverride: queueLimit,
    events: recentEvents,
    queuedRecoveryMatcher: isRecoverContinuePrompt,
  });
  const state = recoverRuntimeSnapshot.state;
  const recoverSignals = recoverRuntimeSnapshot.signals;
  const stats = deriveDoctorRecoverInvestigateStats(recoverSignals);
  const runningTasks = context.taskManager.listTasks().filter((task) => task.status === "running").length;
  const pressure = deriveQueuePressure(queueCount, queueLimit);
  const pressureLabel = context.t(`agent.trace.queuePressure.${pressure}`);
  const stateLabel =
    state.kind === "none"
      ? context.t("agent.command.status.recovery.none")
      : formatRecoverReasonLabel(context, state.kind);
  const messageId = state.lastMessageId ?? context.t("agent.command.notSet");
  const recoverInvestigateRuntime = deriveDoctorRecoverInvestigateRuntime({
    stateKind: state.kind,
    stateLabel,
    messageIdLabel: messageId,
    queueCount,
    queueLimit,
    pressureLabel,
    runningTaskCount: runningTasks,
    stats,
    queueDeduplicatedCount: recoverSignals.queueDeduplicatedCount,
    queueRejectedCount: recoverSignals.queueRejectedCount,
    failureTotal: recoverSignals.failureTotal,
    formatNumber,
  });
  return recoverInvestigateRuntime.lines
    .map((line) => context.t(line.key, line.vars))
    .join("\n");
}

function unknownSubcommand(context: CommandContext, base: string): CommandResult {
  return {
    error: true,
    message: context.t("agent.command.unknownSubcommand", { base }),
  };
}

function buildWorkspaceRules(root: string): PermissionRule[] {
  const ts = Date.now();
  return [
    {
      id: `allow-file-write-${ts}`,
      tool: "file_write",
      behavior: "allow",
      mode: "default",
      matcher: { type: "path_prefix", value: root },
      description: "Allow file_write inside current workspace path",
    },
    {
      id: `allow-shell-cwd-${ts + 1}`,
      tool: "shell",
      behavior: "allow",
      mode: "default",
      matcher: { type: "path_prefix", value: root },
      description: "Allow shell commands under current workspace path",
    },
  ];
}

function readTaskOutput(context: CommandContext, taskId: string, limit = 40): CommandResult {
  const task = context.taskManager.getTask(taskId);
  if (!task) {
    return { error: true, message: context.t("agent.command.task.notFound", { taskId }) };
  }
  const start = Math.max(0, task.outputOffset - Math.max(1, limit));
  const chunk = context.taskManager.readOutput(taskId, start, limit);
  if (!chunk) {
    return { error: true, message: context.t("agent.command.task.outputUnavailable", { taskId }) };
  }
  const header = context.t("agent.command.task.outputHeader", {
    taskId: task.id,
    status: formatTaskStatus(context, task.status),
    from: chunk.fromOffset,
    next: chunk.nextOffset,
  });
  const body =
    chunk.lines.length > 0 ? chunk.lines.join("\n") : context.t("agent.command.task.outputEmpty");
  return { message: `${header}\n${body}` };
}

interface ShellRiskRule {
  label: string;
  pattern: RegExp;
}

const HIGH_RISK_SHELL_RULES: ShellRiskRule[] = [
  { label: "rm-rf", pattern: /(^|\s)rm\s+-rf\b/i },
  { label: "remove-item-recurse-force", pattern: /\bremove-item\b[^\n]*\b-recurse\b[^\n]*\b-force\b/i },
  { label: "rmdir-s-q", pattern: /\brmdir\b[^\n]*\b\/s\b[^\n]*\b\/q\b/i },
  { label: "del-force", pattern: /(^|\s)(del|erase)\b[^\n]*\b\/f\b/i },
  { label: "git-reset-hard", pattern: /\bgit\s+reset\s+--hard\b/i },
  { label: "git-clean-force", pattern: /\bgit\s+clean\b[^\n]*\s-f\b/i },
  { label: "git-push-force", pattern: /\bgit\s+push\b[^\n]*\s--force(?:-with-lease)?\b/i },
  { label: "git-branch-delete", pattern: /\bgit\s+branch\s+-D\b/i },
  { label: "drop-database-table", pattern: /\bdrop\s+(database|table)\b/i },
  { label: "truncate-table", pattern: /\btruncate\s+table\b/i },
  { label: "diskpart", pattern: /\bdiskpart\b/i },
  { label: "format-drive", pattern: /\bformat\s+[a-z]:/i },
  { label: "shutdown", pattern: /\bshutdown\b/i },
];

function detectHighRiskShellSignals(command: string): string[] {
  const normalized = command.trim();
  if (!normalized) {
    return [];
  }
  const matched = new Set<string>();
  for (const rule of HIGH_RISK_SHELL_RULES) {
    if (rule.pattern.test(normalized)) {
      matched.add(rule.label);
    }
  }
  return [...matched];
}

async function runShellTask(context: CommandContext, tokens: string[]): Promise<CommandResult> {
  if (tokens.length === 0) {
    return {
      error: true,
      message: context.t("agent.command.task.usage.runShell"),
    };
  }

  let cwd = context.workingDir;
  let explicitConfirm = false;
  const commandTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--confirm") {
      explicitConfirm = true;
      continue;
    }
    if (token === "--cwd") {
      cwd = tokens[i + 1] ?? cwd;
      i += 1;
      continue;
    }
    commandTokens.push(token);
  }

  if (commandTokens.length === 0) {
    return {
      error: true,
      message: context.t("agent.command.task.runShellMissingExecutable"),
    };
  }

  const [cmd, ...args] = commandTokens;
  const shellPreview = [cmd, ...args].join(" ");
  const riskSignals = detectHighRiskShellSignals(shellPreview);
  if (riskSignals.length > 0 && !explicitConfirm) {
    return {
      error: true,
      message: [
        context.t("agent.command.task.runShellRiskBlocked"),
        context.t("agent.command.task.runShellRiskCommand", { command: shellPreview }),
        context.t("agent.command.task.runShellRiskSignals", { signals: riskSignals.join(", ") }),
        context.t("agent.command.task.runShellRiskConfirmHint"),
      ].join("\n"),
    };
  }

  const task = context.taskManager.createTask({
    type: "local_bash",
    description: `shell ${shellPreview}`,
    metadata: { cmd, args, cwd: cwd ?? null },
    run: async ({ log }) => {
      log(context.t("agent.command.task.logShell", { command: shellPreview }));
      const response: any = await invoke("invoke_agent_task_execution", {
        request: {
          cmd,
          args,
          cwd: cwd ?? null,
          timeout_ms: 300000,
        },
      });

      if (response.stdout) {
        log(String(response.stdout));
      }
      if (response.stderr) {
        log(context.t("agent.command.task.logStderr", { stderr: String(response.stderr) }));
      }
      if (!response.success && !response.interrupted) {
        throw new Error(`Exit code ${response.exit_code ?? "unknown"}`);
      }
      if (response.interrupted) {
        log(context.t("agent.command.task.logTimeout"));
      }
    },
  });

  return {
    message: [
      context.t("agent.command.task.created", { taskId: task.id }),
      context.t("agent.command.task.createdType", { type: task.type }),
      context.t("agent.command.task.createdDescription", { description: task.description }),
      context.t("agent.command.task.createdHint", { taskId: task.id }),
    ].join("\n"),
  };
}

export const helpCommand: SlashCommand = {
  name: "help",
  aliases: ["h", "?"],
  category: "core",
  descriptionKey: "agent.command.help.description",
  usageKey: "agent.command.help.usage",
  execute: async (context) => {
    const descriptors = context.getCommandDescriptors();
    if (descriptors.length === 0) {
      return { message: `${context.t("agent.command.help.title")}\n${context.t("agent.command.help.empty")}` };
    }

    const lines = descriptors.map((descriptor) => {
      const aliasPart =
        descriptor.aliases.length > 0
          ? ` ${context.t("agent.command.help.aliases", {
              aliases: descriptor.aliases.map((alias) => `/${alias}`).join(" "),
            })}`
          : "";
      return `/${descriptor.name}${aliasPart} -> ${descriptor.usage} :: ${descriptor.description}`;
    });

    return {
      message: [context.t("agent.command.help.title"), ...lines].join("\n"),
    };
  },
};

export const toolsCommand: SlashCommand = {
  name: "tools",
  category: "tools",
  descriptionKey: "agent.command.tools.description",
  usageKey: "agent.command.tools.usage",
  execute: async (context) => {
    const tools = context.getToolNames();
    return {
      message: [
        context.t("agent.command.tools.title", { count: tools.length }),
        ...(tools.length > 0 ? tools.map((name) => `- ${name}`) : [context.t("agent.command.tools.empty")]),
      ].join("\n"),
    };
  },
};

export const statusCommand: SlashCommand = {
  name: "status",
  aliases: ["st"],
  category: "core",
  descriptionKey: "agent.command.status.description",
  usageKey: "agent.command.status.usage",
  execute: async (context) => {
    const tTrace = traceTranslate(context);
    const tasks = context.taskManager.listTasks();
    const runningTasks = tasks.filter((task) => task.status === "running").length;
    const queuePressureLabel = context.t(`agent.trace.queuePressure.${deriveQueuePressure(context.queueCount, context.queueLimit)}`);
    const recentEvents = context.getRecentQueryEvents(160);
      const failureClassStats = buildToolFailureClassStats({
        events: recentEvents,
        formatFailureClassLabel: (failureClass) =>
          formatTraceToolFailureClassLabel(tTrace, failureClass),
      });
    const budgetGuardCount = countToolBudgetGuards(recentEvents);
    const toolBudgetPolicy = context.getToolCallBudgetPolicy();
    const recoverRuntimeSnapshot = buildRecoverCommandRuntimeSnapshot({
      messages: context.getMessages(),
      queuedQueries: context.getQueuedQueries(),
      queueLimit: context.queueLimit,
      queuedRecoveryMatcher: isRecoverContinuePrompt,
    });
    const recoverState = recoverRuntimeSnapshot.state;
    const recoveryStatus =
      recoverState.kind === "none"
        ? context.t("agent.command.status.recovery.none")
        : context.t(`agent.command.status.recovery.${recoverState.kind}`);
    const recoverPlan = recoverRuntimeSnapshot.plan;
    return {
      message: [
        context.t("agent.command.status.title"),
        context.t("agent.command.status.thread", { thread: context.threadId ?? context.t("agent.command.notSet") }),
        context.t("agent.command.status.workspace", {
          workspace: context.workingDir ?? context.t("agent.command.notSet"),
        }),
        context.t("agent.command.status.model", {
          model: context.currentModel ?? context.t("agent.command.unknown"),
        }),
        context.t("agent.command.status.queue", {
          queue: `${context.queueCount}/${context.queueLimit}`,
        }),
        context.t("agent.command.status.queuePriority", {
          nowLabel: context.t("agent.queue.priority.now"),
          now: context.queueByPriority.now,
          nextLabel: context.t("agent.queue.priority.next"),
          next: context.queueByPriority.next,
          laterLabel: context.t("agent.queue.priority.later"),
          later: context.queueByPriority.later,
        }),
        context.t("agent.command.status.queuePressure", {
          pressure: queuePressureLabel,
        }),
        context.t("agent.command.status.recovery", {
          status: recoveryStatus,
        }),
        context.t("agent.command.status.recoveryQueue", {
          count: recoverPlan.queuedRecovery ? 1 : 0,
          id: recoverPlan.queuedRecovery?.id ?? context.t("agent.command.notSet"),
        }),
        context.t("agent.command.status.recoveryPlan", {
          plan: context.t(`agent.command.recover.plan.${recoverPlan.kind}`),
        }),
        context.t("agent.command.status.tasks", { running: runningTasks, total: tasks.length }),
        context.t("agent.command.status.tools", { count: context.getToolNames().length }),
        context.t("agent.command.status.permissionMode", { mode: context.permissionMode }),
        context.t("agent.command.status.permissionRules", { count: context.permissionRules.length }),
        context.t("agent.command.status.toolBudgetPolicy", {
          readOnlyBase: toolBudgetPolicy.readOnlyBase,
          mutatingBase: toolBudgetPolicy.mutatingBase,
          shellBase: toolBudgetPolicy.shellBase,
          minimum: toolBudgetPolicy.minimum,
          failureBackoffStep: toolBudgetPolicy.failureBackoffStep,
        }),
        context.t("agent.command.status.failureClasses", {
          details: failureClassStats.total > 0 ? failureClassStats.parts : "-",
        }),
        context.t("agent.command.status.budgetGuards", { count: budgetGuardCount }),
      ].join("\n"),
    };
  },
};

export const queueCommand: SlashCommand = {
  name: "queue",
  aliases: ["q"],
  category: "core",
  descriptionKey: "agent.command.queue.description",
  usageKey: "agent.command.queue.usage",
  execute: async (context) => {
    const action = context.parsed.args[0]?.toLowerCase() ?? "list";
    const queued = context.getQueuedQueries();
    const queueSummaryLine = context.t("agent.command.queue.summary", {
      count: queued.length,
      limit: context.queueLimit,
      now: context.queueByPriority.now,
      next: context.queueByPriority.next,
      later: context.queueByPriority.later,
      nowLabel: context.t("agent.queue.priority.now"),
      nextLabel: context.t("agent.queue.priority.next"),
      laterLabel: context.t("agent.queue.priority.later"),
    });

    if (action === "list" || action === "ls" || action === "status") {
      if (queued.length === 0) {
        return {
          message: [
            context.t("agent.command.queue.title"),
            queueSummaryLine,
            context.t("agent.command.queue.empty"),
          ].join("\n"),
        };
      }
      const lines = queued.map((item) => {
        const previewRaw = item.query.trim().replace(/\s+/g, " ");
        const preview =
          previewRaw.length > 80 ? `${previewRaw.slice(0, 77)}...` : previewRaw;
        return context.t("agent.command.queue.item", {
          id: item.id,
          priority: context.t(`agent.queue.priority.${item.priority}`),
          queuedAt: formatTime(context.locale, item.queuedAt),
          model: item.model,
          preview,
        });
      });
      return {
        message: [
          context.t("agent.command.queue.title"),
          queueSummaryLine,
          ...lines,
        ].join("\n"),
      };
    }

    if (action === "clear") {
      let removed = 0;
      for (const item of queued) {
        if (context.removeQueuedQuery(item.id)) {
          removed += 1;
        }
      }
      return {
        message: context.t("agent.command.queue.cleared", {
          removed,
          remaining: context.getQueuedQueries().length,
        }),
      };
    }

    if (action === "ops" || action === "events" || action === "history") {
      const rawArgs = context.parsed.args.slice(1);
      const firstArg = rawArgs[0]?.trim();
      const positionalLimit =
        firstArg && /^\d+$/.test(firstArg) ? parseNonNegativeNumber(firstArg, 12) : null;
      const kv = parseKeyValueArgs(rawArgs);
      const limit = parseNonNegativeNumber(
        kv.limit ?? kv.last ?? (positionalLimit !== null ? String(positionalLimit) : undefined),
        12,
      );
      const cappedLimit = Math.min(Math.max(limit, 1), 120);
      const summaryMode =
        rawArgs.some((token) => /^(summary|stats|overview)$/i.test(token)) ||
        (kv.view?.toLowerCase() ?? "") === "summary";
      const actionFilter = parseQueueOpsActionFilter(kv.action ?? kv.a);
      const reasonFilter = parseQueueOpsReasonFilter(kv.reason ?? kv.r);
      const priorityFilter = parseQueueOpsPriorityFilter(kv.priority ?? kv.p);
      if (actionFilter === "invalid" || reasonFilter === "invalid" || priorityFilter === "invalid") {
        return {
          error: true,
          message: context.t("agent.command.queue.opsInvalidFilter"),
        };
      }
      const queueEvents = collectQueueUpdateEvents(context.getRecentQueryEvents(500));
      const filtered = filterQueueOpsEvents({
        events: queueEvents,
        actionFilter,
        reasonFilter,
        priorityFilter,
        limit: cappedLimit,
      });
      if (filtered.length === 0) {
        return {
          message: [
            context.t("agent.command.queue.opsTitle", { count: 0 }),
            context.t("agent.command.queue.opsEmpty"),
          ].join("\n"),
        };
      }
      const queueEventsDesc = [...filtered].reverse();
      const lines = queueEventsDesc.map((event) =>
        context.t("agent.command.queue.opsLine", {
          at: formatTime(context.locale, event.at),
          action: context.t(`agent.trace.queueAction.${event.action}`),
          queueCount: event.queueCount,
          queueLimit: event.queueLimit,
          priority: event.priority
            ? context.t(`agent.queue.priority.${event.priority}`)
            : context.t("agent.command.notSet"),
          reason: event.reason
            ? context.t(`agent.trace.queueReason.${event.reason}`)
            : context.t("agent.command.notSet"),
        }),
      );
      if (!summaryMode) {
        return {
          message: [
            context.t("agent.command.queue.opsTitle", { count: queueEventsDesc.length }),
            ...lines,
          ].join("\n"),
        };
      }
      const summarySnapshot = deriveQueueOpsSummarySnapshot({
        events: filtered,
        fallbackLimit: context.queueLimit,
      });
      const pressure = deriveQueuePressure(
        Math.max(summarySnapshot.latestDepth, summarySnapshot.maxDepth),
        summarySnapshot.effectiveLimit,
      );
      const pressureLabel = context.t(`agent.trace.queuePressure.${pressure}`);
      return {
        message: [
          context.t("agent.command.queue.opsTitle", { count: queueEventsDesc.length }),
          context.t("agent.command.queue.opsSummaryWindow", {
            count: queueEventsDesc.length,
            pressure: pressureLabel,
            latest: summarySnapshot.latestDepth,
            max: summarySnapshot.maxDepth,
            limit: summarySnapshot.effectiveLimit,
          }),
          context.t("agent.command.queue.opsSummaryActions", {
            queued: summarySnapshot.actionStats.queued,
            dequeued: summarySnapshot.actionStats.dequeued,
            rejected: summarySnapshot.actionStats.rejected,
          }),
          context.t("agent.command.queue.opsSummaryReasons", {
            capacity: summarySnapshot.reasonStats.capacity,
            stale: summarySnapshot.reasonStats.stale,
            manual: summarySnapshot.reasonStats.manual,
            deduplicated: summarySnapshot.reasonStats.deduplicated,
            none: summarySnapshot.reasonStats.none,
          }),
          context.t("agent.command.queue.opsSummaryPriorities", {
            now: summarySnapshot.priorityStats.now,
            next: summarySnapshot.priorityStats.next,
            later: summarySnapshot.priorityStats.later,
            none: summarySnapshot.priorityStats.none,
          }),
          context.t("agent.command.queue.opsSummaryRecent"),
          ...lines,
        ].join("\n"),
      };
    }

    if (action === "heal" || action === "relieve" || action === "repair") {
      const beforeCount = queued.length;
      const staleIds = deriveStaleQueuedQueryIds({
        items: queued,
        now: Date.now(),
        staleAgeMs: QUEUE_HEAL_STALE_AGE_MS,
      });
      let staleRemoved = 0;
      let duplicateRemoved = 0;
      for (const staleId of staleIds) {
        if (context.removeQueuedQuery(staleId)) {
          staleRemoved += 1;
        }
      }

      const duplicatePlan = deriveHealDuplicateRemovalPlan(context.getQueuedQueries());
      for (const duplicateId of duplicatePlan.removeIds) {
        if (context.removeQueuedQuery(duplicateId)) {
          duplicateRemoved += 1;
        }
      }

      const afterCount = context.getQueuedQueries().length;
      if (staleRemoved === 0 && duplicateRemoved === 0) {
        return {
          message: context.t("agent.command.queue.healNoChange", {
            before: beforeCount,
            after: afterCount,
          }),
        };
      }
      return {
        message: [
          context.t("agent.command.queue.healSummary", {
            before: beforeCount,
            after: afterCount,
          }),
          context.t("agent.command.queue.healStaleRemoved", {
            count: staleRemoved,
            minutes: Math.round(QUEUE_HEAL_STALE_AGE_MS / 60_000),
          }),
          context.t("agent.command.queue.healDuplicateRemoved", {
            removed: duplicateRemoved,
            groups: duplicatePlan.duplicateGroups,
          }),
          context.t("agent.command.queue.healNextStep"),
        ].join("\n"),
      };
    }

    if (action === "compact" || action === "dedupe") {
      const compactPlan = deriveCompactDuplicateRemovalPlan(queued);
      let removed = 0;
      for (const duplicateId of compactPlan.removeIds) {
        if (context.removeQueuedQuery(duplicateId)) {
          removed += 1;
        }
      }
      if (removed === 0) {
        return {
          message: context.t("agent.command.queue.compactNoChange"),
        };
      }
      return {
        message: context.t("agent.command.queue.compactResult", {
          removed,
          groups: compactPlan.duplicateGroups,
          remaining: context.getQueuedQueries().length,
        }),
      };
    }

    if (action === "remove" || action === "rm" || action === "delete") {
      const queueId = context.parsed.args[1]?.trim();
      if (!queueId) {
        return {
          error: true,
          message: context.t("agent.command.queue.missingId"),
        };
      }
      const removed = context.removeQueuedQuery(queueId);
      if (!removed) {
        return {
          error: true,
          message: context.t("agent.command.queue.notFound", { id: queueId }),
        };
      }
      return {
        message: context.t("agent.command.queue.removed", { id: queueId }),
      };
    }

    if (
      action === "priority" ||
      action === "prio" ||
      action === "set-priority" ||
      action === "now" ||
      action === "next" ||
      action === "later"
    ) {
      const directPriority = action === "now" || action === "next" || action === "later" ? action : null;
      const queueId = directPriority ? context.parsed.args[1]?.trim() : context.parsed.args[1]?.trim();
      const priorityRaw = directPriority ?? context.parsed.args[2]?.trim().toLowerCase();
      if (!queueId) {
        return {
          error: true,
          message: context.t("agent.command.queue.missingId"),
        };
      }
      if (priorityRaw !== "now" && priorityRaw !== "next" && priorityRaw !== "later") {
        return {
          error: true,
          message: context.t("agent.command.queue.invalidPriority", {
            value: priorityRaw ?? context.t("agent.command.notSet"),
          }),
        };
      }
      const updated = context.setQueuedQueryPriority(queueId, priorityRaw);
      if (!updated) {
        return {
          error: true,
          message: context.t("agent.command.queue.notFound", { id: queueId }),
        };
      }
      return {
        message: context.t("agent.command.queue.priorityUpdated", {
          id: queueId,
          priority: context.t(`agent.queue.priority.${priorityRaw}`),
        }),
      };
    }

    return unknownSubcommand(context, "queue");
  },
};

export const recoverCommand: SlashCommand = {
  name: "recover",
  aliases: ["resume-turn"],
  category: "core",
  descriptionKey: "agent.command.recover.description",
  usageKey: "agent.command.recover.usage",
  execute: async (context) => {
    const action = context.parsed.args[0]?.toLowerCase() ?? "status";
    const recoverRuntimeSnapshot = buildRecoverCommandRuntimeSnapshot({
      messages: context.getMessages(),
      queuedQueries: context.getQueuedQueries(),
      queueLimit: context.queueLimit,
      queuedRecoveryMatcher: isRecoverContinuePrompt,
    });
    const state = recoverRuntimeSnapshot.state;
    const recoverPlan = recoverRuntimeSnapshot.plan;
    const runResume = (autoMode: boolean): CommandResult => {
      const resumePolicy = deriveRecoverResumePolicy({
        autoMode,
        recoverPlanKind: recoverPlan.kind,
      });
      if (state.kind === "none") {
        return {
          message: renderRecoverResumeLines(
            context,
            buildRecoverResumeNoInterruptionLineDescriptors(),
          ),
        };
      }
      const preferredPriority: QueuePriority = resumePolicy.preferredPriority;
      const continuePrompt = context.t("agent.command.recover.continuePrompt");
      const queuedRecovery = recoverPlan.queuedRecovery;
      if (queuedRecovery) {
        const promoted =
          shouldPromoteRecoverQueuedPriority({
            queuedPriority: queuedRecovery.priority,
            preferredPriority,
          }) && context.setQueuedQueryPriority(queuedRecovery.id, preferredPriority);
        return {
          message: renderRecoverResumeLines(
            context,
            buildRecoverResumeQueuedReuseLineDescriptors({
              policyLineKey: resumePolicy.policyLineKey,
              queuedRecoveryId: queuedRecovery.id,
              queueLabel: formatNumber(context.getQueuedQueries().length),
              limitLabel: formatNumber(Math.max(0, context.queueLimit)),
              promoted,
            }),
          ),
        };
      }

      let staleRemoved = 0;
      const staleIds = deriveStaleQueuedQueryIds({
        items: context.getQueuedQueries(),
        now: Date.now(),
        staleAgeMs: QUEUE_HEAL_STALE_AGE_MS,
      });
      for (const staleId of staleIds) {
        if (context.removeQueuedQuery(staleId)) {
          staleRemoved += 1;
        }
      }

      const submitResult = context.submitFollowupQuery(continuePrompt, {
        priority: preferredPriority,
      });
      if (!submitResult.accepted) {
        if (submitResult.reason === "queue_full") {
          return {
            error: true,
            message: renderRecoverResumeLines(
              context,
              buildRecoverResumeQueueFullLineDescriptors({
                policyLineKey: resumePolicy.policyLineKey,
                queueCount: submitResult.queueCount,
                queueLimit: submitResult.queueLimit,
                staleRemoved,
                staleMinutes: Math.round(QUEUE_HEAL_STALE_AGE_MS / 60_000),
              }),
            ),
          };
        }
        return {
          error: true,
          message: renderRecoverResumeLines(
            context,
            buildRecoverResumeFailedLineDescriptors({
              policyLineKey: resumePolicy.policyLineKey,
            }),
          ),
        };
      }
      if (submitResult.started) {
        return {
          message: renderRecoverResumeLines(
            context,
            buildRecoverResumeStartedLineDescriptors({
              policyLineKey: resumePolicy.policyLineKey,
              staleRemoved,
              staleMinutes: Math.round(QUEUE_HEAL_STALE_AGE_MS / 60_000),
            }),
          ),
        };
      }
      return {
        message: renderRecoverResumeLines(
          context,
          buildRecoverResumeQueuedLineDescriptors({
            policyLineKey: resumePolicy.policyLineKey,
            queueCount: submitResult.queueCount,
            queueLimit: submitResult.queueLimit,
            queuedId: submitResult.queuedId,
            staleRemoved,
            staleMinutes: Math.round(QUEUE_HEAL_STALE_AGE_MS / 60_000),
          }),
        ),
      };
    };
    const runExecute = (strictMode: boolean): CommandResult => {
      const resumeResult = runResume(true);
      const checklistLines = [
        context.t("agent.command.recover.executeChecklistTitle"),
        context.t("agent.command.recover.executeChecklistStatus"),
        recoverPlan.kind === "heal_then_resume"
          ? context.t("agent.command.recover.executeChecklistQueueRequired")
          : context.t("agent.command.recover.executeChecklistQueueOptional"),
        context.t("agent.command.recover.executeChecklistInvestigate"),
      ];
      const strictLines = strictMode
        ? [
            context.t("agent.command.recover.executeStrictTitle"),
            context.t(
              resumeResult.error
                ? "agent.command.recover.executeStrictFail"
                : state.kind === "none"
                  ? "agent.command.recover.executeStrictNoop"
                  : "agent.command.recover.executeStrictPass",
            ),
            context.t("agent.command.recover.executeStrictStatusCheck"),
            recoverPlan.kind === "heal_then_resume"
              ? context.t("agent.command.recover.executeStrictQueueCheckRequired")
              : context.t("agent.command.recover.executeStrictQueueCheckOptional"),
          ]
        : [];
      return {
        error: resumeResult.error,
        message: [
          context.t("agent.command.recover.executeTitle"),
          resumeResult.message,
          ...checklistLines,
          ...strictLines,
        ].join("\n"),
      };
    };
    const runPlan = (): CommandResult => {
      const queueCount = Math.max(0, context.getQueuedQueries().length);
      const queueLimit = Math.max(0, context.queueLimit);
      const pressure = deriveQueuePressure(queueCount, queueLimit);
      const pressureLabel = context.t(`agent.trace.queuePressure.${pressure}`);
      const stateLabel =
        state.kind === "none"
          ? context.t("agent.command.status.recovery.none")
          : formatRecoverReasonLabel(context, state.kind);
      const planLabel = context.t(`agent.command.recover.plan.${recoverPlan.kind}`);
      const lines = [
        context.t("agent.command.recover.planTitle"),
        context.t("agent.command.recover.planScope", {
          state: stateLabel,
          plan: planLabel,
          queue: formatNumber(queueCount),
          limit: formatNumber(queueLimit),
          pressure: pressureLabel,
        }),
      ];
      if (recoverPlan.kind === "none") {
        lines.push(context.t("agent.command.recover.planActionNone"));
        return { message: lines.join("\n") };
      }
      if (recoverPlan.kind === "queued_recovery" && recoverPlan.queuedRecovery) {
        lines.push(
          context.t("agent.command.recover.planActionQueued", {
            id: recoverPlan.queuedRecovery.id,
            priority: context.t(`agent.queue.priority.${recoverPlan.queuedRecovery.priority}`),
          }),
        );
      } else {
        if (recoverPlan.kind === "heal_then_resume") {
          lines.push(context.t("agent.command.recover.planActionHeal"));
        }
        lines.push(context.t("agent.command.recover.planActionResume"));
      }
      lines.push(context.t("agent.command.recover.planActionStrict"));
      lines.push(context.t("agent.command.recover.planActionInvestigate"));
      return {
        message: lines.join("\n"),
      };
    };
    if (action === "status" || action === "check") {
      const lines = [
        context.t("agent.command.recover.title"),
        state.kind === "none"
          ? context.t("agent.command.recover.state.none")
          : context.t("agent.command.recover.state.interrupted", {
              reason: formatRecoverReasonLabel(context, state.kind),
              id: state.lastMessageId ?? context.t("agent.command.notSet"),
            }),
        context.t("agent.command.recover.statusPlan", {
          plan: context.t(`agent.command.recover.plan.${recoverPlan.kind}`),
        }),
      ];
      if (recoverPlan.queuedRecovery) {
        lines.push(
          context.t("agent.command.recover.statusQueuedRecovery", {
            id: recoverPlan.queuedRecovery.id,
            priority: context.t(`agent.queue.priority.${recoverPlan.queuedRecovery.priority}`),
          }),
        );
      }
      if (state.kind === "none") {
        return { message: lines.join("\n") };
      }
      lines.push(context.t("agent.command.recover.statusHintPlan"));
      lines.push(context.t("agent.command.recover.hint"));
      return {
        message: lines.join("\n"),
      };
    }

    if (action === "investigate" || action === "diagnose" || action === "debug") {
      return {
        message: buildRecoverInvestigateMessage(context, parseKeyValueArgs(context.parsed.args.slice(1))),
      };
    }

    if (action === "plan" || action === "strategy" || action === "runbook" || action === "playbook") {
      return runPlan();
    }

    if (action === "execute" || action === "one-shot") {
      const executeArgs = context.parsed.args.slice(1).map((arg) => arg.trim().toLowerCase());
      const strictMode = executeArgs.includes("strict") || executeArgs.includes("--strict");
      return runExecute(strictMode);
    }

    if (action === "strict" || action === "gate") {
      return runExecute(true);
    }

    if (action === "resume" || action === "run" || action === "continue" || action === "auto" || action === "smart") {
      return runResume(action === "auto" || action === "smart");
    }

    return {
      error: true,
      message: context.t("agent.command.recover.invalidSubcommand", {
        subcommand: action,
      }),
    };
  },
};

export const budgetCommand: SlashCommand = {
  name: "budget",
  aliases: ["toolbudget", "tb"],
  category: "core",
  descriptionKey: "agent.command.budget.description",
  usageKey: "agent.command.budget.usage",
  execute: async (context) => {
    const action = context.parsed.args[0]?.toLowerCase();
    const formatPolicyLine = (policy: ToolCallBudgetPolicy) =>
      context.t("agent.command.budget.policy", {
        readOnlyBase: policy.readOnlyBase,
        mutatingBase: policy.mutatingBase,
        shellBase: policy.shellBase,
        minimum: policy.minimum,
        failureBackoffStep: policy.failureBackoffStep,
      });

    if (!action || action === "show" || action === "status") {
      const current = context.getToolCallBudgetPolicy();
      return {
        message: [
          context.t("agent.command.budget.title"),
          formatPolicyLine(current),
        ].join("\n"),
      };
    }

    if (action === "reset") {
      const next = context.setToolCallBudgetPolicy(null);
      return {
        message: [
          context.t("agent.command.budget.title"),
          context.t("agent.command.budget.reset"),
          formatPolicyLine(next),
        ].join("\n"),
      };
    }

    if (action === "set") {
      const { patch, unknownKeys, invalidKeys } = parseToolBudgetPolicyPatch(context.parsed.args.slice(1));
      if (Object.keys(patch).length === 0) {
        return {
          error: true,
          message: context.t("agent.command.budget.setMissing"),
        };
      }
      const next = context.setToolCallBudgetPolicy(patch);
      const lines = [
        context.t("agent.command.budget.title"),
        context.t("agent.command.budget.updated"),
        formatPolicyLine(next),
      ];
      if (unknownKeys.length > 0) {
        lines.push(
          context.t("agent.command.budget.unknownKeys", {
            keys: unknownKeys.join(", "),
          }),
        );
      }
      if (invalidKeys.length > 0) {
        lines.push(
          context.t("agent.command.budget.invalidKeys", {
            keys: invalidKeys.join(", "),
          }),
        );
      }
      return { message: lines.join("\n") };
    }

    return {
      error: true,
      message: context.t("agent.command.budget.invalidSubcommand", {
        subcommand: action,
      }),
    };
  },
};

export const usageCommand: SlashCommand = {
  name: "usage",
  aliases: ["cost"],
  category: "core",
  descriptionKey: "agent.command.usage.description",
  usageKey: "agent.command.usage.usage",
  execute: async (context) => {
    const sub = context.parsed.args[0]?.toLowerCase();
    if (sub === "reset") {
      context.resetUsageSnapshot();
      return { message: context.t("agent.command.usage.resetDone") };
    }

    const snapshot = context.getUsageSnapshot();
    const totals = snapshot.totals;
    const lines = [
      context.t("agent.command.usage.title"),
      context.t("agent.command.usage.totals", {
        input: formatNumber(totals.inputTokens),
        output: formatNumber(totals.outputTokens),
        total: formatNumber(totals.totalTokens),
        cached: formatNumber(totals.cachedInputTokens),
      }),
    ];

    if (snapshot.byModel.length === 0) {
      lines.push(context.t("agent.command.usage.empty"));
      return { message: lines.join("\n") };
    }

    lines.push(context.t("agent.command.usage.byModel"));
    for (const item of snapshot.byModel) {
      lines.push(
        context.t("agent.command.usage.modelLine", {
          model: item.model,
          input: formatNumber(item.inputTokens),
          output: formatNumber(item.outputTokens),
          total: formatNumber(item.totalTokens),
          cached: formatNumber(item.cachedInputTokens),
        }),
      );
    }
    return { message: lines.join("\n") };
  },
};

export const traceCommand: SlashCommand = {
  name: "trace",
  aliases: ["events"],
  category: "core",
  descriptionKey: "agent.command.trace.description",
  usageKey: "agent.command.trace.usage",
  execute: async (context) => {
    const tTrace = traceTranslate(context);
    const args = context.parsed.args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
    if (args[0]?.toLowerCase() === "clear") {
      context.clearQueryEvents();
      return { message: context.t("agent.command.trace.cleared") };
    }

    const parseResult = deriveTraceCommandParseSnapshot(args);
    if (!parseResult.ok) {
      return { error: true, message: context.t("agent.command.trace.invalidLimit") };
    }
    const {
      limit,
      filter,
      warningsOnly,
      summaryMode,
      hotspotsMode,
      hottestMode,
      investigateMode,
      investigateRunbookMode,
      investigateWorkflowMode,
      investigateSubmitMode,
      failureFocus,
      toolFocus,
      runWindow,
      riskFilter,
      reversibilityFilter,
      blastRadiusFilter,
    } = parseResult.snapshot;

    const fetchLimit = 80;
    const traceVisibility = deriveTraceVisibilitySnapshot({
      allEvents: context.getRecentQueryEvents(fetchLimit),
      filter,
      riskFilter,
      reversibilityFilter,
      blastRadiusFilter,
      warningsOnly,
      failureFocus,
      toolFocus,
      runWindow,
      hottestMode,
      limit,
    });
    const { effectiveToolFocus, hottestApplied, visibleRuns, visibleEvents } = traceVisibility;

    if (visibleEvents.length === 0) {
      return {
        message: [
          context.t("agent.command.trace.title", { count: 0 }),
          context.t("agent.command.trace.empty"),
        ].join("\n"),
      };
    }

    const filterLabels = deriveTraceAppliedFilterLabelSnapshot(
      createTraceAppliedFilterLabelOptions({
        t: (key, vars) => context.t(key as any, vars),
        filter,
        warningsOnly,
        failureFocus,
        hottestMode,
        hottestApplied,
        effectiveToolFocus,
        runWindow,
        riskFilter,
        reversibilityFilter,
        blastRadiusFilter,
      }),
    );
    const { filterLabel, warningLabel } = filterLabels;

    if (hotspotsMode) {
      const hotspotVisibleEvents = visibleRuns.flatMap((run) => run.visibleEvents);
      return {
        message: deriveTraceHotspotsMessage(createTraceHotspotsMessageOptions({
          t: (key, vars) => context.t(key as any, vars),
          visibleEvents: hotspotVisibleEvents,
          limit,
          queueLimit: context.queueLimit,
          filterLabel,
          warningLabel,
          runWindow,
          riskFilter,
          reversibilityFilter,
          blastRadiusFilter,
          formatNumber,
          formatFailureClassLabel: (failureClass) =>
            formatTraceToolFailureClassLabel(tTrace, failureClass),
          formatPermissionRiskLabel: (risk) => context.t(`agent.trace.permissionRisk.${risk}`),
          formatQueuePressureLabel: (pressure) => context.t(`agent.trace.queuePressure.${pressure}`),
        })),
      };
    }

    if (investigateMode) {
      const investigatePlan = deriveTraceInvestigateActionPlan({
        t: (key, vars) => context.t(key as any, vars),
        visibleEvents: visibleRuns.flatMap((run) => run.visibleEvents),
        runWindow,
        riskFilter,
        reversibilityFilter,
        blastRadiusFilter,
        investigateWorkflowMode,
        investigateSubmitMode,
      });
      const workflowDescriptor = investigatePlan.workflowDescriptor;
      const workflowTask =
        workflowDescriptor
          ? context.taskManager.createTask({
            type: "local_workflow",
            description: workflowDescriptor.description,
            metadata: workflowDescriptor.metadata,
            run: async ({ log }) => {
              log(workflowDescriptor.logHeader);
              for (const line of investigatePlan.runbookLines) {
                log(line);
              }
            },
          })
          : null;
      const submitResult =
        investigatePlan.submitPrompt
          ? context.submitFollowupQuery(
            investigatePlan.submitPrompt,
            {
              model: context.currentModel,
              permissionMode: context.permissionMode,
              priority: "later",
            },
          )
          : null;
      const submitResultLine = deriveTraceInvestigateSubmitResultLine({
        submitResult,
        t: (key, vars) => context.t(key as any, vars),
      });
      return {
        message: deriveTraceInvestigateMessage(createTraceInvestigateMessageOptions({
          t: (key, vars) => context.t(key as any, vars),
          hotspot: investigatePlan.hotspot,
          filterLabel,
          warningLabel,
          runbookLines: investigatePlan.runbookLines,
          investigateRunbookMode,
          investigateWorkflowMode,
          submitResultLine,
          workflowTask: workflowTask
            ? {
                id: workflowTask.id,
                type: workflowTask.type,
                description: workflowTask.description,
              }
            : null,
        })),
      };
    }

    if (summaryMode) {
      const summarySnapshot = deriveTraceSummarySnapshot({
        visibleRuns,
        limit,
        queueLimit: context.queueLimit,
      });
      return {
        message: deriveTraceSummaryMessage(createTraceSummaryMessageOptions({
          t: (key, vars) => context.t(key as any, vars),
          summarySnapshot,
          formatNumber,
          filterLabel,
          warningLabel,
          formatTerminalReasonLabel: (reason) => formatTraceTerminalReasonLabel(tTrace, reason),
          formatRetryStrategyLabel: (strategy) => formatTraceRetryStrategyLabel(tTrace, strategy),
          formatFailureClassLabel: (failureClass) =>
            formatTraceToolFailureClassLabel(tTrace, failureClass),
          formatPromptLine: (event) => formatTraceEventLine(context, event),
        })),
      };
    }

    return {
      message: deriveTraceListMessage(createTraceListMessageOptions({
        t: (key, vars) => context.t(key as any, vars),
        visibleEvents,
        formatEventTime: (at) => formatTime(context.locale, at),
        formatEventLine: (event) => formatTraceEventLine(context, event),
        filterLabel,
        warningLabel,
      })),
    };
  },
};

export const permissionsCommand: SlashCommand = {
  name: "permissions",
  aliases: ["perm"],
  category: "permissions",
  descriptionKey: "agent.command.permissions.description",
  usageKey: "agent.command.permissions.usage",
  execute: async (context) => {
    const sub = context.parsed.args[0]?.toLowerCase();

    if (!sub) {
      return {
        message: [
          context.t("agent.command.permissions.summary.mode", { mode: context.permissionMode }),
          context.t("agent.command.permissions.summary.rules", { count: context.permissionRules.length }),
          context.t("agent.command.permissions.summary.workspace", {
            workspace: context.workingDir ?? context.t("agent.command.notSet"),
          }),
        ].join("\n"),
      };
    }

    if (sub === "allow-workspace") {
      if (!context.workingDir) {
        return { error: true, message: context.t("agent.command.permissions.workspaceMissing") };
      }
      const rules = buildWorkspaceRules(context.workingDir);
      context.addPermissionRules(rules);
      return {
        message: context.t("agent.command.permissions.workspaceAdded", {
          count: rules.length,
          workspace: context.workingDir,
        }),
      };
    }

    if (sub === "clear-rules") {
      context.clearPermissionRules();
      return { message: context.t("agent.command.permissions.rulesCleared") };
    }

    return unknownSubcommand(context, "permissions");
  },
};

export const taskCommand: SlashCommand = {
  name: "task",
  aliases: ["tasks"],
  category: "tasks",
  descriptionKey: "agent.command.task.description",
  usageKey: "agent.command.task.usage",
  execute: async (context) => {
    const sub = context.parsed.args[0]?.toLowerCase();
    if (!sub) {
      return unknownSubcommand(context, "task");
    }

    if (sub === "list") {
      const tasks = context.taskManager.listTasks();
      if (tasks.length === 0) {
        return { message: context.t("agent.command.task.listEmpty") };
      }
      return {
        message: [context.t("agent.command.task.listTitle", { count: tasks.length }), ...tasks.map((task) => formatTask(task, context))].join(
          "\n",
        ),
      };
    }

    if (sub === "get") {
      const taskId = context.parsed.args[1];
      if (!taskId) {
        return { error: true, message: context.t("agent.command.task.usage.get") };
      }
      const task = context.taskManager.getTask(taskId);
      if (!task) {
        return { error: true, message: context.t("agent.command.task.notFound", { taskId }) };
      }
      return {
        message: [
          context.t("agent.command.task.detailTitle", { taskId: task.id }),
          context.t("agent.command.task.detailStatus", { status: formatTaskStatus(context, task.status) }),
          context.t("agent.command.task.detailType", { type: task.type }),
          context.t("agent.command.task.detailDescription", { description: task.description }),
          context.t("agent.command.task.detailOutputLines", { lines: task.outputOffset }),
          context.t("agent.command.task.detailStarted", {
            started: formatDateTime(context.locale, task.startTime),
          }),
          context.t("agent.command.task.detailEnded", {
            ended: task.endTime ? formatDateTime(context.locale, task.endTime) : context.t("agent.command.notSet"),
          }),
          task.error ? context.t("agent.command.task.detailError", { error: task.error }) : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }

    if (sub === "output") {
      const taskId = context.parsed.args[1];
      const limit = Number.parseInt(context.parsed.args[2] ?? "40", 10);
      if (!taskId) {
        return { error: true, message: context.t("agent.command.task.usage.output") };
      }
      return readTaskOutput(context, taskId, Number.isFinite(limit) ? limit : 40);
    }

    if (sub === "stop") {
      const taskId = context.parsed.args[1];
      if (!taskId) {
        return { error: true, message: context.t("agent.command.task.usage.stop") };
      }
      const ok = context.taskManager.stopTask(taskId);
      if (!ok) {
        return { error: true, message: context.t("agent.command.task.notFound", { taskId }) };
      }
      return { message: context.t("agent.command.task.stopSent", { taskId }) };
    }

    if (sub === "prune") {
      const keepRaw = context.parsed.args[1];
      if (typeof keepRaw === "string" && keepRaw.trim().length > 0) {
        const parsedKeep = Number.parseInt(keepRaw, 10);
        if (!Number.isFinite(parsedKeep) || parsedKeep < 0) {
          return { error: true, message: context.t("agent.command.task.usage.prune") };
        }
        const removed = context.taskManager.clearFinishedTasks(parsedKeep);
        const total = context.taskManager.listTasks().length;
        return {
          message: context.t("agent.command.task.pruneResult", {
            removed,
            keep: parsedKeep,
            total,
          }),
        };
      }

      const removed = context.taskManager.clearFinishedTasks();
      const total = context.taskManager.listTasks().length;
      return {
        message: context.t("agent.command.task.pruneResultDefault", {
          removed,
          total,
        }),
      };
    }

    if (sub === "run-shell") {
      return runShellTask(context, context.parsed.args.slice(1));
    }

    return unknownSubcommand(context, "task");
  },
};

export const gitCommand: SlashCommand = {
  name: "git",
  aliases: ["gsnap"],
  category: "core",
  descriptionKey: "agent.command.git.description",
  usageKey: "agent.command.git.usage",
  execute: async (context) => {
    if (!context.workingDir) {
      return {
        error: true,
        message: context.t("agent.command.git.workspaceMissing"),
      };
    }

    const snapshot: any = await invoke("invoke_agent_git_snapshot", {
      request: {
        working_dir: context.workingDir,
        max_commits: 5,
      },
    });

    if (!snapshot?.is_git_repo) {
      return {
        message: context.t("agent.command.git.notRepo", {
          workspace: context.workingDir,
        }),
      };
    }

    const statusLines = Array.isArray(snapshot.status_short) && snapshot.status_short.length > 0
      ? snapshot.status_short.slice(0, 12).map((line: string) => `  ${line}`)
      : ["  (clean)"];
    const commitLines = Array.isArray(snapshot.recent_commits) && snapshot.recent_commits.length > 0
      ? snapshot.recent_commits.slice(0, 5).map((line: string) => `  ${line}`)
      : ["  (no commits)"];

    return {
      message: [
        context.t("agent.command.git.title"),
        context.t("agent.command.git.branch", {
          branch: snapshot.branch || context.t("agent.command.unknown"),
          base: snapshot.default_branch || context.t("agent.command.unknown"),
        }),
        context.t("agent.command.git.status"),
        ...statusLines,
        context.t("agent.command.git.commits"),
        ...commitLines,
      ].join("\n"),
    };
  },
};

export const rewindCommand: SlashCommand = {
  name: "rewind",
  aliases: ["undo-turn"],
  category: "core",
  descriptionKey: "agent.command.rewind.description",
  usageKey: "agent.command.rewind.usage",
  execute: async (context) => {
    if (!context.workingDir || !context.threadId) {
      return {
        error: true,
        message: context.t("agent.command.rewind.missingContext"),
      };
    }

    const sub = context.parsed.args[0]?.trim().toLowerCase();
    const previewMode = sub === "preview" || sub === "plan" || sub === "dry-run" || sub === "dryrun";
    let turnId = previewMode ? context.parsed.args[1]?.trim() : context.parsed.args[0]?.trim();
    if (!turnId || turnId.toLowerCase() === "last") {
      const lastUserMessage = [...context.getMessages()]
        .reverse()
        .find((message) => message.role === "user");
      if (!lastUserMessage) {
        return {
          error: true,
          message: context.t("agent.command.rewind.noUserTurn"),
        };
      }
      turnId = lastUserMessage.id;
    }

    const result: any = await invoke(previewMode ? "invoke_agent_rewind_preview" : "invoke_agent_rewind_to_turn", {
      request: {
        working_dir: context.workingDir,
        thread_id: context.threadId,
        turn_id: turnId,
      },
    });

    const affectedCount = Array.isArray(result?.affected_paths) ? result.affected_paths.length : 0;
    const restoredCount = Number(result?.restored_count ?? result?.restore_count ?? 0);
    const removedCount = Number(result?.removed_count ?? result?.remove_count ?? 0);
    const errors = Array.isArray(result?.errors) ? (result.errors as string[]) : [];
    const warnings = Array.isArray(result?.warnings) ? (result.warnings as string[]) : [];

    const affectedPreview = Array.isArray(result?.affected_paths) && result.affected_paths.length > 0
      ? result.affected_paths.slice(0, 8).map((path: string) => `  - ${path}`)
      : [];

    const lines = [
      previewMode ? context.t("agent.command.rewind.previewTitle") : context.t("agent.command.rewind.title"),
      context.t(previewMode ? "agent.command.rewind.previewSummary" : "agent.command.rewind.summary", {
        turn: turnId,
        restored: restoredCount,
        removed: removedCount,
        files: affectedCount,
      }),
    ];

    if (affectedPreview.length > 0) {
      lines.push(context.t("agent.command.rewind.affected"));
      lines.push(...affectedPreview);
    }
    if (errors.length > 0) {
      lines.push(context.t("agent.command.rewind.errors", { count: errors.length }));
      lines.push(...errors.slice(0, 5).map((err) => `  ! ${err}`));
    }
    if (warnings.length > 0) {
      lines.push(context.t("agent.command.rewind.previewWarnings", { count: warnings.length }));
      lines.push(...warnings.slice(0, 5).map((warn) => `  ! ${warn}`));
    }

    return {
      message: lines.join("\n"),
      error: errors.length > 0 || (!previewMode && warnings.length > 0),
    };
  },
};

export const promptCommand: SlashCommand = {
  name: "prompt",
  category: "core",
  descriptionKey: "agent.command.prompt.description",
  usageKey: "agent.command.prompt.usage",
  execute: async (context) => {
    const mode = (context.parsed.args[0] ?? "summary").trim().toLowerCase();
    const isSummaryMode = mode === "summary" || mode === "stats" || mode === "overview";
    const isSectionsMode = mode === "sections" || mode === "list";
    const isSectionMode = mode === "section" || mode === "show";
    const isExportMode = mode === "export" || mode === "json";
    const lastPromptCompiled = [...context.getRecentQueryEvents(80)]
      .reverse()
      .find((event): event is Extract<QueryStreamEvent, { type: "prompt_compiled" }> => {
        return event.type === "prompt_compiled";
      });

    if (!lastPromptCompiled) {
      return {
        message: [
          context.t("agent.command.prompt.title"),
          context.t("agent.command.prompt.empty"),
        ].join("\n"),
      };
    }

    const sectionMetadata = Array.isArray(lastPromptCompiled.sectionMetadata)
      ? lastPromptCompiled.sectionMetadata
      : [];
    const staticSectionIds = Array.isArray(lastPromptCompiled.staticSectionIds)
      ? lastPromptCompiled.staticSectionIds
      : [];
    const dynamicSectionIds = Array.isArray(lastPromptCompiled.dynamicSectionIds)
      ? lastPromptCompiled.dynamicSectionIds
      : [];

    const lines: string[] = [
      context.t("agent.command.prompt.title"),
      context.t("agent.command.prompt.sections", {
        staticSections: formatNumber(lastPromptCompiled.staticSections),
        dynamicSections: formatNumber(lastPromptCompiled.dynamicSections),
      }),
      context.t("agent.command.prompt.chars", {
        staticChars: formatNumber(lastPromptCompiled.staticChars),
        dynamicChars: formatNumber(lastPromptCompiled.dynamicChars),
        totalChars: formatNumber(lastPromptCompiled.totalChars),
      }),
    ];
    if (sectionMetadata.length > 0) {
      const governance = summarizePromptGovernance(sectionMetadata);
      lines.push(
        context.t("agent.command.prompt.governance", {
          core: formatNumber(governance.ownerCounts.core),
          safeguards: formatNumber(governance.ownerCounts.safeguards),
          runtime: formatNumber(governance.ownerCounts.runtime),
          immutable: formatNumber(governance.immutableCount),
          launch: formatNumber(governance.modelLaunchCount),
        }),
      );
    }

    if (lastPromptCompiled.staticHash && lastPromptCompiled.dynamicHash) {
      lines.push(
        context.t("agent.command.prompt.hashes", {
          staticHash: lastPromptCompiled.staticHash,
          dynamicHash: lastPromptCompiled.dynamicHash,
        }),
      );
    }

    if (Array.isArray(lastPromptCompiled.modelLaunchTags) && lastPromptCompiled.modelLaunchTags.length > 0) {
      lines.push(
        context.t("agent.command.prompt.tags", {
          tags: lastPromptCompiled.modelLaunchTags.join(", "),
        }),
      );
    }

    if (staticSectionIds.length > 0) {
      lines.push(
        context.t("agent.command.prompt.staticIds", {
          ids: staticSectionIds.join(", "),
        }),
      );
    }

    if (dynamicSectionIds.length > 0) {
      lines.push(
        context.t("agent.command.prompt.dynamicIds", {
          ids: dynamicSectionIds.join(", "),
        }),
      );
    }

    if (isSummaryMode) {
      if (sectionMetadata.length > 0) {
        const sectionLines = sectionMetadata
          .slice(0, 14)
          .map((section) => {
            const tag = section.modelLaunchTag ? ` tag=${section.modelLaunchTag}` : "";
            return `- ${section.id} [${section.kind}] owner=${section.owner} mutable=${section.mutable ? "yes" : "no"}${tag}`;
          });
        if (sectionLines.length > 0) {
          lines.push(context.t("agent.command.prompt.sectionMetaTitle"));
          lines.push(...sectionLines);
        }
      }
      return { message: lines.join("\n") };
    }

    if (isExportMode) {
      const payload = {
        generatedAt: new Date().toISOString(),
        sections: {
          static: lastPromptCompiled.staticSections,
          dynamic: lastPromptCompiled.dynamicSections,
          staticChars: lastPromptCompiled.staticChars,
          dynamicChars: lastPromptCompiled.dynamicChars,
          totalChars: lastPromptCompiled.totalChars,
        },
        hashes: {
          static: lastPromptCompiled.staticHash ?? null,
          dynamic: lastPromptCompiled.dynamicHash ?? null,
        },
        modelLaunchTags: lastPromptCompiled.modelLaunchTags ?? [],
        staticSectionIds,
        dynamicSectionIds,
        sectionMetadata,
      };
      return {
        message: JSON.stringify(payload, null, 2),
      };
    }

    if (isSectionsMode) {
      if (sectionMetadata.length === 0) {
        lines.push(context.t("agent.command.prompt.sectionMetaEmpty"));
        return { message: lines.join("\n") };
      }
      lines.push(context.t("agent.command.prompt.sectionListTitle"));
      const sectionLines = sectionMetadata.map((section, index) => {
        const tag = section.modelLaunchTag ? ` tag=${section.modelLaunchTag}` : "";
        return `${index + 1}. ${section.id} [${section.kind}] owner=${section.owner} mutable=${section.mutable ? "yes" : "no"}${tag}`;
      });
      lines.push(...sectionLines);
      return { message: lines.join("\n") };
    }

    if (isSectionMode) {
      const sectionId = (context.parsed.args[1] ?? "").trim();
      if (!sectionId) {
        return {
          error: true,
          message: `${context.t("agent.command.prompt.sectionMissingArg")}\n${context.t("agent.command.prompt.usage")}`,
        };
      }
      const match = sectionMetadata.find((section) => section.id.toLowerCase() === sectionId.toLowerCase());
      if (!match) {
        return {
          error: true,
          message: context.t("agent.command.prompt.sectionNotFound", { sectionId }),
        };
      }
      const detailLines = [
        context.t("agent.command.prompt.sectionDetailTitle", { sectionId: match.id }),
        `kind=${match.kind}`,
        `owner=${match.owner}`,
        `mutable=${match.mutable ? "yes" : "no"}`,
      ];
      if (match.modelLaunchTag) {
        detailLines.push(`modelLaunchTag=${match.modelLaunchTag}`);
      }
      detailLines.push(context.t("agent.command.prompt.sectionContentUnavailable"));
      return { message: detailLines.join("\n") };
    }

    return {
      error: true,
      message: context.t("agent.command.prompt.invalidSubcommand", { subcommand: mode }),
    };
  },
};

export const doctorCommand: SlashCommand = {
  name: "doctor",
  category: "core",
  descriptionKey: "agent.command.doctor.description",
  usageKey: "agent.command.doctor.usage",
  execute: async (context) => {
    const tTrace = traceTranslate(context);
    const mode = context.parsed.args[0]?.toLowerCase();
    const subMode = context.parsed.args[1]?.toLowerCase();
    if (mode === "queue" && subMode === "investigate") {
      const kv = parseKeyValueArgs(context.parsed.args.slice(2));
      const queueEvents = context
        .getRecentQueryEvents(400)
        .filter(
          (event): event is Extract<QueryStreamEvent, { type: "queue_update" }> =>
            event.type === "queue_update",
        );
      const queuePriorityStats = buildTraceQueuePriorityStats(queueEvents, context.queueLimit);
      const queueReasonStats = buildTraceQueueReasonStats(queueEvents);
      const latestQueueEvent = queueEvents.length > 0 ? queueEvents[queueEvents.length - 1] : null;
      const derivedQueueLimit = Math.max(0, latestQueueEvent?.queueLimit ?? context.queueLimit);
      const derivedLatestDepth = queuePriorityStats.latestQueueDepth;
      const derivedMaxDepth = Math.max(queuePriorityStats.maxQueueDepth, derivedLatestDepth);
      const derivedQueuedCount =
        queuePriorityStats.queued.now + queuePriorityStats.queued.next + queuePriorityStats.queued.later;
      const derivedDequeuedCount =
        queuePriorityStats.dequeued.now + queuePriorityStats.dequeued.next + queuePriorityStats.dequeued.later;
      const derivedRejectedCount =
        queuePriorityStats.rejected.now + queuePriorityStats.rejected.next + queuePriorityStats.rejected.later;
      const fallbackPressure =
        queueEvents.length > 0
          ? queuePriorityStats.pressure
          : deriveQueuePressure(Math.max(0, context.queueCount), Math.max(0, context.queueLimit));
      const queueInvestigateRuntime = deriveDoctorQueueInvestigateRuntime({
        kv,
        fallback: {
          pressure: fallbackPressure,
          queueLimit: derivedQueueLimit,
          latestDepth: derivedLatestDepth,
          maxDepth: derivedMaxDepth,
          queuedCount: derivedQueuedCount,
          dequeuedCount: derivedDequeuedCount,
          rejectedCount: derivedRejectedCount,
          deduplicatedCount: queueReasonStats.deduplicated,
          capacityRejections: queueReasonStats.capacity,
          staleRejections: queueReasonStats.stale,
          manualRejections: queueReasonStats.manual,
          dominantPriorityLabel: getDominantQueuePriorityLabel(context, queuePriorityStats.queued),
        },
        labels: {
          pressureById: {
            idle: context.t("agent.trace.queuePressure.idle"),
            busy: context.t("agent.trace.queuePressure.busy"),
            congested: context.t("agent.trace.queuePressure.congested"),
            saturated: context.t("agent.trace.queuePressure.saturated"),
          },
          priorityById: {
            now: context.t("agent.queue.priority.now"),
            next: context.t("agent.queue.priority.next"),
            later: context.t("agent.queue.priority.later"),
          },
        },
        formatNumber,
      });

      return {
        message: queueInvestigateRuntime.lines
          .map((line) => context.t(line.key, line.vars))
          .join("\n"),
      };
    }

    if ((mode === "recover" || mode === "recovery") && subMode === "investigate") {
      return {
        message: buildRecoverInvestigateMessage(context, parseKeyValueArgs(context.parsed.args.slice(2))),
      };
    }

    if (mode === "fallback" && subMode === "investigate") {
      const kv = parseKeyValueArgs(context.parsed.args.slice(2));
      const reasonLabel = formatTraceFallbackSuppressedReasonLabel(
        tTrace,
        kv.last_reason ?? kv.reason ?? "unknown",
        context.t("agent.command.unknown"),
      );
      const strategyLabel = formatTraceRetryStrategyLabel(
        tTrace,
        (kv.last_strategy ?? kv.strategy ?? "balanced").replace(/\s+/g, "_"),
      );
      const queuePressure = deriveQueuePressure(context.queueCount, context.queueLimit);
      const fallbackInvestigateRuntime = deriveDoctorFallbackInvestigateRuntime({
        kv,
        queuePressure,
        queuePressureLabel: context.t(`agent.trace.queuePressure.${queuePressure}`),
        reasonLabel,
        strategyLabel,
        suppressionWarnThresholdPct: DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT,
        formatNumber,
      });
      return {
        message: fallbackInvestigateRuntime.lines
          .map((line) => context.t(line.key, line.vars))
          .join("\n"),
      };
    }

    const sectionComposer = createDoctorSectionComposer();
    sectionComposer.addLine("header", context.t("agent.command.doctor.title"));
    const recommendations: DoctorRecommendationEntry[] = [];
    const addRecommendation = (id: DoctorRecommendationId, text: string) => {
      recommendations.push({ id, text });
    };
    const addEnvironmentEvaluation = (
      sectionId: "workspace" | "git",
      evaluation: DoctorEnvironmentEvaluation,
      options?: { workspaceForInitGit?: string | null },
    ) => {
      sectionComposer.addLine(
        sectionId,
        formatDoctorLine(
          evaluation.line.level,
          context.t(evaluation.line.key, evaluation.line.vars),
        ),
      );
      for (const recommendationId of evaluation.recommendationIds) {
        const workspaceOptions =
          recommendationId === "initGit"
            ? { workspace: options?.workspaceForInitGit ?? context.workingDir ?? null }
            : undefined;
        addRecommendation(
          recommendationId,
          getDoctorRecommendationText(context, recommendationId, workspaceOptions),
        );
      }
    };
    let hasGitRepo: boolean | null = null;

    const apiStateLine = deriveDoctorApiStateLine(context.currentModel);
    sectionComposer.addLine(
      "header",
      formatDoctorLine(
        apiStateLine.level,
        context.t(apiStateLine.key, apiStateLine.vars),
      ),
    );

    if (!context.workingDir) {
      addEnvironmentEvaluation("workspace", deriveDoctorWorkspaceMissing());
    } else {
      try {
        const result: any = await invoke("invoke_agent_list_dir", {
          request: {
            path: context.workingDir,
            recursive: false,
            max_depth: 1,
            file_extensions: null,
          },
        });
        const count = Number(result?.total_count ?? 0);
        addEnvironmentEvaluation(
          "workspace",
          deriveDoctorWorkspaceOk(context.workingDir, formatNumber(count)),
        );
      } catch (error) {
        addEnvironmentEvaluation(
          "workspace",
          deriveDoctorWorkspaceFail(context.workingDir, String(error)),
        );
      }
    }

    if (context.workingDir) {
      try {
        const snapshot: any = await invoke("invoke_agent_git_snapshot", {
          request: {
            working_dir: context.workingDir,
            max_commits: 3,
          },
        });
        const gitEvaluation = deriveDoctorGitLineFromSnapshot({
          workspace: context.workingDir,
          snapshot,
          unknownLabel: context.t("agent.command.unknown"),
        });
        hasGitRepo = gitEvaluation.hasGitRepo;
        addEnvironmentEvaluation("git", gitEvaluation, {
          workspaceForInitGit: context.workingDir,
        });
      } catch (error) {
        addEnvironmentEvaluation(
          "git",
          deriveDoctorGitLineFromError(String(error)),
        );
      }
    }

    const recentEvents = context.getRecentQueryEvents(120);
    const usage = context.getUsageSnapshot();
    const lastQueryStart = [...recentEvents]
      .reverse()
      .find((event): event is Extract<QueryStreamEvent, { type: "query_start" }> => event.type === "query_start");
    const fallbackStats = buildTraceFallbackStats(recentEvents);
    const toolFailureStats = buildToolFailureClassStats({
      events: recentEvents,
      formatFailureClassLabel: (failureClass) =>
        formatTraceToolFailureClassLabel(tTrace, failureClass),
    });
    const toolFailureCounts = collectToolFailureClassCounts(recentEvents);
    const budgetGuardStats = buildToolBudgetGuardReasonStats(recentEvents);
    const operationalSectionRuntime = deriveDoctorOperationalSectionRuntime({
      usage: {
        totalTokensLabel: formatNumber(usage.totals.totalTokens),
        modelCountLabel: formatNumber(usage.byModel.length),
      },
      queryProfile: lastQueryStart
        ? {
            laneLabel: context.t(`agent.trace.queryLane.${lastQueryStart.lane ?? "foreground"}`),
            retriesLabel:
              typeof lastQueryStart.retryMax === "number" ? String(lastQueryStart.retryMax) : "-",
            fallbackLabel: context.t(
              `agent.trace.queryFallback.${lastQueryStart.fallbackEnabled ? "on" : "off"}`,
            ),
            strategyLabel: formatTraceRetryStrategyLabel(tTrace, lastQueryStart.retryStrategy),
          }
        : null,
      fallback: {
        used: fallbackStats.used,
        suppressed: fallbackStats.suppressed,
        usedLabel: formatNumber(fallbackStats.used),
        suppressedLabel: formatNumber(fallbackStats.suppressed),
        suppressionWarnThresholdPct: DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT,
        latestSuppressed: fallbackStats.latestSuppressed
          ? {
              countLabel: formatNumber(fallbackStats.suppressed),
              reasonLabel: context.t(
                `agent.trace.fallbackSuppressedReason.${fallbackStats.latestSuppressed.reason}`,
              ),
              strategyLabel: formatTraceRetryStrategyLabel(
                tTrace,
                fallbackStats.latestSuppressed.retryStrategy,
              ),
              reasonId: fallbackStats.latestSuppressed.reason,
            }
          : null,
        formatNumber,
      },
      tooling: {
        toolFailure: {
          total: toolFailureStats.total,
          detailsLabel: toolFailureStats.total > 0 ? toolFailureStats.parts : "-",
          counts: toolFailureCounts,
        },
        budgetGuard: {
          total: budgetGuardStats.total,
          perToolLimit: budgetGuardStats.perToolLimit,
          perToolLimitLabel: formatNumber(budgetGuardStats.perToolLimit),
          failureBackoff: budgetGuardStats.failureBackoff,
          failureBackoffLabel: formatNumber(budgetGuardStats.failureBackoff),
          dominantLabel: budgetGuardStats.dominantReason
            ? formatTraceToolBudgetReasonLabel(tTrace, budgetGuardStats.dominantReason)
            : context.t("agent.command.notSet"),
        },
      },
    });
    for (const lineDescriptor of operationalSectionRuntime.lines) {
      sectionComposer.addLine(
        lineDescriptor.section,
        formatDoctorLine(
          lineDescriptor.level,
          context.t(lineDescriptor.key, lineDescriptor.vars),
        ),
      );
    }
    for (const recommendationId of operationalSectionRuntime.recommendationIds) {
      addRecommendation(recommendationId, getDoctorRecommendationText(context, recommendationId));
    }

    const lastPromptCompiled = [...recentEvents]
      .reverse()
      .find((event): event is Extract<QueryStreamEvent, { type: "prompt_compiled" }> => {
        return event.type === "prompt_compiled";
      });
    const promptLineDescriptors = deriveDoctorPromptSectionLineDescriptors({
      lastPromptCompiled: lastPromptCompiled ?? null,
      formatNumber,
    });
    for (const lineDescriptor of promptLineDescriptors) {
      sectionComposer.addLine(
        "prompt",
        formatDoctorLine(
          lineDescriptor.level,
          context.t(lineDescriptor.key, lineDescriptor.vars),
        ),
      );
    }

    const tasks = context.taskManager.listTasks();
    const running = tasks.filter((task) => task.status === "running").length;
    const queueLimit = Math.max(0, context.queueLimit);
    const queueCount = Math.max(0, context.queueCount);
    const recoverRuntimeSnapshot = buildRecoverCommandRuntimeSnapshot({
      messages: context.getMessages(),
      queuedQueries: context.getQueuedQueries(),
      queueLimit: context.queueLimit,
      queueCountOverride: queueCount,
      queueLimitOverride: queueLimit,
      events: recentEvents,
      queuedRecoveryMatcher: isRecoverContinuePrompt,
    });
    const recoverSignals = recoverRuntimeSnapshot.signals;
    const queueSectionRuntime = deriveDoctorQueueSectionRuntime({
      queueCount,
      queueLimit,
      queueDeduplicatedCount: recoverSignals.queueDeduplicatedCount,
      runningTaskCount: running,
      totalTaskCount: tasks.length,
      formatNumber,
    });
    for (const lineDescriptor of queueSectionRuntime.lines) {
      sectionComposer.addLine(
        "queue",
        formatDoctorLine(
          lineDescriptor.level,
          context.t(lineDescriptor.key, lineDescriptor.vars),
        ),
      );
    }
    for (const recommendationId of queueSectionRuntime.recommendationIds) {
      addRecommendation(recommendationId, getDoctorRecommendationText(context, recommendationId));
    }

    const recoverState = recoverRuntimeSnapshot.state;
    const recoverySectionRuntime = deriveDoctorRecoverySectionRuntime({
      stateKind: recoverState.kind,
      stateLastMessageId: recoverState.lastMessageId ?? null,
      interruptionReasonLabel:
        recoverState.kind === "none"
          ? null
          : formatRecoverReasonLabel(context, recoverState.kind),
      notSetLabel: context.t("agent.command.notSet"),
      queueCount,
      queueLimit,
      queueDeduplicatedCount: recoverSignals.queueDeduplicatedCount,
      queueRejectedCount: recoverSignals.queueRejectedCount,
      failureTotal: recoverSignals.failureTotal,
    });
    for (const lineDescriptor of recoverySectionRuntime.lines) {
      const text = context.t(lineDescriptor.key, lineDescriptor.vars);
      if (lineDescriptor.format === "doctor") {
        sectionComposer.addLine(
          "recovery",
          formatDoctorLine(lineDescriptor.level ?? "ok", text),
        );
        continue;
      }
      sectionComposer.addLine("recovery", text);
    }
    recommendations.push(
      ...recoverySectionRuntime.recommendations.map((recommendation) =>
        getRecoverRecommendationEntry(context, recommendation),
      ),
    );

    const permissionSectionRuntime = deriveDoctorPermissionSectionRuntime({
      events: recentEvents,
      permissionMode: context.permissionMode,
      permissionRuleCount: context.permissionRules.length,
      formatNumber,
    });
    for (const lineDescriptor of permissionSectionRuntime.lines) {
      sectionComposer.addLine(
        "permission",
        formatDoctorLine(
          lineDescriptor.level,
          context.t(lineDescriptor.key, lineDescriptor.vars),
        ),
      );
    }
    for (const recommendationId of permissionSectionRuntime.recommendationIds) {
      addRecommendation(recommendationId, getDoctorRecommendationText(context, recommendationId));
    }

    if (hasGitRepo && context.workingDir && context.permissionMode !== "full_access") {
      addRecommendation("allowWorkspaceWrite", getDoctorRecommendationText(context, "allowWorkspaceWrite"));
    }

    const dedupedRecommendations = prioritizeDoctorRecommendations(recommendations);
    if (dedupedRecommendations.length > 0) {
      sectionComposer.addLine("recommend", context.t("agent.command.doctor.recommend.title"));
      for (const suggestion of dedupedRecommendations) {
        sectionComposer.addLine("recommend", `- ${suggestion}`);
      }
    }

    return { message: sectionComposer.buildLines().join("\n") };
  },
};

export class CommandRegistry {
  private readonly byName = new Map<string, SlashCommand>();

  constructor(commands: SlashCommand[]) {
    for (const command of commands) {
      this.byName.set(command.name.toLowerCase(), command);
      for (const alias of command.aliases ?? []) {
        this.byName.set(alias.toLowerCase(), command);
      }
    }
  }

  public getCommands(): SlashCommand[] {
    const seen = new Set<string>();
    const result: SlashCommand[] = [];
    for (const command of this.byName.values()) {
      if (!seen.has(command.name)) {
        seen.add(command.name);
        result.push(command);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getDescriptors(locale: AppLocale): SlashCommandDescriptor[] {
    return this.getCommands().map((command) => ({
      name: command.name,
      aliases: [...(command.aliases ?? [])],
      category: command.category,
      description: translate(locale, command.descriptionKey),
      usage: translate(locale, command.usageKey),
    }));
  }

  public async execute(parsed: ParsedSlashCommand, context: Omit<CommandContext, "parsed">): Promise<CommandResult> {
    const command = this.byName.get(parsed.name);
    if (!command) {
      return {
        error: true,
        message: context.t("agent.command.unknownCommand", { command: `/${parsed.name}` }),
      };
    }

    return command.execute({
      ...context,
      parsed,
    });
  }
}

export function createDefaultCommandRegistry(): CommandRegistry {
  return new CommandRegistry([
    helpCommand,
    statusCommand,
    queueCommand,
    recoverCommand,
    budgetCommand,
    usageCommand,
    traceCommand,
    doctorCommand,
    gitCommand,
    rewindCommand,
    toolsCommand,
    permissionsCommand,
    taskCommand,
    promptCommand,
  ]);
}
