import { invoke } from "@tauri-apps/api/core";
import { translate, type AppLocale } from "@/lib/i18n";
import type { PermissionRule } from "../permissions/toolPermissions";
import type { AgentTask, AgentTaskStatus } from "../tasks/types";
import type {
  PermissionRiskClass,
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

function formatContinueReasonLabel(context: CommandContext, event: Extract<QueryStreamEvent, { type: "continue" }>): string {
  const transition = event.transition;
  if (transition.reason === "tool_results") {
    return context.t("agent.continue.toolResults");
  }
  if (transition.reason === "fallback_retry") {
    return context.t("agent.continue.fallbackRetry", { model: transition.fallbackModel });
  }
  if (transition.reason === "token_budget_continuation") {
    return context.t("agent.continue.tokenBudget", { attempt: transition.attempt });
  }
  if (transition.reason === "stop_hook_retry") {
    return context.t("agent.continue.stopHookRetry", { attempt: transition.attempt });
  }
  return context.t("agent.continue.none");
}

function formatTerminalReasonLabel(
  context: CommandContext,
  event: Extract<QueryStreamEvent, { type: "query_end" }>,
): string {
  switch (event.terminalReason) {
    case "completed":
      return context.t("agent.trace.terminal.completed");
    case "aborted":
      return context.t("agent.trace.terminal.aborted");
    case "stop_hook_prevented":
      return context.t("agent.trace.terminal.stopHookPrevented");
    case "max_iterations":
      return context.t("agent.trace.terminal.maxIterations");
    case "error":
      return context.t("agent.trace.terminal.error");
    default:
      return event.terminalReason;
  }
}

function formatRetryStrategyLabel(
  context: CommandContext,
  strategy: string | undefined,
): string {
  if (typeof strategy !== "string" || strategy.length === 0) {
    return context.t("agent.trace.retryStrategy.balanced");
  }
  return context.t(`agent.trace.retryStrategy.${strategy}`);
}

function formatCommandLifecycleStateLabel(
  context: CommandContext,
  state: Extract<QueryStreamEvent, { type: "command_lifecycle" }>["state"],
): string {
  return context.t(`agent.trace.commandLifecycle.state.${state}`);
}

function formatQueuePriorityLabel(
  context: CommandContext,
  priority: Extract<QueryStreamEvent, { type: "queue_update" }>["priority"],
): string {
  if (!priority) {
    return "";
  }
  return context.t(`agent.queue.priority.${priority}`);
}

const DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT = 50;

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

function formatFallbackSuppressedReasonLabel(context: CommandContext, reason: string | undefined): string {
  const normalized = (reason ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    return context.t("agent.command.unknown");
  }
  const key = `agent.trace.fallbackSuppressedReason.${normalized}`;
  const translated = context.t(key);
  return translated === key ? normalized : translated;
}

interface PermissionRiskCounters {
  critical: number;
  high_risk: number;
  interactive: number;
  path_outside: number;
  policy: number;
  scopeNotices: number;
  reversibilityReversible: number;
  reversibilityMixed: number;
  reversibilityHardToReverse: number;
  blastLocal: number;
  blastWorkspace: number;
  blastShared: number;
}

function createEmptyPermissionRiskCounters(): PermissionRiskCounters {
  return {
    critical: 0,
    high_risk: 0,
    interactive: 0,
    path_outside: 0,
    policy: 0,
    scopeNotices: 0,
    reversibilityReversible: 0,
    reversibilityMixed: 0,
    reversibilityHardToReverse: 0,
    blastLocal: 0,
    blastWorkspace: 0,
    blastShared: 0,
  };
}

function collectPermissionRiskCounters(events: QueryStreamEvent[]): PermissionRiskCounters {
  const counters = createEmptyPermissionRiskCounters();
  for (const event of events) {
    if (event.type === "authorization_scope_notice") {
      counters.scopeNotices += 1;
      continue;
    }
    if (event.type !== "permission_decision") {
      if (event.type === "permission_risk_profile") {
        if (event.reversibility === "reversible") counters.reversibilityReversible += 1;
        else if (event.reversibility === "mixed") counters.reversibilityMixed += 1;
        else counters.reversibilityHardToReverse += 1;

        if (event.blastRadius === "local") counters.blastLocal += 1;
        else if (event.blastRadius === "workspace") counters.blastWorkspace += 1;
        else counters.blastShared += 1;
      }
      continue;
    }
    if (!event.riskClass) {
      continue;
    }
    counters[event.riskClass] += 1;
  }
  return counters;
}

function formatTraceEventLine(context: CommandContext, event: QueryStreamEvent): string {
  switch (event.type) {
    case "prompt_compiled":
      {
        const baseLine = context.t("agent.trace.event.promptCompiled", {
          staticSections: event.staticSections,
          dynamicSections: event.dynamicSections,
          staticChars: event.staticChars,
          dynamicChars: event.dynamicChars,
          totalChars: event.totalChars,
        });
        const suffix: string[] = [];
        if (event.staticHash && event.dynamicHash) {
          suffix.push(`hash=${event.staticHash}/${event.dynamicHash}`);
        }
        if (Array.isArray(event.modelLaunchTags) && event.modelLaunchTags.length > 0) {
          suffix.push(`tags=${event.modelLaunchTags.join(",")}`);
        }
        if (suffix.length === 0) {
          return baseLine;
        }
        return `${baseLine} | ${suffix.join(" | ")}`;
      }
    case "query_start": {
      if (
        event.lane === undefined &&
        event.retryMax === undefined &&
        event.fallbackEnabled === undefined &&
        event.retryStrategy === undefined
      ) {
        return context.t("agent.trace.event.queryStart", {
          model: event.model,
          queueCount: event.queueCount,
        });
      }
      const laneLabel = context.t(`agent.trace.queryLane.${event.lane ?? "foreground"}`);
      const retries = typeof event.retryMax === "number" ? String(event.retryMax) : "-";
      const fallbackLabel = context.t(`agent.trace.queryFallback.${event.fallbackEnabled ? "on" : "off"}`);
      const baseLine = context.t("agent.trace.event.queryStartDetailed", {
        model: event.model,
        queueCount: event.queueCount,
        lane: laneLabel,
        retries,
        fallback: fallbackLabel,
      });
      if (!event.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatRetryStrategyLabel(context, event.retryStrategy);
      return `${baseLine} | ${context.t("agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "iteration_start":
      return context.t("agent.trace.event.iterationStart", {
        iteration: event.iteration,
        model: event.model,
      });
    case "retry_attempt": {
      const laneLabel = context.t(`agent.trace.queryLane.${event.lane ?? "foreground"}`);
      const baseLine = context.t("agent.trace.event.retryAttempt", {
        iteration: event.iteration,
        model: event.model,
        lane: laneLabel,
        attempt: event.attempt,
        delaySec: (event.nextDelayMs / 1000).toFixed(1),
        reason: event.reason,
      });
      if (!event.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatRetryStrategyLabel(context, event.retryStrategy);
      return `${baseLine} | ${context.t("agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "retry_profile_update":
      return context.t("agent.trace.event.retryProfileUpdate", {
        lane: context.t(`agent.trace.queryLane.${event.lane}`),
        queue: event.queueCount,
        retries: event.retryMax,
        fallback: context.t(`agent.trace.queryFallback.${event.fallbackEnabled ? "on" : "off"}`),
        strategy: formatRetryStrategyLabel(context, event.retryStrategy),
        reason: context.t(`agent.trace.retryProfileReason.${event.reason}`),
      });
    case "fallback_suppressed":
      return context.t("agent.trace.event.fallbackSuppressed", {
        iteration: event.iteration,
        model: event.model,
        lane: context.t(`agent.trace.queryLane.${event.lane}`),
        reason: context.t(`agent.trace.fallbackSuppressedReason.${event.reason}`),
        strategy: formatRetryStrategyLabel(context, event.retryStrategy),
      });
    case "tool_batch_start":
      return context.t("agent.trace.event.toolBatchStart", {
        iteration: event.iteration,
        count: event.count,
      });
    case "tool_batch_complete":
      return context.t("agent.trace.event.toolBatchComplete", {
        count: event.count,
        errorCount: event.errorCount,
      });
    case "tool_result":
      return context.t("agent.trace.event.toolResult", {
        tool: event.tool,
        outcome: context.t(`agent.trace.toolOutcome.${event.outcome}`),
      });
    case "tool_retry_guard":
      return context.t("agent.trace.event.toolRetryGuard", {
        tool: event.tool,
        streak: event.streak,
      });
    case "continue":
      return context.t("agent.trace.event.continue", {
        reason: formatContinueReasonLabel(context, event),
      });
    case "stop_hook_review":
      return context.t("agent.trace.event.stopHookReview", {
        notes: event.noteCount,
        continuation: event.continuationCount,
      });
    case "permission_decision":
      {
        const baseLine = context.t("agent.trace.event.permissionDecision", {
          behavior: event.behavior,
          tool: event.tool,
          reason: event.reason,
        });
        if (!event.riskClass) {
          return baseLine;
        }
        const riskLabel = context.t(`agent.trace.permissionRisk.${event.riskClass}`);
        return `${baseLine} | ${context.t("agent.trace.permissionRiskLabel", { risk: riskLabel })}`;
      }
    case "permission_risk_profile":
      return context.t("agent.trace.event.permissionRiskProfile", {
        tool: event.tool,
        risk: event.riskClass
          ? context.t(`agent.trace.permissionRisk.${event.riskClass}`)
          : context.t("agent.trace.permissionRisk.policy"),
        reversibility: context.t(`agent.permission.prompt.reversibility.${event.reversibility}`),
        blastRadius: context.t(`agent.permission.prompt.blastRadius.${event.blastRadius}`),
      });
    case "authorization_scope_notice":
      return context.t("agent.trace.event.authorizationScope", {
        tool: event.tool,
        risk: context.t(`agent.trace.permissionRisk.${event.riskClass}`),
        count: event.priorApprovals,
      });
    case "queue_update": {
      const reasonLabel = event.reason
        ? context.t(`agent.trace.queueReason.${event.reason}`)
        : "";
      const priorityLabel = formatQueuePriorityLabel(context, event.priority);
      return context.t("agent.trace.event.queueUpdate", {
        action: context.t(`agent.trace.queueAction.${event.action}`),
        queueCount: event.queueCount,
        queueLimit: event.queueLimit,
        reason: `${priorityLabel ? ` [${priorityLabel}]` : ""}${reasonLabel ? ` (${reasonLabel})` : ""}`,
      });
    }
    case "command_lifecycle":
      return context.t("agent.trace.event.commandLifecycle", {
        state: formatCommandLifecycleStateLabel(context, event.state),
        command: event.command,
      });
    case "query_end":
      return context.t("agent.trace.event.queryEnd", {
        terminalReason: formatTerminalReasonLabel(context, event),
        durationSec: (event.durationMs / 1000).toFixed(1),
      });
    default:
      return context.t("agent.trace.event.unknown");
  }
}

type TraceFilter = "all" | "queue" | "tools" | "permission" | "query" | "prompt" | "retry" | "continue";
type TraceCategory = Exclude<TraceFilter, "all">;
type TraceRunWindow = number | "all";
type TracePermissionRiskFilter = "all" | PermissionRiskClass;
type TracePermissionReversibilityFilter =
  | "all"
  | Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["reversibility"];
type TracePermissionBlastRadiusFilter =
  | "all"
  | Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["blastRadius"];
const TRACE_CATEGORY_ORDER: TraceCategory[] = ["query", "prompt", "tools", "permission", "queue", "retry", "continue"];
const TRACE_PERMISSION_RISK_ORDER: PermissionRiskClass[] = [
  "critical",
  "high_risk",
  "interactive",
  "path_outside",
  "policy",
];

function getTraceEventFilter(event: QueryStreamEvent): Exclude<TraceFilter, "all"> {
  switch (event.type) {
    case "queue_update":
      return "queue";
    case "tool_result":
      return "tools";
    case "tool_retry_guard":
      return "retry";
    case "tool_batch_start":
    case "tool_batch_complete":
      return "tools";
    case "permission_decision":
    case "permission_risk_profile":
    case "authorization_scope_notice":
      return "permission";
    case "retry_attempt":
    case "retry_profile_update":
    case "fallback_suppressed":
      return "retry";
    case "continue":
      return "continue";
    case "stop_hook_review":
      return "continue";
    case "prompt_compiled":
      return "prompt";
    case "command_lifecycle":
      return "query";
    case "query_start":
    case "iteration_start":
    case "query_end":
    default:
      return "query";
  }
}

function getTraceEventSeverity(event: QueryStreamEvent): "info" | "warn" | "error" {
  if (event.type === "tool_result") {
    if (event.outcome === "error") {
      return "error";
    }
    if (event.outcome === "rejected") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "query_end") {
    if (
      event.terminalReason === "error" ||
      event.terminalReason === "max_iterations" ||
      event.terminalReason === "stop_hook_prevented"
    ) {
      return "error";
    }
    if (event.terminalReason === "aborted") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "command_lifecycle") {
    if (event.state === "failed") {
      return "error";
    }
    if (event.state === "aborted") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "retry_attempt") {
    return event.attempt >= 2 ? "warn" : "info";
  }
  if (event.type === "retry_profile_update") {
    return event.reason === "load_shed" ? "warn" : "info";
  }
  if (event.type === "fallback_suppressed") {
    return "warn";
  }
  if (event.type === "tool_retry_guard") {
    return "warn";
  }
  if (event.type === "stop_hook_review") {
    return event.continuationCount > 0 ? "warn" : "info";
  }
  if (event.type === "authorization_scope_notice") {
    return "warn";
  }
  if (event.type === "permission_risk_profile") {
    if (event.reversibility === "hard_to_reverse" || event.blastRadius === "shared") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "queue_update" && event.action === "rejected") {
    return "warn";
  }
  if (event.type === "tool_batch_complete" && event.errorCount > 0) {
    return "warn";
  }
  if (event.type === "permission_decision" && event.behavior === "deny") {
    return "warn";
  }

  return "info";
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

interface TraceRunSummary {
  runIndex: number;
  startedAt: number;
  endedAt: number;
  terminalReason?: Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"];
  events: QueryStreamEvent[];
}

function mapCommandLifecycleTerminalReason(
  event: Extract<QueryStreamEvent, { type: "command_lifecycle" }>,
): Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"] | undefined {
  if (event.state === "completed") {
    return "completed";
  }
  if (event.state === "aborted") {
    return "aborted";
  }
  if (event.state === "failed") {
    return "error";
  }
  return undefined;
}

function buildTraceRunSummaries(events: QueryStreamEvent[]): TraceRunSummary[] {
  if (events.length === 0) {
    return [];
  }
  const runs: TraceRunSummary[] = [];
  let current: TraceRunSummary | null = null;
  let runIndex = 0;

  const ensureCurrent = (at: number) => {
    if (current) return;
    runIndex += 1;
    current = {
      runIndex,
      startedAt: at,
      endedAt: at,
      events: [],
    };
  };

  for (const event of events) {
    if (event.type === "query_start") {
      if (
        current &&
        current.events.length === 1 &&
        current.events[0]?.type === "command_lifecycle" &&
        current.events[0].state === "started"
      ) {
        current.events.push(event);
        current.endedAt = event.at;
        continue;
      }
      if (current && current.events.length > 0) {
        runs.push(current);
      }
      runIndex += 1;
      current = {
        runIndex,
        startedAt: event.at,
        endedAt: event.at,
        events: [event],
      };
      continue;
    }

    ensureCurrent(event.at);
    const active = current as TraceRunSummary;
    active.events.push(event);
    active.endedAt = event.at;
    if (event.type === "query_end") {
      active.terminalReason = event.terminalReason;
      continue;
    }
    if (event.type === "command_lifecycle") {
      const lifecycleTerminalReason = mapCommandLifecycleTerminalReason(event);
      if (lifecycleTerminalReason && !active.terminalReason) {
        active.terminalReason = lifecycleTerminalReason;
      }
    }
  }

  if (current && current.events.length > 0) {
    runs.push(current);
  }

  return runs;
}

function createEmptyTraceCategoryCounts(): Record<TraceCategory, number> {
  return {
    query: 0,
    prompt: 0,
    tools: 0,
    permission: 0,
    queue: 0,
    retry: 0,
    continue: 0,
  };
}

function parseTraceFilterToken(token: string): TraceFilter | null {
  const normalized = token.toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "queue") return "queue";
  if (normalized === "tools" || normalized === "tool") return "tools";
  if (normalized === "permission" || normalized === "permissions" || normalized === "perm") return "permission";
  if (normalized === "query" || normalized === "lifecycle") return "query";
  if (normalized === "prompt" || normalized === "prompts") return "prompt";
  if (normalized === "retry" || normalized === "retries" || normalized === "backoff") return "retry";
  if (normalized === "continue" || normalized === "cont") return "continue";
  return null;
}

function parseTraceSummaryToken(token: string): boolean {
  const normalized = token.toLowerCase();
  return normalized === "summary" || normalized === "runs" || normalized === "run";
}

function parseTraceToolToken(token: string): string | null {
  const normalized = token.toLowerCase();
  if (normalized.startsWith("tool=")) {
    return token.slice(token.indexOf("=") + 1).trim();
  }
  if (normalized.startsWith("tool:")) {
    return token.slice(token.indexOf(":") + 1).trim();
  }
  return null;
}

function parseTraceRunWindowToken(token: string): TraceRunWindow | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("runs=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("window=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  if (payload.toLowerCase() === "all") {
    return "all";
  }
  const parsed = Number.parseInt(payload, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeTraceRiskAlias(value: string): TracePermissionRiskFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "critical" || normalized === "crit" || normalized === "fatal") {
    return "critical";
  }
  if (normalized === "high_risk" || normalized === "highrisk" || normalized === "high") {
    return "high_risk";
  }
  if (normalized === "interactive" || normalized === "interact" || normalized === "tty") {
    return "interactive";
  }
  if (normalized === "path_outside" || normalized === "pathoutside" || normalized === "outside") {
    return "path_outside";
  }
  if (normalized === "policy" || normalized === "default") {
    return "policy";
  }
  return null;
}

function parseTraceRiskToken(token: string): TracePermissionRiskFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("risk=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("risk:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceRiskAlias(payload);
  return parsed ?? "invalid";
}

function normalizeTraceReversibilityAlias(value: string): TracePermissionReversibilityFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "reversible" || normalized === "rev" || normalized === "safe") {
    return "reversible";
  }
  if (normalized === "mixed" || normalized === "partial") {
    return "mixed";
  }
  if (normalized === "hard_to_reverse" || normalized === "irreversible" || normalized === "hard") {
    return "hard_to_reverse";
  }
  return null;
}

function parseTraceReversibilityToken(token: string): TracePermissionReversibilityFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("reversibility=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("reversibility:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("rev=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("rev:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceReversibilityAlias(payload);
  return parsed ?? "invalid";
}

function normalizeTraceBlastRadiusAlias(value: string): TracePermissionBlastRadiusFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "local" || normalized === "local_only") {
    return "local";
  }
  if (normalized === "workspace" || normalized === "workdir") {
    return "workspace";
  }
  if (normalized === "shared" || normalized === "global") {
    return "shared";
  }
  return null;
}

function parseTraceBlastRadiusToken(token: string): TracePermissionBlastRadiusFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("blast=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("blast:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("blast_radius=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("blast_radius:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("radius=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("radius:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceBlastRadiusAlias(payload);
  return parsed ?? "invalid";
}

function getTracePermissionRisk(event: QueryStreamEvent): PermissionRiskClass | null {
  if (event.type === "permission_decision") {
    return event.riskClass ?? "policy";
  }
  if (event.type === "permission_risk_profile") {
    return event.riskClass ?? "policy";
  }
  if (event.type === "authorization_scope_notice") {
    return event.riskClass;
  }
  return null;
}

function getTracePermissionReversibility(
  event: QueryStreamEvent,
): Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["reversibility"] | null {
  if (event.type === "permission_risk_profile") {
    return event.reversibility;
  }
  return null;
}

function getTracePermissionBlastRadius(
  event: QueryStreamEvent,
): Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["blastRadius"] | null {
  if (event.type === "permission_risk_profile") {
    return event.blastRadius;
  }
  return null;
}

function isTraceEventToolMatched(event: QueryStreamEvent, toolName: string): boolean {
  if (event.type === "tool_result") {
    return event.tool === toolName;
  }
  if (event.type === "permission_decision") {
    return event.tool === toolName;
  }
  if (event.type === "permission_risk_profile") {
    return event.tool === toolName;
  }
  if (event.type === "tool_retry_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return false;
}

function includeTraceEventForToolFocus(event: QueryStreamEvent, toolName: string): boolean {
  if (event.type === "tool_result") {
    return event.tool === toolName;
  }
  if (event.type === "permission_decision") {
    return event.tool === toolName;
  }
  if (event.type === "permission_risk_profile") {
    return event.tool === toolName;
  }
  if (event.type === "tool_retry_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return true;
}

interface VisibleTraceRunSummary extends TraceRunSummary {
  visibleEvents: QueryStreamEvent[];
  warningCount: number;
  errorCount: number;
  categoryCounts: Record<TraceCategory, number>;
}

interface TraceHotspotSummary {
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
}

function buildTraceHotspotSummaries(events: QueryStreamEvent[], limit = 8): TraceHotspotSummary[] {
  const counter = new Map<string, TraceHotspotSummary>();
  for (const event of events) {
    if (event.type === "tool_result" && event.outcome !== "result") {
      const current = counter.get(event.tool) ?? {
        tool: event.tool,
        total: 0,
        errors: 0,
        rejected: 0,
        denied: 0,
      };
      current.total += 1;
      if (event.outcome === "error") {
        current.errors += 1;
      } else if (event.outcome === "rejected") {
        current.rejected += 1;
      }
      counter.set(event.tool, current);
    }
    if (event.type === "permission_decision" && event.behavior === "deny") {
      const current = counter.get(event.tool) ?? {
        tool: event.tool,
        total: 0,
        errors: 0,
        rejected: 0,
        denied: 0,
      };
      current.total += 1;
      current.denied += 1;
      counter.set(event.tool, current);
    }
    if (event.type === "tool_retry_guard") {
      const current = counter.get(event.tool) ?? {
        tool: event.tool,
        total: 0,
        errors: 0,
        rejected: 0,
        denied: 0,
      };
      current.total += 1;
      current.errors += 1;
      counter.set(event.tool, current);
    }
  }
  return [...counter.values()]
    .sort((a, b) => b.total - a.total || b.errors - a.errors || b.denied - a.denied || a.tool.localeCompare(b.tool))
    .slice(0, limit);
}

function buildTraceHotspotParts(events: QueryStreamEvent[], limit = 5): string {
  return buildTraceHotspotSummaries(events, limit)
    .map((item) => `${item.tool}=${item.total}`)
    .join(" ");
}

function buildTracePermissionRiskParts(context: CommandContext, events: QueryStreamEvent[]): string {
  const counts = new Map<PermissionRiskClass, number>();
  for (const event of events) {
    const risk = getTracePermissionRisk(event);
    if (!risk) {
      continue;
    }
    counts.set(risk, (counts.get(risk) ?? 0) + 1);
  }
  return TRACE_PERMISSION_RISK_ORDER
    .filter((risk) => (counts.get(risk) ?? 0) > 0)
    .map((risk) => `${context.t(`agent.trace.permissionRisk.${risk}`)}=${counts.get(risk)}`)
    .join(" ");
}

interface TracePermissionRiskProfileStats {
  reversible: number;
  mixed: number;
  hardToReverse: number;
  local: number;
  workspace: number;
  shared: number;
  total: number;
}

function buildTracePermissionRiskProfileStats(events: QueryStreamEvent[]): TracePermissionRiskProfileStats {
  const stats: TracePermissionRiskProfileStats = {
    reversible: 0,
    mixed: 0,
    hardToReverse: 0,
    local: 0,
    workspace: 0,
    shared: 0,
    total: 0,
  };

  for (const event of events) {
    if (event.type !== "permission_risk_profile") {
      continue;
    }
    stats.total += 1;
    if (event.reversibility === "reversible") stats.reversible += 1;
    else if (event.reversibility === "mixed") stats.mixed += 1;
    else stats.hardToReverse += 1;

    if (event.blastRadius === "local") stats.local += 1;
    else if (event.blastRadius === "workspace") stats.workspace += 1;
    else stats.shared += 1;
  }

  return stats;
}

function buildTracePermissionRiskProfileLine(
  context: CommandContext,
  events: QueryStreamEvent[],
): string | null {
  const stats = buildTracePermissionRiskProfileStats(events);
  if (stats.total === 0) {
    return null;
  }
  return context.t("agent.command.trace.riskProfileMatrix", {
    reversible: stats.reversible,
    mixed: stats.mixed,
    hardToReverse: stats.hardToReverse,
    local: stats.local,
    workspace: stats.workspace,
    shared: stats.shared,
  });
}

type FallbackSuppressedEvent = Extract<QueryStreamEvent, { type: "fallback_suppressed" }>;

interface TraceFallbackStats {
  used: number;
  suppressed: number;
  latestSuppressed: FallbackSuppressedEvent | null;
}

function buildTraceFallbackStats(events: QueryStreamEvent[]): TraceFallbackStats {
  let used = 0;
  let suppressed = 0;
  let latestSuppressed: FallbackSuppressedEvent | null = null;

  for (const event of events) {
    if (event.type === "continue" && event.transition.reason === "fallback_retry") {
      used += 1;
      continue;
    }
    if (event.type === "fallback_suppressed") {
      suppressed += 1;
      latestSuppressed = event;
    }
  }

  return {
    used,
    suppressed,
    latestSuppressed,
  };
}

type TraceQueuePriority = NonNullable<Extract<QueryStreamEvent, { type: "queue_update" }>["priority"]>;
type TraceQueueAction = Extract<QueryStreamEvent, { type: "queue_update" }>["action"];
type TraceQueuePressure = "idle" | "busy" | "congested" | "saturated";

interface TraceQueuePriorityStats {
  total: number;
  queued: Record<TraceQueuePriority, number>;
  dequeued: Record<TraceQueuePriority, number>;
  rejected: Record<TraceQueuePriority, number>;
  latestQueueDepth: number;
  maxQueueDepth: number;
  pressure: TraceQueuePressure;
}

function createEmptyTraceQueuePriorityCounter(): Record<TraceQueuePriority, number> {
  return {
    now: 0,
    next: 0,
    later: 0,
  };
}

function deriveQueuePressure(depth: number, queueLimit: number): TraceQueuePressure {
  const normalizedDepth = Math.max(0, depth);
  if (normalizedDepth <= 0) {
    return "idle";
  }
  if (queueLimit > 0) {
    const ratio = normalizedDepth / queueLimit;
    if (ratio >= 1) {
      return "saturated";
    }
    if (ratio >= 0.75) {
      return "congested";
    }
    return "busy";
  }
  if (normalizedDepth >= 8) {
    return "saturated";
  }
  if (normalizedDepth >= 4) {
    return "congested";
  }
  return "busy";
}

function buildTraceQueuePriorityStats(events: QueryStreamEvent[], queueLimit = 0): TraceQueuePriorityStats {
  const stats: TraceQueuePriorityStats = {
    total: 0,
    queued: createEmptyTraceQueuePriorityCounter(),
    dequeued: createEmptyTraceQueuePriorityCounter(),
    rejected: createEmptyTraceQueuePriorityCounter(),
    latestQueueDepth: 0,
    maxQueueDepth: 0,
    pressure: "idle",
  };
  for (const event of events) {
    if (event.type !== "queue_update") {
      continue;
    }
    stats.latestQueueDepth = Math.max(0, event.queueCount);
    if (event.queueCount > stats.maxQueueDepth) {
      stats.maxQueueDepth = event.queueCount;
    }
    if (!event.priority) {
      continue;
    }
    const action: TraceQueueAction = event.action;
    stats[action][event.priority] += 1;
    stats.total += 1;
  }
  const pressureDepth = Math.max(stats.latestQueueDepth, stats.maxQueueDepth);
  stats.pressure = deriveQueuePressure(pressureDepth, queueLimit);
  return stats;
}

function buildTraceInvestigateRunbookLines(options: {
  context: CommandContext;
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): string[] {
  const {
    context,
    tool,
    total,
    errors,
    rejected,
    denied,
    runWindow,
    riskFilter,
    reversibilityFilter,
    blastRadiusFilter,
  } = options;
  const scopedFilters: string[] = [];
  if (riskFilter !== "all") scopedFilters.push(`risk=${riskFilter}`);
  if (reversibilityFilter !== "all") scopedFilters.push(`reversibility=${reversibilityFilter}`);
  if (blastRadiusFilter !== "all") scopedFilters.push(`blast=${blastRadiusFilter}`);
  const traceCommand = `/trace summary failure tool=${tool} ${
    runWindow === "all" ? "runs=all" : `runs=${runWindow}`
  }${scopedFilters.length > 0 ? ` ${scopedFilters.join(" ")}` : ""}`;
  return [
    context.t("agent.command.trace.investigateRunbookTitle"),
    context.t("agent.command.trace.investigateRunbookScope", {
      tool,
      total,
      errors,
      rejected,
      denied,
    }),
    context.t("agent.command.trace.investigateRunbookDiagnosis"),
    context.t("agent.command.trace.investigateRunbookDiagnosisItem", { command: traceCommand }),
    context.t("agent.command.trace.investigateRunbookFix"),
    context.t("agent.command.trace.investigateRunbookFixItem"),
    context.t("agent.command.trace.investigateRunbookVerify"),
    context.t("agent.command.trace.investigateRunbookVerifyItemLint"),
    context.t("agent.command.trace.investigateRunbookVerifyItemBuild"),
    context.t("agent.command.trace.investigateRunbookVerifyItemTest"),
    context.t("agent.command.trace.investigateRunbookRollback"),
    context.t("agent.command.trace.investigateRunbookRollbackItem"),
  ];
}

function buildVisibleTraceRunSummaries(options: {
  events: QueryStreamEvent[];
  filter: TraceFilter;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
  warningsOnly: boolean;
  failureFocus: boolean;
  toolFocus: string | null;
  runWindow: TraceRunWindow;
}): VisibleTraceRunSummary[] {
  const {
    events,
    filter,
    riskFilter,
    reversibilityFilter,
    blastRadiusFilter,
    warningsOnly,
    failureFocus,
    toolFocus,
    runWindow,
  } = options;
  const runs = buildTraceRunSummaries(events);
  const scopedRuns = runWindow === "all" ? runs : runs.slice(-runWindow);
  const next: VisibleTraceRunSummary[] = [];

  for (const run of scopedRuns) {
    if (toolFocus && !run.events.some((event) => isTraceEventToolMatched(event, toolFocus))) {
      continue;
    }
    const visibleEvents = run.events.filter((event) => {
      if (filter !== "all" && getTraceEventFilter(event) !== filter) {
        return false;
      }
      if (warningsOnly && getTraceEventSeverity(event) === "info") {
        return false;
      }
      if (toolFocus && !includeTraceEventForToolFocus(event, toolFocus)) {
        return false;
      }
      if (riskFilter !== "all") {
        const risk = getTracePermissionRisk(event);
        if (!risk || risk !== riskFilter) {
          return false;
        }
      }
      if (reversibilityFilter !== "all") {
        const reversibility = getTracePermissionReversibility(event);
        if (!reversibility || reversibility !== reversibilityFilter) {
          return false;
        }
      }
      if (blastRadiusFilter !== "all") {
        const blastRadius = getTracePermissionBlastRadius(event);
        if (!blastRadius || blastRadius !== blastRadiusFilter) {
          return false;
        }
      }
      return true;
    });
    if (visibleEvents.length === 0) {
      continue;
    }

    const warningCount = visibleEvents.reduce((count, event) => {
      return getTraceEventSeverity(event) === "warn" ? count + 1 : count;
    }, 0);
    const errorCount = visibleEvents.reduce((count, event) => {
      return getTraceEventSeverity(event) === "error" ? count + 1 : count;
    }, 0);
    if (failureFocus && warningCount === 0 && errorCount === 0) {
      continue;
    }
    const categoryCounts = visibleEvents.reduce((acc, event) => {
      const category = getTraceEventFilter(event);
      acc[category] += 1;
      return acc;
    }, createEmptyTraceCategoryCounts());

    next.push({
      ...run,
      visibleEvents,
      warningCount,
      errorCount,
      categoryCounts,
    });
  }

  return next;
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

const helpCommand: SlashCommand = {
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

const toolsCommand: SlashCommand = {
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

const statusCommand: SlashCommand = {
  name: "status",
  aliases: ["st"],
  category: "core",
  descriptionKey: "agent.command.status.description",
  usageKey: "agent.command.status.usage",
  execute: async (context) => {
    const tasks = context.taskManager.listTasks();
    const runningTasks = tasks.filter((task) => task.status === "running").length;
    const queuePressureLabel = context.t(`agent.trace.queuePressure.${deriveQueuePressure(context.queueCount, context.queueLimit)}`);
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
        context.t("agent.command.status.tasks", { running: runningTasks, total: tasks.length }),
        context.t("agent.command.status.tools", { count: context.getToolNames().length }),
        context.t("agent.command.status.permissionMode", { mode: context.permissionMode }),
        context.t("agent.command.status.permissionRules", { count: context.permissionRules.length }),
      ].join("\n"),
    };
  },
};

const usageCommand: SlashCommand = {
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

const traceCommand: SlashCommand = {
  name: "trace",
  aliases: ["events"],
  category: "core",
  descriptionKey: "agent.command.trace.description",
  usageKey: "agent.command.trace.usage",
  execute: async (context) => {
    const args = context.parsed.args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
    if (args[0]?.toLowerCase() === "clear") {
      context.clearQueryEvents();
      return { message: context.t("agent.command.trace.cleared") };
    }

    let limit = 20;
    let filter: TraceFilter = "all";
    let warningsOnly = false;
    let summaryMode = false;
    let hotspotsMode = false;
    let hottestMode = false;
    let investigateMode = false;
    let investigateRunbookMode = false;
    let investigateWorkflowMode = false;
    let investigateSubmitMode = false;
    let failureFocus = false;
    let toolFocus: string | null = null;
    let runWindow: TraceRunWindow = "all";
    let riskFilter: TracePermissionRiskFilter = "all";
    let reversibilityFilter: TracePermissionReversibilityFilter = "all";
    let blastRadiusFilter: TracePermissionBlastRadiusFilter = "all";

    for (const raw of args) {
      const token = raw.toLowerCase();
      if (token === "warn" || token === "warning" || token === "warnings") {
        warningsOnly = true;
        continue;
      }
      if (token === "failure" || token === "failures" || token === "failurefocus" || token === "focus") {
        failureFocus = true;
        continue;
      }

      if (parseTraceSummaryToken(token)) {
        summaryMode = true;
        continue;
      }
      if (token === "hotspots" || token === "hotspot") {
        hotspotsMode = true;
        continue;
      }
      if (token === "hottest" || token === "toptool" || token === "top-tool" || token === "top") {
        hottestMode = true;
        continue;
      }
      if (token === "investigate" || token === "investigation" || token === "invest") {
        investigateMode = true;
        continue;
      }
      if (token === "runbook" || token === "playbook") {
        investigateRunbookMode = true;
        continue;
      }
      if (token === "workflow" || token === "task") {
        investigateWorkflowMode = true;
        continue;
      }
      if (token === "execute" || token === "submit" || token === "run") {
        investigateSubmitMode = true;
        continue;
      }

      const parsedToolFocus = parseTraceToolToken(raw);
      if (parsedToolFocus !== null) {
        if (!parsedToolFocus) {
          return { error: true, message: context.t("agent.command.trace.invalidLimit") };
        }
        toolFocus = parsedToolFocus;
        continue;
      }

      const parsedRunWindow = parseTraceRunWindowToken(raw);
      if (parsedRunWindow !== null) {
        runWindow = parsedRunWindow;
        continue;
      }

      const parsedRiskFilter = parseTraceRiskToken(raw);
      if (parsedRiskFilter === "invalid") {
        return { error: true, message: context.t("agent.command.trace.invalidLimit") };
      }
      if (parsedRiskFilter !== null) {
        riskFilter = parsedRiskFilter;
        continue;
      }

      const parsedReversibilityFilter = parseTraceReversibilityToken(raw);
      if (parsedReversibilityFilter === "invalid") {
        return { error: true, message: context.t("agent.command.trace.invalidLimit") };
      }
      if (parsedReversibilityFilter !== null) {
        reversibilityFilter = parsedReversibilityFilter;
        continue;
      }

      const parsedBlastRadiusFilter = parseTraceBlastRadiusToken(raw);
      if (parsedBlastRadiusFilter === "invalid") {
        return { error: true, message: context.t("agent.command.trace.invalidLimit") };
      }
      if (parsedBlastRadiusFilter !== null) {
        blastRadiusFilter = parsedBlastRadiusFilter;
        continue;
      }

      const parsedFilter = parseTraceFilterToken(token);
      if (parsedFilter) {
        filter = parsedFilter;
        continue;
      }

      const parsedLimit = Number.parseInt(token, 10);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
        continue;
      }

      return { error: true, message: context.t("agent.command.trace.invalidLimit") };
    }

    const usingPromptOnlyShortcut =
      args.length === 1 &&
      parseTraceFilterToken(args[0]?.toLowerCase() ?? "") === "prompt";
    if (
      usingPromptOnlyShortcut &&
      !summaryMode &&
      !hotspotsMode &&
      !investigateMode
    ) {
      summaryMode = true;
      limit = Math.max(limit, 8);
    }

    const fetchLimit = 80;
    const allEvents = context.getRecentQueryEvents(fetchLimit);
    let effectiveToolFocus = toolFocus;
    let hottestApplied = false;
    if (hottestMode && !effectiveToolFocus) {
      const candidateRuns = buildVisibleTraceRunSummaries({
        events: allEvents,
        filter,
        riskFilter,
        reversibilityFilter,
        blastRadiusFilter,
        warningsOnly,
        failureFocus,
        toolFocus: null,
        runWindow,
      });
      const hottest = buildTraceHotspotSummaries(
        candidateRuns.flatMap((run) => run.visibleEvents),
        1,
      )[0];
      if (hottest) {
        effectiveToolFocus = hottest.tool;
        hottestApplied = true;
      }
    }
    const visibleRuns = buildVisibleTraceRunSummaries({
      events: allEvents,
      filter,
      riskFilter,
      reversibilityFilter,
      blastRadiusFilter,
      warningsOnly,
      failureFocus,
      toolFocus: effectiveToolFocus,
      runWindow,
    });
    const flattenedVisibleEvents = visibleRuns.flatMap((run) => run.visibleEvents);
    const visibleEvents =
      flattenedVisibleEvents.length > limit
        ? flattenedVisibleEvents.slice(flattenedVisibleEvents.length - limit)
        : flattenedVisibleEvents;

    if (visibleEvents.length === 0) {
      return {
        message: [
          context.t("agent.command.trace.title", { count: 0 }),
          context.t("agent.command.trace.empty"),
        ].join("\n"),
      };
    }

    const lines = visibleEvents.map((event) => {
      const at = formatTime(context.locale, event.at);
      return `[${at}] ${formatTraceEventLine(context, event)}`;
    });

    const filterLabel =
      filter === "all"
        ? context.t("agent.trace.filter.all")
        : context.t(`agent.trace.filter.${filter}`);
    const filterSuffixes: string[] = [];
    if (warningsOnly) {
      filterSuffixes.push(context.t("agent.trace.filter.warningsOnly"));
    }
    if (failureFocus) {
      filterSuffixes.push(context.t("agent.trace.filter.failureFocus"));
    }
    if (hottestMode) {
      if (hottestApplied && effectiveToolFocus) {
        filterSuffixes.push(context.t("agent.command.trace.filterHottestApplied", { tool: effectiveToolFocus }));
      } else {
        filterSuffixes.push(context.t("agent.command.trace.filterHottestNoData"));
      }
    }
    if (effectiveToolFocus) {
      filterSuffixes.push(context.t("agent.command.trace.filterTool", { tool: effectiveToolFocus }));
    }
    if (runWindow === "all") {
      filterSuffixes.push(context.t("agent.command.trace.filterRunsAll"));
    } else {
      filterSuffixes.push(context.t("agent.command.trace.filterRunsWindow", { runs: runWindow }));
    }
    if (riskFilter !== "all") {
      filterSuffixes.push(
        context.t("agent.command.trace.filterRisk", {
          risk: context.t(`agent.trace.permissionRisk.${riskFilter}`),
        }),
      );
    }
    if (reversibilityFilter !== "all") {
      filterSuffixes.push(
        context.t("agent.command.trace.filterReversibility", {
          value: context.t(`agent.permission.prompt.reversibility.${reversibilityFilter}`),
        }),
      );
    }
    if (blastRadiusFilter !== "all") {
      filterSuffixes.push(
        context.t("agent.command.trace.filterBlastRadius", {
          value: context.t(`agent.permission.prompt.blastRadius.${blastRadiusFilter}`),
        }),
      );
    }
    const warningLabel = filterSuffixes.length > 0 ? ` | ${filterSuffixes.join(" | ")}` : "";

    if (hotspotsMode) {
      const hotspotLimit = Math.max(1, Math.min(20, limit));
      const hotspotVisibleEvents = visibleRuns.flatMap((run) => run.visibleEvents);
      const hotspotSummaries = buildTraceHotspotSummaries(
        hotspotVisibleEvents,
        hotspotLimit,
      );
      if (hotspotSummaries.length === 0) {
        return {
          message: [
            context.t("agent.command.trace.hotspotsTitle", { count: 0 }),
            context.t("agent.command.trace.appliedFilter", {
              filter: filterLabel,
              warnings: warningLabel,
            }),
            context.t("agent.command.trace.hotspotsEmpty"),
          ].join("\n"),
        };
      }
      const lines = hotspotSummaries.map((item, index) =>
        context.t("agent.command.trace.hotspotLine", {
          index: index + 1,
          tool: item.tool,
          total: item.total,
          errors: item.errors,
          rejected: item.rejected,
          denied: item.denied,
        }),
      );
      const top = hotspotSummaries[0];
      const riskProfileParts = buildTracePermissionRiskParts(
        context,
        hotspotVisibleEvents,
      );
      const riskProfileLine = riskProfileParts
        ? context.t("agent.command.trace.riskProfile", { risks: riskProfileParts })
        : null;
      const riskProfileMatrixLine = buildTracePermissionRiskProfileLine(
        context,
        hotspotVisibleEvents,
      );
      const queuePriorityStats = buildTraceQueuePriorityStats(hotspotVisibleEvents, context.queueLimit);
      const queuePriorityLine =
        queuePriorityStats.total > 0 || queuePriorityStats.latestQueueDepth > 0
          ? context.t("agent.command.trace.hotspotsQueuePriority", {
              nowLabel: context.t("agent.queue.priority.now"),
              nowQueued: formatNumber(queuePriorityStats.queued.now),
              nowDequeued: formatNumber(queuePriorityStats.dequeued.now),
              nowRejected: formatNumber(queuePriorityStats.rejected.now),
              nextLabel: context.t("agent.queue.priority.next"),
              nextQueued: formatNumber(queuePriorityStats.queued.next),
              nextDequeued: formatNumber(queuePriorityStats.dequeued.next),
              nextRejected: formatNumber(queuePriorityStats.rejected.next),
              laterLabel: context.t("agent.queue.priority.later"),
              laterQueued: formatNumber(queuePriorityStats.queued.later),
              laterDequeued: formatNumber(queuePriorityStats.dequeued.later),
              laterRejected: formatNumber(queuePriorityStats.rejected.later),
              depth: formatNumber(queuePriorityStats.latestQueueDepth),
              limitSuffix: context.queueLimit > 0 ? `/${formatNumber(context.queueLimit)}` : "",
              pressure: context.t(`agent.trace.queuePressure.${queuePriorityStats.pressure}`),
            })
          : null;
      const scopeFilterTokens: string[] = [];
      if (riskFilter !== "all") scopeFilterTokens.push(`risk=${riskFilter}`);
      if (reversibilityFilter !== "all") scopeFilterTokens.push(`reversibility=${reversibilityFilter}`);
      if (blastRadiusFilter !== "all") scopeFilterTokens.push(`blast=${blastRadiusFilter}`);
      const hintCommand = top
        ? `/trace summary failure tool=${top.tool} ${runWindow === "all" ? "runs=all" : `runs=${runWindow}`}${
            scopeFilterTokens.length > 0 ? ` ${scopeFilterTokens.join(" ")}` : ""
          }`
        : null;
      return {
        message: [
          context.t("agent.command.trace.hotspotsTitle", { count: hotspotSummaries.length }),
          context.t("agent.command.trace.appliedFilter", {
            filter: filterLabel,
            warnings: warningLabel,
          }),
          ...(riskProfileLine ? [riskProfileLine] : []),
          ...(riskProfileMatrixLine ? [riskProfileMatrixLine] : []),
          ...(queuePriorityLine ? [queuePriorityLine] : []),
          ...lines,
          ...(hintCommand ? [context.t("agent.command.trace.hotspotsHint", { command: hintCommand })] : []),
        ].join("\n"),
      };
    }

    if (investigateMode) {
      const hottest = buildTraceHotspotSummaries(
        visibleRuns.flatMap((run) => run.visibleEvents),
        1,
      )[0];
      if (!hottest) {
        return {
          message: [
            context.t("agent.command.trace.investigateTitleEmpty"),
            context.t("agent.command.trace.appliedFilter", {
              filter: filterLabel,
              warnings: warningLabel,
            }),
            context.t("agent.command.trace.hotspotsEmpty"),
          ].join("\n"),
        };
      }
      const prompt = context.t("agent.command.trace.investigatePrompt", {
        tool: hottest.tool,
        total: hottest.total,
        errors: hottest.errors,
        rejected: hottest.rejected,
        denied: hottest.denied,
      });
      const runbookLines = buildTraceInvestigateRunbookLines({
        context,
        tool: hottest.tool,
        total: hottest.total,
        errors: hottest.errors,
        rejected: hottest.rejected,
        denied: hottest.denied,
        runWindow,
        riskFilter,
        reversibilityFilter,
        blastRadiusFilter,
      });
      const workflowTask = investigateWorkflowMode
        ? context.taskManager.createTask({
            type: "local_workflow",
            description: context.t("agent.command.trace.investigateWorkflowDescription", {
              tool: hottest.tool,
            }),
            metadata: {
              source: "trace_investigate",
              tool: hottest.tool,
              total: hottest.total,
              errors: hottest.errors,
              rejected: hottest.rejected,
              denied: hottest.denied,
            },
            run: async ({ log }) => {
              log(context.t("agent.command.trace.investigateWorkflowLogHeader", { tool: hottest.tool }));
              for (const line of runbookLines) {
                log(line);
              }
            },
          })
        : null;
      const submitResult = investigateSubmitMode
        ? context.submitFollowupQuery(prompt, {
            model: context.currentModel,
            permissionMode: context.permissionMode,
            priority: "later",
          })
        : null;
      const submitResultLine = submitResult
        ? submitResult.accepted
          ? submitResult.started
            ? context.t("agent.command.trace.investigateSubmitStarted")
            : context.t("agent.command.trace.investigateSubmitQueued", {
                queue: submitResult.queueCount,
                limit: submitResult.queueLimit,
              })
          : submitResult.reason === "queue_full"
            ? context.t("agent.command.trace.investigateSubmitQueueFull", {
                queue: submitResult.queueCount,
                limit: submitResult.queueLimit,
              })
            : context.t("agent.command.trace.investigateSubmitEmpty")
        : null;
      return {
        message: [
          context.t("agent.command.trace.investigateTitle", { tool: hottest.tool }),
          context.t("agent.command.trace.appliedFilter", {
            filter: filterLabel,
            warnings: warningLabel,
          }),
          context.t("agent.command.trace.investigateStats", {
            total: hottest.total,
            errors: hottest.errors,
            rejected: hottest.rejected,
            denied: hottest.denied,
          }),
          ...(submitResultLine ? ["", submitResultLine] : []),
          "",
          prompt,
          ...(investigateRunbookMode || investigateWorkflowMode
            ? ["", ...runbookLines]
            : []),
          ...(workflowTask
            ? [
                "",
                context.t("agent.command.task.created", { taskId: workflowTask.id }),
                context.t("agent.command.task.createdType", { type: workflowTask.type }),
                context.t("agent.command.task.createdDescription", { description: workflowTask.description }),
                context.t("agent.command.task.createdHint", { taskId: workflowTask.id }),
              ]
            : []),
        ].join("\n"),
      };
    }

    if (summaryMode) {
      const limitedVisibleRuns = visibleRuns.length > limit
        ? visibleRuns.slice(visibleRuns.length - limit)
        : visibleRuns;

      if (limitedVisibleRuns.length === 0) {
        return {
          message: [
            context.t("agent.command.trace.summaryTitle", { count: 0 }),
            context.t("agent.command.trace.empty"),
          ].join("\n"),
        };
      }

      const summaryLines = limitedVisibleRuns.map((run) => {
        const durationSec = Math.max(0, ((run.endedAt - run.startedAt) / 1000)).toFixed(1);
        const terminalReason = run.terminalReason
          ? formatTerminalReasonLabel(context, {
              type: "query_end",
              terminalReason: run.terminalReason,
              durationMs: Math.max(0, run.endedAt - run.startedAt),
              at: run.endedAt,
            })
          : context.t("agent.trace.runStatusOngoing");
        const categoryParts = TRACE_CATEGORY_ORDER
          .filter((category) => run.categoryCounts[category] > 0)
          .map((category) => `${context.t(`agent.trace.bucket.${category}`)}=${run.categoryCounts[category]}`)
          .join(" ");
        const baseLine = context.t("agent.command.trace.summaryLine", {
          run: run.runIndex,
          status: terminalReason,
          duration: durationSec,
          events: run.visibleEvents.length,
          warns: run.warningCount,
          errors: run.errorCount,
          categories: categoryParts,
        });
        const detailLines: string[] = [];
        const promptEvents = run.visibleEvents.filter(
          (event): event is Extract<QueryStreamEvent, { type: "prompt_compiled" }> =>
            event.type === "prompt_compiled",
        );
        if (promptEvents.length > 0) {
          const latestPrompt = promptEvents[promptEvents.length - 1];
          const promptLine = formatTraceEventLine(context, latestPrompt);
          detailLines.push(`${context.t("agent.trace.bucket.prompt")}: ${promptLine}`);
        }
        const hotspotParts = buildTraceHotspotParts(run.visibleEvents, 5);
        if (hotspotParts) {
          detailLines.push(
            context.t("agent.command.trace.summaryHotspots", { hotspots: hotspotParts }),
          );
        }
        const riskProfileMatrixLine = buildTracePermissionRiskProfileLine(context, run.visibleEvents);
        if (riskProfileMatrixLine) {
          detailLines.push(riskProfileMatrixLine);
        }
        const fallbackStats = buildTraceFallbackStats(run.visibleEvents);
        if (fallbackStats.used > 0 || fallbackStats.suppressed > 0) {
          const fallbackLineKey = fallbackStats.latestSuppressed
            ? "agent.command.trace.summaryFallbackDetailed"
            : "agent.command.trace.summaryFallback";
          detailLines.push(
            context.t(fallbackLineKey, {
              used: formatNumber(fallbackStats.used),
              suppressed: formatNumber(fallbackStats.suppressed),
              reason: fallbackStats.latestSuppressed
                ? context.t(
                    `agent.trace.fallbackSuppressedReason.${fallbackStats.latestSuppressed.reason}`,
                  )
                : "-",
              strategy: fallbackStats.latestSuppressed
                ? formatRetryStrategyLabel(context, fallbackStats.latestSuppressed.retryStrategy)
                : formatRetryStrategyLabel(context, "balanced"),
            }),
          );
        }
        const queuePriorityStats = buildTraceQueuePriorityStats(run.visibleEvents, context.queueLimit);
        if (queuePriorityStats.total > 0) {
          detailLines.push(
            context.t("agent.command.trace.summaryQueuePriority", {
              nowLabel: context.t("agent.queue.priority.now"),
              nowQueued: formatNumber(queuePriorityStats.queued.now),
              nowDequeued: formatNumber(queuePriorityStats.dequeued.now),
              nowRejected: formatNumber(queuePriorityStats.rejected.now),
              nextLabel: context.t("agent.queue.priority.next"),
              nextQueued: formatNumber(queuePriorityStats.queued.next),
              nextDequeued: formatNumber(queuePriorityStats.dequeued.next),
              nextRejected: formatNumber(queuePriorityStats.rejected.next),
              laterLabel: context.t("agent.queue.priority.later"),
              laterQueued: formatNumber(queuePriorityStats.queued.later),
              laterDequeued: formatNumber(queuePriorityStats.dequeued.later),
              laterRejected: formatNumber(queuePriorityStats.rejected.later),
            }),
          );
        }
        if (detailLines.length === 0) {
          return baseLine;
        }
        return `${baseLine}\n  ${detailLines.join("\n  ")}`;
      });
      const overallVisibleEvents = limitedVisibleRuns.flatMap((run) => run.visibleEvents);
      const overallHotspotParts = buildTraceHotspotParts(
        overallVisibleEvents,
        8,
      );
      const overallHotspotLine = overallHotspotParts
        ? context.t("agent.command.trace.summaryGlobalHotspots", { hotspots: overallHotspotParts })
        : null;
      const overallRiskParts = buildTracePermissionRiskParts(
        context,
        overallVisibleEvents,
      );
      const overallRiskLine = overallRiskParts
        ? context.t("agent.command.trace.riskProfile", { risks: overallRiskParts })
        : null;
      const overallRiskProfileMatrixLine = buildTracePermissionRiskProfileLine(
        context,
        overallVisibleEvents,
      );
      const overallFallbackStats = buildTraceFallbackStats(
        overallVisibleEvents,
      );
      const overallQueuePriorityStats = buildTraceQueuePriorityStats(overallVisibleEvents, context.queueLimit);
      const overallFallbackLine =
        overallFallbackStats.used > 0 || overallFallbackStats.suppressed > 0
          ? context.t(
              overallFallbackStats.latestSuppressed
                ? "agent.command.trace.summaryGlobalFallbackDetailed"
                : "agent.command.trace.summaryGlobalFallback",
              {
                used: formatNumber(overallFallbackStats.used),
                suppressed: formatNumber(overallFallbackStats.suppressed),
                reason: overallFallbackStats.latestSuppressed
                  ? context.t(
                      `agent.trace.fallbackSuppressedReason.${overallFallbackStats.latestSuppressed.reason}`,
                    )
                  : "-",
                strategy: overallFallbackStats.latestSuppressed
                  ? formatRetryStrategyLabel(context, overallFallbackStats.latestSuppressed.retryStrategy)
                  : formatRetryStrategyLabel(context, "balanced"),
              },
            )
          : null;
      const overallQueuePriorityLine =
        overallQueuePriorityStats.total > 0
          ? context.t("agent.command.trace.summaryGlobalQueuePriority", {
              nowLabel: context.t("agent.queue.priority.now"),
              nowQueued: formatNumber(overallQueuePriorityStats.queued.now),
              nowDequeued: formatNumber(overallQueuePriorityStats.dequeued.now),
              nowRejected: formatNumber(overallQueuePriorityStats.rejected.now),
              nextLabel: context.t("agent.queue.priority.next"),
              nextQueued: formatNumber(overallQueuePriorityStats.queued.next),
              nextDequeued: formatNumber(overallQueuePriorityStats.dequeued.next),
              nextRejected: formatNumber(overallQueuePriorityStats.rejected.next),
              laterLabel: context.t("agent.queue.priority.later"),
              laterQueued: formatNumber(overallQueuePriorityStats.queued.later),
              laterDequeued: formatNumber(overallQueuePriorityStats.dequeued.later),
              laterRejected: formatNumber(overallQueuePriorityStats.rejected.later),
            })
          : null;

      return {
        message: [
          context.t("agent.command.trace.summaryTitle", { count: limitedVisibleRuns.length }),
          context.t("agent.command.trace.appliedFilter", {
            filter: filterLabel,
            warnings: warningLabel,
          }),
          ...(overallHotspotLine ? [overallHotspotLine] : []),
          ...(overallRiskLine ? [overallRiskLine] : []),
          ...(overallRiskProfileMatrixLine ? [overallRiskProfileMatrixLine] : []),
          ...(overallFallbackLine ? [overallFallbackLine] : []),
          ...(overallQueuePriorityLine ? [overallQueuePriorityLine] : []),
          ...summaryLines,
        ].join("\n"),
      };
    }

    return {
      message: [
        context.t("agent.command.trace.title", { count: visibleEvents.length }),
        context.t("agent.command.trace.appliedFilter", {
          filter: filterLabel,
          warnings: warningLabel,
        }),
        ...lines,
      ].join("\n"),
    };
  },
};

const permissionsCommand: SlashCommand = {
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

const taskCommand: SlashCommand = {
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

const gitCommand: SlashCommand = {
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

const rewindCommand: SlashCommand = {
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

const promptCommand: SlashCommand = {
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

const doctorCommand: SlashCommand = {
  name: "doctor",
  category: "core",
  descriptionKey: "agent.command.doctor.description",
  usageKey: "agent.command.doctor.usage",
  execute: async (context) => {
    const mode = context.parsed.args[0]?.toLowerCase();
    const subMode = context.parsed.args[1]?.toLowerCase();
    if (mode === "fallback" && subMode === "investigate") {
      const kv = parseKeyValueArgs(context.parsed.args.slice(2));
      const fallbackSuppressed = parseNonNegativeNumber(kv.fallback_suppressed, 0);
      const fallbackUsed = parseNonNegativeNumber(kv.fallback_used, 0);
      const retryEvents = parseNonNegativeNumber(kv.retry_events, 0);
      const derivedTotal = fallbackSuppressed + fallbackUsed;
      const suppressionRatioPct = parseNonNegativeNumber(
        kv.suppression_ratio_pct,
        derivedTotal > 0 ? Math.round((fallbackSuppressed / derivedTotal) * 100) : 0,
      );
      const reasonLabel = formatFallbackSuppressedReasonLabel(context, kv.last_reason ?? kv.reason ?? "unknown");
      const strategyLabel = formatRetryStrategyLabel(
        context,
        (kv.last_strategy ?? kv.strategy ?? "balanced").replace(/\s+/g, "_"),
      );
      const queuePressure = deriveQueuePressure(context.queueCount, context.queueLimit);
      const queuePressureLabel = context.t(`agent.trace.queuePressure.${queuePressure}`);
      const assessmentKey =
        suppressionRatioPct >= DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT || fallbackSuppressed > 0
          ? "agent.command.doctor.fallbackInvestigateAssessmentHigh"
          : "agent.command.doctor.fallbackInvestigateAssessmentNormal";
      return {
        message: [
          context.t("agent.command.doctor.fallbackInvestigateTitle"),
          context.t("agent.command.doctor.fallbackInvestigateScope", {
            suppressed: formatNumber(fallbackSuppressed),
            used: formatNumber(fallbackUsed),
            ratio: formatNumber(suppressionRatioPct),
            retryEvents: formatNumber(retryEvents),
            reason: reasonLabel,
            strategy: strategyLabel,
            pressure: queuePressureLabel,
          }),
          context.t(assessmentKey),
          context.t("agent.command.doctor.fallbackInvestigateDiagnosisHeader"),
          context.t("agent.command.doctor.fallbackInvestigateDiagnosisTraceSummary"),
          context.t("agent.command.doctor.fallbackInvestigateDiagnosisQueueHotspots"),
          context.t("agent.command.doctor.fallbackInvestigateFixHeader"),
          context.t("agent.command.doctor.fallbackInvestigateFixPolicy"),
          context.t("agent.command.doctor.fallbackInvestigateFixQueue"),
          context.t("agent.command.doctor.fallbackInvestigateVerifyHeader"),
          context.t("agent.command.doctor.fallbackInvestigateVerifyStatus"),
          context.t("agent.command.doctor.fallbackInvestigateVerifyDoctor"),
          context.t("agent.command.doctor.fallbackInvestigateVerifyOutcome"),
        ].join("\n"),
      };
    }

    const lines: string[] = [context.t("agent.command.doctor.title")];
    const recommendations: string[] = [];
    let hasGitRepo: boolean | null = null;

    const apiState = context.currentModel
      ? context.t("agent.command.doctor.apiReady", { model: context.currentModel })
      : context.t("agent.command.doctor.apiMissing");
    lines.push(`[OK] ${apiState}`);

    if (!context.workingDir) {
      lines.push(`[WARN] ${context.t("agent.command.doctor.workspaceMissing")}`);
      recommendations.push(context.t("agent.command.doctor.recommend.selectWorkspace"));
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
        lines.push(
          `[OK] ${context.t("agent.command.doctor.workspaceOk", {
            workspace: context.workingDir,
            count: formatNumber(count),
          })}`,
        );
      } catch (error) {
        lines.push(
          `[FAIL] ${context.t("agent.command.doctor.workspaceFail", {
            workspace: context.workingDir,
            error: String(error),
          })}`,
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

        if (snapshot?.is_git_repo) {
          hasGitRepo = true;
          lines.push(
            `[OK] ${context.t("agent.command.doctor.gitOk", {
              branch: snapshot.branch || context.t("agent.command.unknown"),
              base: snapshot.default_branch || context.t("agent.command.unknown"),
            })}`,
          );
        } else {
          hasGitRepo = false;
          lines.push(
            `[WARN] ${context.t("agent.command.doctor.gitMissing", {
              workspace: context.workingDir,
            })}`,
          );
          recommendations.push(
            context.t("agent.command.doctor.recommend.initGit", {
              workspace: context.workingDir,
            }),
          );
        }
      } catch (error) {
        lines.push(
          `[WARN] ${context.t("agent.command.doctor.gitFail", { error: String(error) })}`,
        );
        recommendations.push(context.t("agent.command.doctor.recommend.checkGit"));
      }
    }

    const usage = context.getUsageSnapshot();
    lines.push(
      `[OK] ${context.t("agent.command.doctor.usageStats", {
        total: formatNumber(usage.totals.totalTokens),
        models: formatNumber(usage.byModel.length),
      })}`,
    );
    const recentEvents = context.getRecentQueryEvents(120);
    const lastQueryStart = [...recentEvents]
      .reverse()
      .find((event): event is Extract<QueryStreamEvent, { type: "query_start" }> => event.type === "query_start");
    if (lastQueryStart) {
      lines.push(
        `[OK] ${context.t("agent.command.doctor.queryProfile", {
          lane: context.t(`agent.trace.queryLane.${lastQueryStart.lane ?? "foreground"}`),
          retries: typeof lastQueryStart.retryMax === "number" ? String(lastQueryStart.retryMax) : "-",
          fallback: context.t(`agent.trace.queryFallback.${lastQueryStart.fallbackEnabled ? "on" : "off"}`),
          strategy: formatRetryStrategyLabel(context, lastQueryStart.retryStrategy),
        })}`,
      );
    }
    const fallbackStats = buildTraceFallbackStats(recentEvents);
    if (fallbackStats.used > 0 || fallbackStats.suppressed > 0) {
      lines.push(
        `[OK] ${context.t("agent.command.doctor.fallbackActivity", {
          used: formatNumber(fallbackStats.used),
          suppressed: formatNumber(fallbackStats.suppressed),
        })}`,
      );
    }
    const totalFallbackTransitions = fallbackStats.used + fallbackStats.suppressed;
    if (fallbackStats.suppressed > 0 && totalFallbackTransitions > 0) {
      const suppressionRatioPct = Math.round((fallbackStats.suppressed / totalFallbackTransitions) * 100);
      if (suppressionRatioPct >= DOCTOR_FALLBACK_SUPPRESSION_WARN_RATIO_PCT) {
        lines.push(
          `[WARN] ${context.t("agent.command.doctor.fallbackSuppressedRatio", {
            ratio: suppressionRatioPct,
            used: formatNumber(fallbackStats.used),
            suppressed: formatNumber(fallbackStats.suppressed),
          })}`,
        );
      }
    }
    if (fallbackStats.latestSuppressed) {
      lines.push(
        `[WARN] ${context.t("agent.command.doctor.fallbackSuppressed", {
          count: formatNumber(fallbackStats.suppressed),
          reason: context.t(`agent.trace.fallbackSuppressedReason.${fallbackStats.latestSuppressed.reason}`),
          strategy: formatRetryStrategyLabel(context, fallbackStats.latestSuppressed.retryStrategy),
        })}`,
      );
      if (
        fallbackStats.latestSuppressed.reason === "retry_strategy" ||
        fallbackStats.latestSuppressed.reason === "already_retried"
      ) {
        recommendations.push(context.t("agent.command.doctor.recommend.relieveQueueForFallback"));
      } else if (
        fallbackStats.latestSuppressed.reason === "fallback_missing" ||
        fallbackStats.latestSuppressed.reason === "same_model"
      ) {
        recommendations.push(context.t("agent.command.doctor.recommend.configureFallbackModel"));
      } else if (fallbackStats.latestSuppressed.reason === "gate_disabled") {
        recommendations.push(context.t("agent.command.doctor.recommend.enableFallbackGate"));
      }
    }
    const lastPromptCompiled = [...recentEvents]
      .reverse()
      .find((event): event is Extract<QueryStreamEvent, { type: "prompt_compiled" }> => {
        return event.type === "prompt_compiled";
      });
    if (lastPromptCompiled) {
      lines.push(
        `[OK] ${context.t("agent.command.doctor.promptStats", {
          staticSections: formatNumber(lastPromptCompiled.staticSections),
          dynamicSections: formatNumber(lastPromptCompiled.dynamicSections),
          staticChars: formatNumber(lastPromptCompiled.staticChars),
          dynamicChars: formatNumber(lastPromptCompiled.dynamicChars),
          totalChars: formatNumber(lastPromptCompiled.totalChars),
        })}`,
      );
      if (lastPromptCompiled.staticHash && lastPromptCompiled.dynamicHash) {
        lines.push(
          `[OK] ${context.t("agent.command.doctor.promptHashes", {
            staticHash: lastPromptCompiled.staticHash,
            dynamicHash: lastPromptCompiled.dynamicHash,
          })}`,
        );
      }
      if (Array.isArray(lastPromptCompiled.modelLaunchTags) && lastPromptCompiled.modelLaunchTags.length > 0) {
        lines.push(
          `[OK] ${context.t("agent.command.doctor.promptTags", {
            tags: lastPromptCompiled.modelLaunchTags.join(", "),
          })}`,
        );
      }
      if (Array.isArray(lastPromptCompiled.sectionMetadata) && lastPromptCompiled.sectionMetadata.length > 0) {
        const governance = summarizePromptGovernance(lastPromptCompiled.sectionMetadata);
        lines.push(
          `[OK] ${context.t("agent.command.doctor.promptGovernance", {
            core: formatNumber(governance.ownerCounts.core),
            safeguards: formatNumber(governance.ownerCounts.safeguards),
            runtime: formatNumber(governance.ownerCounts.runtime),
            immutable: formatNumber(governance.immutableCount),
            launch: formatNumber(governance.modelLaunchCount),
          })}`,
        );
      }
    } else {
      lines.push(`[WARN] ${context.t("agent.command.doctor.promptStatsMissing")}`);
    }

    const tasks = context.taskManager.listTasks();
    const running = tasks.filter((task) => task.status === "running").length;
    const queueLimit = Math.max(0, context.queueLimit);
    const queueCount = Math.max(0, context.queueCount);
    const queuePct =
      queueLimit > 0 ? Math.min(100, Math.round((queueCount / queueLimit) * 100)) : 0;
    if (queueLimit > 0 && queueCount >= queueLimit) {
      lines.push(
        `[WARN] ${context.t("agent.command.doctor.queueFull", {
          queue: queueCount,
          limit: queueLimit,
        })}`,
      );
      recommendations.push(context.t("agent.command.doctor.recommend.relieveQueue"));
    } else if (queueLimit > 0 && queueCount >= Math.ceil(queueLimit * 0.75)) {
      lines.push(
        `[WARN] ${context.t("agent.command.doctor.queueHigh", {
          queue: queueCount,
          limit: queueLimit,
          pct: queuePct,
        })}`,
      );
      recommendations.push(context.t("agent.command.doctor.recommend.relieveQueue"));
    } else {
      lines.push(
        `[OK] ${context.t("agent.command.doctor.queueHealthy", {
          queue: queueCount,
          limit: queueLimit,
          pct: queuePct,
        })}`,
      );
    }

    lines.push(
      `[OK] ${context.t("agent.command.doctor.tasks", {
        running: formatNumber(running),
        total: formatNumber(tasks.length),
      })}`,
    );
    if (running > 0) {
      recommendations.push(context.t("agent.command.doctor.recommend.inspectTasks"));
    }

    lines.push(
      `[OK] ${context.t("agent.command.doctor.permissions", {
        mode: context.permissionMode,
        rules: formatNumber(context.permissionRules.length),
      })}`,
    );

    const permissionRiskCounters = collectPermissionRiskCounters(recentEvents);
    lines.push(
      `[OK] ${context.t("agent.command.doctor.permissionRiskSummary", {
        critical: formatNumber(permissionRiskCounters.critical),
        highRisk: formatNumber(permissionRiskCounters.high_risk),
        interactive: formatNumber(permissionRiskCounters.interactive),
        pathOutside: formatNumber(permissionRiskCounters.path_outside),
        policy: formatNumber(permissionRiskCounters.policy),
        scopeNotices: formatNumber(permissionRiskCounters.scopeNotices),
      })}`,
    );
    lines.push(
      `[OK] ${context.t("agent.command.doctor.permissionRiskProfileSummary", {
        reversible: formatNumber(permissionRiskCounters.reversibilityReversible),
        mixed: formatNumber(permissionRiskCounters.reversibilityMixed),
        hardToReverse: formatNumber(permissionRiskCounters.reversibilityHardToReverse),
        local: formatNumber(permissionRiskCounters.blastLocal),
        workspace: formatNumber(permissionRiskCounters.blastWorkspace),
        shared: formatNumber(permissionRiskCounters.blastShared),
      })}`,
    );
    if (permissionRiskCounters.critical > 0 || permissionRiskCounters.high_risk > 0) {
      lines.push(`[WARN] ${context.t("agent.command.doctor.permissionRiskHigh")}`);
      recommendations.push(context.t("agent.command.doctor.recommend.reduceHighRiskApprovals"));
    }
    if (permissionRiskCounters.path_outside > 0) {
      recommendations.push(context.t("agent.command.doctor.recommend.keepWorkspaceBoundaries"));
    }
    if (
      permissionRiskCounters.reversibilityHardToReverse > 0 ||
      permissionRiskCounters.blastShared > 0
    ) {
      recommendations.push(context.t("agent.command.doctor.recommend.explicitConfirmationForIrreversible"));
    }

    if (hasGitRepo && context.workingDir && context.permissionMode !== "full_access") {
      recommendations.push(context.t("agent.command.doctor.recommend.allowWorkspaceWrite"));
    }

    const dedupedRecommendations = [...new Set(recommendations)];
    if (dedupedRecommendations.length > 0) {
      lines.push(context.t("agent.command.doctor.recommend.title"));
      for (const suggestion of dedupedRecommendations) {
        lines.push(`- ${suggestion}`);
      }
    }

    return { message: lines.join("\n") };
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
