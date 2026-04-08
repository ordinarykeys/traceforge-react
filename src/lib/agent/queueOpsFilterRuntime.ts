import type {
  TraceQueueAction,
  TraceQueuePriority,
  TraceQueueReason,
} from "./traceSummaryRuntime";

export type QueueOpsActionFilter = TraceQueueAction | "all";
export type QueueOpsReasonFilter = TraceQueueReason | "none" | "all";
export type QueueOpsPriorityFilter = TraceQueuePriority | "none" | "all";

export function parseQueueOpsActionFilter(
  value: string | undefined,
): QueueOpsActionFilter | "invalid" {
  if (!value || value.trim().length === 0) {
    return "all";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "any") return "all";
  if (normalized === "queued" || normalized === "enqueue") return "queued";
  if (normalized === "dequeued" || normalized === "dequeue") return "dequeued";
  if (normalized === "rejected" || normalized === "reject") return "rejected";
  return "invalid";
}

export function parseQueueOpsReasonFilter(
  value: string | undefined,
): QueueOpsReasonFilter | "invalid" {
  if (!value || value.trim().length === 0) {
    return "all";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "any") return "all";
  if (normalized === "none" || normalized === "null") return "none";
  if (normalized === "capacity") return "capacity";
  if (normalized === "stale" || normalized === "expired") return "stale";
  if (normalized === "manual" || normalized === "cleared") return "manual";
  if (normalized === "deduplicated" || normalized === "dedupe") return "deduplicated";
  return "invalid";
}

export function parseQueueOpsPriorityFilter(
  value: string | undefined,
): QueueOpsPriorityFilter | "invalid" {
  if (!value || value.trim().length === 0) {
    return "all";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "any") return "all";
  if (normalized === "none" || normalized === "null") return "none";
  if (normalized === "now" || normalized === "next" || normalized === "later") {
    return normalized;
  }
  return "invalid";
}
