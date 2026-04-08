import type { QueryStreamEvent, ToolFailureClass } from "./query/events";

export type ToolBudgetGuardReason = Extract<QueryStreamEvent, { type: "tool_budget_guard" }>["reason"];

export interface ToolFailureClassEntry {
  failureClass: ToolFailureClass;
  count: number;
}

export interface ToolFailureClassStats {
  total: number;
  parts: string;
}

function buildToolFailureClassCounter(
  events: readonly QueryStreamEvent[],
): Map<ToolFailureClass, number> {
  const counter = new Map<ToolFailureClass, number>();
  for (const event of events) {
    if (event.type !== "tool_failure_classified") {
      continue;
    }
    counter.set(event.failureClass, (counter.get(event.failureClass) ?? 0) + 1);
  }
  return counter;
}

export function deriveToolFailureClassEntries(
  counter: ReadonlyMap<ToolFailureClass, number>,
): ToolFailureClassEntry[] {
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([failureClass, count]) => ({
      failureClass,
      count,
    }));
}

export function buildToolFailureClassStats(options: {
  events: readonly QueryStreamEvent[];
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
}): ToolFailureClassStats {
  const entries = deriveToolFailureClassEntries(buildToolFailureClassCounter(options.events));
  const parts = entries
    .map((entry) => `${options.formatFailureClassLabel(entry.failureClass)}=${entry.count}`)
    .join(" ");
  return {
    total: entries.reduce((sum, entry) => sum + entry.count, 0),
    parts,
  };
}

export function countToolBudgetGuards(events: readonly QueryStreamEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type === "tool_budget_guard") {
      count += 1;
    }
  }
  return count;
}

export function collectToolFailureClassCounts(
  events: readonly QueryStreamEvent[],
): Record<ToolFailureClass, number> {
  const counts: Record<ToolFailureClass, number> = {
    permission: 0,
    workspace: 0,
    timeout: 0,
    not_found: 0,
    network: 0,
    validation: 0,
    runtime: 0,
  };
  for (const event of events) {
    if (event.type !== "tool_failure_classified") {
      continue;
    }
    counts[event.failureClass] += 1;
  }
  return counts;
}

export interface ToolBudgetGuardReasonStats {
  total: number;
  perToolLimit: number;
  failureBackoff: number;
  dominantReason: ToolBudgetGuardReason | null;
}

export function buildToolBudgetGuardReasonStats(
  events: readonly QueryStreamEvent[],
): ToolBudgetGuardReasonStats {
  let perToolLimit = 0;
  let failureBackoff = 0;
  for (const event of events) {
    if (event.type !== "tool_budget_guard") {
      continue;
    }
    if (event.reason === "failure_backoff") {
      failureBackoff += 1;
    } else {
      perToolLimit += 1;
    }
  }
  const total = perToolLimit + failureBackoff;
  let dominantReason: ToolBudgetGuardReason | null = null;
  if (total > 0) {
    dominantReason = failureBackoff >= perToolLimit ? "failure_backoff" : "per_tool_limit";
  }
  return {
    total,
    perToolLimit,
    failureBackoff,
    dominantReason,
  };
}
