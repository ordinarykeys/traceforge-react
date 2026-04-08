import {
  buildTraceInvestigateSummaryCommand,
} from "./traceInvestigateRuntime";
import type {
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";
import type {
  TraceHotspotSummary,
  TraceQueuePriorityStats,
} from "./traceSummaryRuntime";

export interface TraceHotspotsLineDescriptor {
  key:
    | "agent.command.trace.hotspotsTitle"
    | "agent.command.trace.appliedFilter"
    | "agent.command.trace.riskProfile"
    | "agent.command.trace.riskProfileMatrix"
    | "agent.command.trace.summaryFailureClasses"
    | "agent.command.trace.summaryBudgetGuards"
    | "agent.command.trace.hotspotsQueuePriority"
    | "agent.command.trace.hotspotsHint";
  vars: Record<string, string | number>;
}

export interface TraceHotspotLineDescriptor {
  key: "agent.command.trace.hotspotLine";
  vars: {
    index: number;
    tool: string;
    total: number;
    errors: number;
    rejected: number;
    denied: number;
  };
}

export function deriveTraceHotspotLineDescriptors(
  hotspotSummaries: readonly TraceHotspotSummary[],
): TraceHotspotLineDescriptor[] {
  return hotspotSummaries.map((item, index) => ({
    key: "agent.command.trace.hotspotLine",
    vars: {
      index: index + 1,
      tool: item.tool,
      total: item.total,
      errors: item.errors,
      rejected: item.rejected,
      denied: item.denied,
    },
  }));
}

export function shouldRenderTraceHotspotsQueuePriority(
  stats: TraceQueuePriorityStats,
): boolean {
  return stats.total > 0 || stats.latestQueueDepth > 0;
}

export function deriveTraceHotspotsQueuePriorityVars(options: {
  stats: TraceQueuePriorityStats;
  queueLimit: number;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
  pressureLabel: string;
  formatNumber: (value: number) => string;
}): TraceHotspotsLineDescriptor["vars"] | null {
  if (!shouldRenderTraceHotspotsQueuePriority(options.stats)) {
    return null;
  }
  const { stats, formatNumber } = options;
  return {
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
    depth: formatNumber(stats.latestQueueDepth),
    limitSuffix: options.queueLimit > 0 ? `/${formatNumber(options.queueLimit)}` : "",
    pressure: options.pressureLabel,
  };
}

export function buildTraceHotspotsHintCommand(options: {
  topTool: string | null;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): string | null {
  if (!options.topTool) {
    return null;
  }
  return buildTraceInvestigateSummaryCommand({
    tool: options.topTool,
    runWindow: options.runWindow,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
  });
}

export function deriveTraceHotspotsMetaLineDescriptors(options: {
  hotspotCount: number;
  filterLabel: string;
  warningLabel: string;
  riskProfileParts: string;
  riskProfileMatrixVars: TraceHotspotsLineDescriptor["vars"] | null;
  failureClassDetails: string;
  budgetGuardCount: number;
  queuePriorityVars: TraceHotspotsLineDescriptor["vars"] | null;
  hintCommand: string | null;
  formatNumber: (value: number) => string;
}): TraceHotspotsLineDescriptor[] {
  const lines: TraceHotspotsLineDescriptor[] = [
    {
      key: "agent.command.trace.hotspotsTitle",
      vars: { count: options.hotspotCount },
    },
    {
      key: "agent.command.trace.appliedFilter",
      vars: {
        filter: options.filterLabel,
        warnings: options.warningLabel,
      },
    },
  ];

  if (options.riskProfileParts) {
    lines.push({
      key: "agent.command.trace.riskProfile",
      vars: {
        risks: options.riskProfileParts,
      },
    });
  }
  if (options.riskProfileMatrixVars) {
    lines.push({
      key: "agent.command.trace.riskProfileMatrix",
      vars: options.riskProfileMatrixVars,
    });
  }
  if (options.failureClassDetails) {
    lines.push({
      key: "agent.command.trace.summaryFailureClasses",
      vars: {
        details: options.failureClassDetails,
      },
    });
  }
  if (options.budgetGuardCount > 0) {
    lines.push({
      key: "agent.command.trace.summaryBudgetGuards",
      vars: {
        count: options.formatNumber(options.budgetGuardCount),
      },
    });
  }
  if (options.queuePriorityVars) {
    lines.push({
      key: "agent.command.trace.hotspotsQueuePriority",
      vars: options.queuePriorityVars,
    });
  }
  if (options.hintCommand) {
    lines.push({
      key: "agent.command.trace.hotspotsHint",
      vars: {
        command: options.hintCommand,
      },
    });
  }

  return lines;
}
