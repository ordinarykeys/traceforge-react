import type { PermissionRiskClass, QueryStreamEvent } from "./query/events";

export type TraceFilter =
  | "all"
  | "queue"
  | "tools"
  | "permission"
  | "query"
  | "prompt"
  | "retry"
  | "continue";
export type TraceCategory = Exclude<TraceFilter, "all">;
export type TraceRunWindow = number | "all";
export type TracePermissionRiskFilter = "all" | PermissionRiskClass;
export type TracePermissionReversibilityFilter =
  | "all"
  | Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["reversibility"];
export type TracePermissionBlastRadiusFilter =
  | "all"
  | Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["blastRadius"];

export const TRACE_CATEGORY_ORDER: TraceCategory[] = [
  "query",
  "prompt",
  "tools",
  "permission",
  "queue",
  "retry",
  "continue",
];

export interface TraceRunSummary {
  runIndex: number;
  startedAt: number;
  endedAt: number;
  terminalReason?: Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"];
  events: QueryStreamEvent[];
}

export interface VisibleTraceRunSummary extends TraceRunSummary {
  visibleEvents: QueryStreamEvent[];
  warningCount: number;
  errorCount: number;
  categoryCounts: Record<TraceCategory, number>;
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

export function buildTraceRunSummaries(events: QueryStreamEvent[]): TraceRunSummary[] {
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

export function createEmptyTraceCategoryCounts(): Record<TraceCategory, number> {
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

export function getTraceEventFilter(event: QueryStreamEvent): Exclude<TraceFilter, "all"> {
  switch (event.type) {
    case "queue_update":
      return "queue";
    case "tool_result":
      return "tools";
    case "tool_retry_guard":
      return "retry";
    case "tool_failure_classified":
      return "tools";
    case "tool_failure_diagnosis":
      return "retry";
    case "tool_budget_guard":
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

export function getTraceEventSeverity(event: QueryStreamEvent): "info" | "warn" | "error" {
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
  if (event.type === "tool_failure_classified") {
    return "warn";
  }
  if (event.type === "tool_failure_diagnosis") {
    return "warn";
  }
  if (event.type === "tool_budget_guard") {
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

export function getTracePermissionRisk(event: QueryStreamEvent): PermissionRiskClass | null {
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

export function getTracePermissionReversibility(
  event: QueryStreamEvent,
): Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["reversibility"] | null {
  if (event.type !== "permission_risk_profile") {
    return null;
  }
  return event.reversibility;
}

export function getTracePermissionBlastRadius(
  event: QueryStreamEvent,
): Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["blastRadius"] | null {
  if (event.type !== "permission_risk_profile") {
    return null;
  }
  return event.blastRadius;
}

export function isTraceEventToolMatched(event: QueryStreamEvent, toolName: string): boolean {
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
  if (event.type === "tool_failure_classified") {
    return event.tool === toolName;
  }
  if (event.type === "tool_budget_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return false;
}

export function includeTraceEventForToolFocus(event: QueryStreamEvent, toolName: string): boolean {
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
  if (event.type === "tool_failure_classified") {
    return event.tool === toolName;
  }
  if (event.type === "tool_budget_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return true;
}

export function buildVisibleTraceRunSummaries(options: {
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
