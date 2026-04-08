import type { ToolFailureClass } from "./query/events";
import {
  deriveTraceRiskProfileMatrixDescriptor,
  deriveTraceSummaryBudgetGuardDescriptor,
  deriveTraceSummaryFailureClassDescriptor,
  deriveTraceSummaryFallbackDescriptor,
  deriveTraceSummaryQueuePriorityDescriptor,
} from "./traceSummaryDescriptorRuntime";
import type { TraceSummaryRunSnapshot } from "./traceSummaryRenderRuntime";
import { buildToolFailureClassStats, countToolBudgetGuards } from "./traceToolingRuntime";

export function deriveTraceSummaryRunDetailLines(options: {
  run: TraceSummaryRunSnapshot;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number) => string;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
  formatRetryStrategyLabel: (strategy: string | undefined) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatFallbackSuppressedReasonLabel: (reasonId: string) => string;
  promptBucketLabel: string;
  formatPromptLine: (
    event: NonNullable<TraceSummaryRunSnapshot["latestPromptCompiled"]>,
  ) => string;
}): string[] {
  const { run, t } = options;
  const lines: string[] = [];

  if (run.latestPromptCompiled) {
    lines.push(
      `${options.promptBucketLabel}: ${options.formatPromptLine(run.latestPromptCompiled)}`,
    );
  }

  if (run.hotspotParts) {
    lines.push(
      t("agent.command.trace.summaryHotspots", { hotspots: run.hotspotParts }),
    );
  }

  const riskProfileMatrixDescriptor = deriveTraceRiskProfileMatrixDescriptor(
    run.riskProfileStats,
  );
  if (riskProfileMatrixDescriptor) {
    lines.push(t(riskProfileMatrixDescriptor.key, riskProfileMatrixDescriptor.vars));
  }

  const fallbackDescriptor = deriveTraceSummaryFallbackDescriptor({
    stats: run.fallbackStats,
    scope: "run",
  });
  if (fallbackDescriptor) {
    lines.push(
      t(fallbackDescriptor.key, {
        used: options.formatNumber(fallbackDescriptor.used),
        suppressed: options.formatNumber(fallbackDescriptor.suppressed),
        reason: fallbackDescriptor.reasonId
          ? options.formatFallbackSuppressedReasonLabel(fallbackDescriptor.reasonId)
          : "-",
        strategy: fallbackDescriptor.reasonId
          ? options.formatRetryStrategyLabel(fallbackDescriptor.retryStrategy)
          : options.formatRetryStrategyLabel("balanced"),
      }),
    );
  }

  const queuePriorityDescriptor = deriveTraceSummaryQueuePriorityDescriptor({
    stats: run.queuePriorityStats,
    scope: "run",
    nowLabel: options.nowLabel,
    nextLabel: options.nextLabel,
    laterLabel: options.laterLabel,
    formatNumber: options.formatNumber,
  });
  if (queuePriorityDescriptor) {
    lines.push(t(queuePriorityDescriptor.key, queuePriorityDescriptor.vars));
  }

  const failureClassStats = buildToolFailureClassStats({
    events: run.visibleEvents,
    formatFailureClassLabel: (failureClass) =>
      options.formatFailureClassLabel(failureClass),
  });
  const failureClassDescriptor = deriveTraceSummaryFailureClassDescriptor({
    scope: "run",
    total: failureClassStats.total,
    details: failureClassStats.parts,
  });
  if (failureClassDescriptor) {
    lines.push(t(failureClassDescriptor.key, failureClassDescriptor.vars));
  }

  const budgetGuardCount = countToolBudgetGuards(run.visibleEvents);
  const budgetGuardDescriptor = deriveTraceSummaryBudgetGuardDescriptor({
    scope: "run",
    count: budgetGuardCount,
    formatNumber: options.formatNumber,
  });
  if (budgetGuardDescriptor) {
    lines.push(t(budgetGuardDescriptor.key, budgetGuardDescriptor.vars));
  }

  return lines;
}
