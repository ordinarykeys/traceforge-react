import type { QueryStreamEvent } from "./query/events";
import type {
  QueueOpsActionFilter,
  QueueOpsPriorityFilter,
  QueueOpsReasonFilter,
} from "./queueOpsFilterRuntime";

export type QueueUpdateEvent = Extract<QueryStreamEvent, { type: "queue_update" }>;

export interface QueueOpsSummarySnapshot {
  actionStats: {
    queued: number;
    dequeued: number;
    rejected: number;
  };
  reasonStats: {
    capacity: number;
    stale: number;
    manual: number;
    deduplicated: number;
    none: number;
  };
  priorityStats: {
    now: number;
    next: number;
    later: number;
    none: number;
  };
  latestDepth: number;
  maxDepth: number;
  latestLimit: number;
  effectiveLimit: number;
}

export function collectQueueUpdateEvents(events: readonly QueryStreamEvent[]): QueueUpdateEvent[] {
  return events.filter(
    (event): event is QueueUpdateEvent => event.type === "queue_update",
  );
}

export function filterQueueOpsEvents(options: {
  events: readonly QueueUpdateEvent[];
  actionFilter: QueueOpsActionFilter;
  reasonFilter: QueueOpsReasonFilter;
  priorityFilter: QueueOpsPriorityFilter;
  limit: number;
}): QueueUpdateEvent[] {
  const filtered = options.events.filter((event) => {
    if (options.actionFilter !== "all" && event.action !== options.actionFilter) {
      return false;
    }
    if (options.reasonFilter === "none") {
      if (event.reason !== undefined) return false;
    } else if (options.reasonFilter !== "all") {
      if (event.reason !== options.reasonFilter) return false;
    }
    if (options.priorityFilter === "none") {
      if (event.priority !== undefined) return false;
    } else if (options.priorityFilter !== "all") {
      if (event.priority !== options.priorityFilter) return false;
    }
    return true;
  });

  const safeLimit = Math.max(1, Math.floor(options.limit));
  return filtered.slice(-safeLimit);
}

export function deriveQueueOpsSummarySnapshot(options: {
  events: readonly QueueUpdateEvent[];
  fallbackLimit: number;
}): QueueOpsSummarySnapshot {
  const actionStats = {
    queued: 0,
    dequeued: 0,
    rejected: 0,
  };
  const reasonStats = {
    capacity: 0,
    stale: 0,
    manual: 0,
    deduplicated: 0,
    none: 0,
  };
  const priorityStats = {
    now: 0,
    next: 0,
    later: 0,
    none: 0,
  };
  let latestDepth = 0;
  let maxDepth = 0;
  let latestLimit = 0;

  for (const event of options.events) {
    actionStats[event.action] += 1;
    if (event.reason) {
      reasonStats[event.reason] += 1;
    } else {
      reasonStats.none += 1;
    }
    if (event.priority) {
      priorityStats[event.priority] += 1;
    } else {
      priorityStats.none += 1;
    }
    latestDepth = Math.max(0, event.queueCount);
    maxDepth = Math.max(maxDepth, Math.max(0, event.queueCount));
    latestLimit = Math.max(latestLimit, Math.max(0, event.queueLimit));
  }

  const effectiveLimit = latestLimit || Math.max(0, options.fallbackLimit);
  return {
    actionStats,
    reasonStats,
    priorityStats,
    latestDepth,
    maxDepth,
    latestLimit,
    effectiveLimit,
  };
}
