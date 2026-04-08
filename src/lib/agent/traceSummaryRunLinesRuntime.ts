import type { ToolFailureClass } from "./query/events";
import type { TraceSummaryRunSnapshot } from "./traceSummaryRenderRuntime";
import {
  composeTraceSummaryRunLine,
  deriveTraceSummaryCategoryEntries,
  deriveTraceSummaryRunBaseDescriptor,
} from "./traceSummaryLineRuntime";
import { deriveTraceSummaryRunDetailLines } from "./traceSummaryRunDetailRuntime";

export function deriveTraceSummaryRunLines(options: {
  runs: readonly TraceSummaryRunSnapshot[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number) => string;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
  formatTerminalReasonLabel: (
    reason: NonNullable<TraceSummaryRunSnapshot["terminalReason"]>,
  ) => string;
  ongoingStatusLabel: string;
  formatRetryStrategyLabel: (strategy: string | undefined) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatFallbackSuppressedReasonLabel: (reasonId: string) => string;
  promptBucketLabel: string;
  formatPromptLine: (
    event: NonNullable<TraceSummaryRunSnapshot["latestPromptCompiled"]>,
  ) => string;
  formatBucketLabel: (category: string) => string;
}): string[] {
  return options.runs.map((run) => {
    const terminalReason = run.terminalReason
      ? options.formatTerminalReasonLabel(run.terminalReason)
      : options.ongoingStatusLabel;
    const categoryParts = deriveTraceSummaryCategoryEntries(run.categoryCounts)
      .map((entry) => `${options.formatBucketLabel(entry.category)}=${entry.count}`)
      .join(" ");
    const baseDescriptor = deriveTraceSummaryRunBaseDescriptor({
      run,
      statusLabel: terminalReason,
      categoryParts,
    });
    const baseLine = options.t(baseDescriptor.key, baseDescriptor.vars);
    const detailLines = deriveTraceSummaryRunDetailLines({
      run,
      t: options.t,
      formatNumber: options.formatNumber,
      nowLabel: options.nowLabel,
      nextLabel: options.nextLabel,
      laterLabel: options.laterLabel,
      formatRetryStrategyLabel: options.formatRetryStrategyLabel,
      formatFailureClassLabel: options.formatFailureClassLabel,
      formatFallbackSuppressedReasonLabel: options.formatFallbackSuppressedReasonLabel,
      promptBucketLabel: options.promptBucketLabel,
      formatPromptLine: options.formatPromptLine,
    });
    return composeTraceSummaryRunLine(baseLine, detailLines);
  });
}
