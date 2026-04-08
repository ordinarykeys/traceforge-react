import { deriveQueuePressure, type TraceQueuePressure } from "./recoveryRuntime";
import type { QueryStreamEvent } from "./query/events";

export interface TraceHotspotSummary {
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
}

export function buildTraceHotspotSummaries(events: QueryStreamEvent[], limit = 8): TraceHotspotSummary[] {
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
    if (event.type === "tool_failure_classified") {
      const current = counter.get(event.tool) ?? {
        tool: event.tool,
        total: 0,
        errors: 0,
        rejected: 0,
        denied: 0,
      };
      current.total += 1;
      if (event.failureClass === "permission") {
        current.denied += 1;
      } else {
        current.errors += 1;
      }
      counter.set(event.tool, current);
    }
    if (event.type === "tool_budget_guard") {
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

export function buildTraceHotspotParts(events: QueryStreamEvent[], limit = 5): string {
  return buildTraceHotspotSummaries(events, limit)
    .map((item) => `${item.tool}=${item.total}`)
    .join(" ");
}

export interface TracePermissionRiskProfileStats {
  reversible: number;
  mixed: number;
  hardToReverse: number;
  local: number;
  workspace: number;
  shared: number;
  total: number;
}

export function buildTracePermissionRiskProfileStats(events: QueryStreamEvent[]): TracePermissionRiskProfileStats {
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

export type FallbackSuppressedEvent = Extract<QueryStreamEvent, { type: "fallback_suppressed" }>;

export interface TraceFallbackStats {
  used: number;
  suppressed: number;
  latestSuppressed: FallbackSuppressedEvent | null;
}

export function buildTraceFallbackStats(events: QueryStreamEvent[]): TraceFallbackStats {
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

export type TraceQueuePriority = NonNullable<Extract<QueryStreamEvent, { type: "queue_update" }>["priority"]>;
export type TraceQueueAction = Extract<QueryStreamEvent, { type: "queue_update" }>["action"];
export type TraceQueueReason = NonNullable<Extract<QueryStreamEvent, { type: "queue_update" }>["reason"]>;

export interface TraceQueuePriorityStats {
  total: number;
  queued: Record<TraceQueuePriority, number>;
  dequeued: Record<TraceQueuePriority, number>;
  rejected: Record<TraceQueuePriority, number>;
  latestQueueDepth: number;
  maxQueueDepth: number;
  pressure: TraceQueuePressure;
}

export interface TraceQueueReasonStats {
  total: number;
  capacity: number;
  stale: number;
  manual: number;
  deduplicated: number;
}

function createEmptyTraceQueuePriorityCounter(): Record<TraceQueuePriority, number> {
  return {
    now: 0,
    next: 0,
    later: 0,
  };
}

export function buildTraceQueuePriorityStats(events: QueryStreamEvent[], queueLimit = 0): TraceQueuePriorityStats {
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

export function buildTraceQueueReasonStats(events: QueryStreamEvent[]): TraceQueueReasonStats {
  const stats: TraceQueueReasonStats = {
    total: 0,
    capacity: 0,
    stale: 0,
    manual: 0,
    deduplicated: 0,
  };
  for (const event of events) {
    if (event.type !== "queue_update" || !event.reason) {
      continue;
    }
    const reason: TraceQueueReason = event.reason;
    stats[reason] += 1;
    stats.total += 1;
  }
  return stats;
}
