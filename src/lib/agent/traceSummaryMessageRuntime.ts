import type { PermissionRiskClass, QueryStreamEvent, ToolFailureClass } from "./query/events";
import { deriveTracePermissionRiskEntriesFromEvents } from "./tracePermissionRiskRuntime";
import type { TraceSummaryRunSnapshot, TraceSummarySnapshot } from "./traceSummaryRenderRuntime";
import { composeTraceSummaryMessage } from "./traceSummaryLineRuntime";
import { deriveTraceSummaryOverviewLineDescriptors } from "./traceSummaryOverviewRuntime";
import { deriveTraceSummaryRunLines } from "./traceSummaryRunLinesRuntime";

function deriveTraceSummaryPermissionRiskParts(options: {
  events: readonly QueryStreamEvent[];
  formatPermissionRiskLabel: (risk: PermissionRiskClass) => string;
}): string {
  return deriveTracePermissionRiskEntriesFromEvents(options.events)
    .map((entry) => `${options.formatPermissionRiskLabel(entry.risk)}=${entry.count}`)
    .join(" ");
}

export function deriveTraceSummaryMessage(options: {
  summarySnapshot: TraceSummarySnapshot;
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
  formatPermissionRiskLabel: (risk: PermissionRiskClass) => string;
  promptBucketLabel: string;
  formatPromptLine: (
    event: NonNullable<TraceSummaryRunSnapshot["latestPromptCompiled"]>,
  ) => string;
  formatBucketLabel: (category: string) => string;
  titleLine: string;
  appliedFilterLine: string;
  emptyLine: string;
}): string {
  const { summarySnapshot } = options;
  if (summarySnapshot.runs.length === 0) {
    return [options.titleLine, options.emptyLine].join("\n");
  }

  const runLines = deriveTraceSummaryRunLines({
    runs: summarySnapshot.runs,
    t: options.t,
    formatNumber: options.formatNumber,
    nowLabel: options.nowLabel,
    nextLabel: options.nextLabel,
    laterLabel: options.laterLabel,
    formatTerminalReasonLabel: options.formatTerminalReasonLabel,
    ongoingStatusLabel: options.ongoingStatusLabel,
    formatRetryStrategyLabel: options.formatRetryStrategyLabel,
    formatFailureClassLabel: options.formatFailureClassLabel,
    formatFallbackSuppressedReasonLabel: options.formatFallbackSuppressedReasonLabel,
    promptBucketLabel: options.promptBucketLabel,
    formatPromptLine: options.formatPromptLine,
    formatBucketLabel: options.formatBucketLabel,
  });
  const riskProfileParts = deriveTraceSummaryPermissionRiskParts({
    events: summarySnapshot.overview.visibleEvents,
    formatPermissionRiskLabel: options.formatPermissionRiskLabel,
  });
  const overviewLines = deriveTraceSummaryOverviewLineDescriptors({
    overview: summarySnapshot.overview,
    riskProfileParts,
    nowLabel: options.nowLabel,
    nextLabel: options.nextLabel,
    laterLabel: options.laterLabel,
    formatNumber: options.formatNumber,
    formatRetryStrategyLabel: options.formatRetryStrategyLabel,
    formatFailureClassLabel: options.formatFailureClassLabel,
    formatFallbackSuppressedReasonLabel: options.formatFallbackSuppressedReasonLabel,
  }).map((line) => options.t(line.key, line.vars));

  return composeTraceSummaryMessage({
    titleLine: options.titleLine,
    appliedFilterLine: options.appliedFilterLine,
    overviewLines,
    runLines,
  });
}

