import type {
  TraceFallbackStats,
  TracePermissionRiskProfileStats,
  TraceQueuePriorityStats,
} from "./traceSummaryRuntime";

export type TraceSummaryFallbackScope = "run" | "global";

export interface TraceSummaryFallbackDescriptor {
  key:
    | "agent.command.trace.summaryFallback"
    | "agent.command.trace.summaryFallbackDetailed"
    | "agent.command.trace.summaryGlobalFallback"
    | "agent.command.trace.summaryGlobalFallbackDetailed";
  used: number;
  suppressed: number;
  reasonId: string | null;
  retryStrategy: string | undefined;
}

export function deriveTraceSummaryFallbackDescriptor(options: {
  stats: TraceFallbackStats;
  scope: TraceSummaryFallbackScope;
}): TraceSummaryFallbackDescriptor | null {
  const { stats, scope } = options;
  if (stats.used <= 0 && stats.suppressed <= 0) {
    return null;
  }

  const hasSuppressedReason = Boolean(stats.latestSuppressed);
  const key =
    scope === "global"
      ? hasSuppressedReason
        ? "agent.command.trace.summaryGlobalFallbackDetailed"
        : "agent.command.trace.summaryGlobalFallback"
      : hasSuppressedReason
        ? "agent.command.trace.summaryFallbackDetailed"
        : "agent.command.trace.summaryFallback";

  return {
    key,
    used: stats.used,
    suppressed: stats.suppressed,
    reasonId: stats.latestSuppressed?.reason ?? null,
    retryStrategy: stats.latestSuppressed?.retryStrategy,
  };
}

export interface TraceSummaryQueuePriorityDescriptor {
  key:
    | "agent.command.trace.summaryQueuePriority"
    | "agent.command.trace.summaryGlobalQueuePriority";
  vars: {
    nowLabel: string;
    nowQueued: string;
    nowDequeued: string;
    nowRejected: string;
    nextLabel: string;
    nextQueued: string;
    nextDequeued: string;
    nextRejected: string;
    laterLabel: string;
    laterQueued: string;
    laterDequeued: string;
    laterRejected: string;
  };
}

export function deriveTraceSummaryQueuePriorityDescriptor(options: {
  stats: TraceQueuePriorityStats;
  scope: TraceSummaryFallbackScope;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
  formatNumber: (value: number) => string;
}): TraceSummaryQueuePriorityDescriptor | null {
  const { stats, formatNumber } = options;
  if (stats.total <= 0) {
    return null;
  }
  return {
    key:
      options.scope === "global"
        ? "agent.command.trace.summaryGlobalQueuePriority"
        : "agent.command.trace.summaryQueuePriority",
    vars: {
      nowLabel: options.nowLabel,
      nowQueued: formatNumber(stats.queued.now),
      nowDequeued: formatNumber(stats.dequeued.now),
      nowRejected: formatNumber(stats.rejected.now),
      nextLabel: options.nextLabel,
      nextQueued: formatNumber(stats.queued.next),
      nextDequeued: formatNumber(stats.dequeued.next),
      nextRejected: formatNumber(stats.rejected.next),
      laterLabel: options.laterLabel,
      laterQueued: formatNumber(stats.queued.later),
      laterDequeued: formatNumber(stats.dequeued.later),
      laterRejected: formatNumber(stats.rejected.later),
    },
  };
}

export interface TraceSummaryFailureClassDescriptor {
  key:
    | "agent.command.trace.summaryFailureClasses"
    | "agent.command.trace.summaryGlobalFailureClasses";
  vars: {
    details: string;
  };
}

export function deriveTraceSummaryFailureClassDescriptor(options: {
  scope: TraceSummaryFallbackScope;
  total: number;
  details: string;
}): TraceSummaryFailureClassDescriptor | null {
  if (options.total <= 0) {
    return null;
  }
  return {
    key:
      options.scope === "global"
        ? "agent.command.trace.summaryGlobalFailureClasses"
        : "agent.command.trace.summaryFailureClasses",
    vars: {
      details: options.details,
    },
  };
}

export interface TraceSummaryBudgetGuardDescriptor {
  key:
    | "agent.command.trace.summaryBudgetGuards"
    | "agent.command.trace.summaryGlobalBudgetGuards";
  vars: {
    count: string;
  };
}

export function deriveTraceSummaryBudgetGuardDescriptor(options: {
  scope: TraceSummaryFallbackScope;
  count: number;
  formatNumber: (value: number) => string;
}): TraceSummaryBudgetGuardDescriptor | null {
  if (options.count <= 0) {
    return null;
  }
  return {
    key:
      options.scope === "global"
        ? "agent.command.trace.summaryGlobalBudgetGuards"
        : "agent.command.trace.summaryBudgetGuards",
    vars: {
      count: options.formatNumber(options.count),
    },
  };
}

export interface TraceRiskProfileMatrixDescriptor {
  key: "agent.command.trace.riskProfileMatrix";
  vars: {
    reversible: number;
    mixed: number;
    hardToReverse: number;
    local: number;
    workspace: number;
    shared: number;
  };
}

export function deriveTraceRiskProfileMatrixDescriptor(
  stats: TracePermissionRiskProfileStats | null,
): TraceRiskProfileMatrixDescriptor | null {
  if (!stats || stats.total <= 0) {
    return null;
  }
  return {
    key: "agent.command.trace.riskProfileMatrix",
    vars: {
      reversible: stats.reversible,
      mixed: stats.mixed,
      hardToReverse: stats.hardToReverse,
      local: stats.local,
      workspace: stats.workspace,
      shared: stats.shared,
    },
  };
}
