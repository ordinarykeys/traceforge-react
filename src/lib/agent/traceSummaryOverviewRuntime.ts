import {
  deriveTraceRiskProfileMatrixDescriptor,
  deriveTraceSummaryBudgetGuardDescriptor,
  deriveTraceSummaryFailureClassDescriptor,
  deriveTraceSummaryFallbackDescriptor,
  deriveTraceSummaryQueuePriorityDescriptor,
} from "./traceSummaryDescriptorRuntime";
import type { ToolFailureClass } from "./query/events";
import type { TraceSummaryOverviewSnapshot } from "./traceSummaryRenderRuntime";
import { buildToolFailureClassStats, countToolBudgetGuards } from "./traceToolingRuntime";

export interface TraceSummaryOverviewLineDescriptor {
  key: string;
  vars: Record<string, string | number>;
}

export function deriveTraceSummaryOverviewLineDescriptors(options: {
  overview: TraceSummaryOverviewSnapshot;
  riskProfileParts: string;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
  formatNumber: (value: number) => string;
  formatRetryStrategyLabel: (strategy: string | undefined) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatFallbackSuppressedReasonLabel: (reasonId: string) => string;
}): TraceSummaryOverviewLineDescriptor[] {
  const lines: TraceSummaryOverviewLineDescriptor[] = [];
  const { overview } = options;

  if (overview.hotspotParts) {
    lines.push({
      key: "agent.command.trace.summaryGlobalHotspots",
      vars: { hotspots: overview.hotspotParts },
    });
  }

  if (options.riskProfileParts) {
    lines.push({
      key: "agent.command.trace.riskProfile",
      vars: { risks: options.riskProfileParts },
    });
  }

  const riskProfileMatrixDescriptor = deriveTraceRiskProfileMatrixDescriptor(
    overview.riskProfileStats,
  );
  if (riskProfileMatrixDescriptor) {
    lines.push({
      key: riskProfileMatrixDescriptor.key,
      vars: riskProfileMatrixDescriptor.vars,
    });
  }

  const fallbackDescriptor = deriveTraceSummaryFallbackDescriptor({
    stats: overview.fallbackStats,
    scope: "global",
  });
  if (fallbackDescriptor) {
    lines.push({
      key: fallbackDescriptor.key,
      vars: {
        used: options.formatNumber(fallbackDescriptor.used),
        suppressed: options.formatNumber(fallbackDescriptor.suppressed),
        reason: fallbackDescriptor.reasonId
          ? options.formatFallbackSuppressedReasonLabel(fallbackDescriptor.reasonId)
          : "-",
        strategy: fallbackDescriptor.reasonId
          ? options.formatRetryStrategyLabel(fallbackDescriptor.retryStrategy)
          : options.formatRetryStrategyLabel("balanced"),
      },
    });
  }

  const queuePriorityDescriptor = deriveTraceSummaryQueuePriorityDescriptor({
    stats: overview.queuePriorityStats,
    scope: "global",
    nowLabel: options.nowLabel,
    nextLabel: options.nextLabel,
    laterLabel: options.laterLabel,
    formatNumber: options.formatNumber,
  });
  if (queuePriorityDescriptor) {
    lines.push({
      key: queuePriorityDescriptor.key,
      vars: queuePriorityDescriptor.vars,
    });
  }

  const failureClassStats = buildToolFailureClassStats({
    events: overview.visibleEvents,
    formatFailureClassLabel: (failureClass) =>
      options.formatFailureClassLabel(failureClass),
  });
  const failureClassDescriptor = deriveTraceSummaryFailureClassDescriptor({
    scope: "global",
    total: failureClassStats.total,
    details: failureClassStats.parts,
  });
  if (failureClassDescriptor) {
    lines.push({
      key: failureClassDescriptor.key,
      vars: failureClassDescriptor.vars,
    });
  }

  const budgetGuardCount = countToolBudgetGuards(overview.visibleEvents);
  const budgetGuardDescriptor = deriveTraceSummaryBudgetGuardDescriptor({
    scope: "global",
    count: budgetGuardCount,
    formatNumber: options.formatNumber,
  });
  if (budgetGuardDescriptor) {
    lines.push({
      key: budgetGuardDescriptor.key,
      vars: budgetGuardDescriptor.vars,
    });
  }

  return lines;
}
