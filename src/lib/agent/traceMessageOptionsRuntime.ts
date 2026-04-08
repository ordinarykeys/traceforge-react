import type { PermissionRiskClass, QueryStreamEvent, ToolFailureClass } from "./query/events";
import { deriveTraceHotspotsMessage } from "./traceHotspotsMessageRuntime";
import {
  deriveTraceInvestigateMessage,
  type TraceInvestigateHotspotSnapshot,
  type TraceInvestigateWorkflowTaskSnapshot,
} from "./traceInvestigateMessageRuntime";
import { deriveTraceListMessage } from "./traceListMessageRuntime";
import type {
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";
import { deriveTraceSummaryMessage } from "./traceSummaryMessageRuntime";
import type { TraceSummaryRunSnapshot, TraceSummarySnapshot } from "./traceSummaryRenderRuntime";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function createTraceSummaryMessageOptions(options: {
  t: TranslateFn;
  summarySnapshot: TraceSummarySnapshot;
  formatNumber: (value: number) => string;
  filterLabel: string;
  warningLabel: string;
  formatTerminalReasonLabel: (
    reason: NonNullable<TraceSummaryRunSnapshot["terminalReason"]>,
  ) => string;
  formatRetryStrategyLabel: (strategy: string | undefined) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatPromptLine: (event: NonNullable<TraceSummaryRunSnapshot["latestPromptCompiled"]>) => string;
}): Parameters<typeof deriveTraceSummaryMessage>[0] {
  return {
    summarySnapshot: options.summarySnapshot,
    t: options.t,
    formatNumber: options.formatNumber,
    nowLabel: options.t("agent.queue.priority.now"),
    nextLabel: options.t("agent.queue.priority.next"),
    laterLabel: options.t("agent.queue.priority.later"),
    formatTerminalReasonLabel: options.formatTerminalReasonLabel,
    ongoingStatusLabel: options.t("agent.trace.runStatusOngoing"),
    formatRetryStrategyLabel: options.formatRetryStrategyLabel,
    formatFailureClassLabel: options.formatFailureClassLabel,
    formatFallbackSuppressedReasonLabel: (reasonId) =>
      options.t(`agent.trace.fallbackSuppressedReason.${reasonId}`),
    formatPermissionRiskLabel: (risk) => options.t(`agent.trace.permissionRisk.${risk}`),
    promptBucketLabel: options.t("agent.trace.bucket.prompt"),
    formatPromptLine: options.formatPromptLine,
    formatBucketLabel: (category) => options.t(`agent.trace.bucket.${category}`),
    titleLine: options.t("agent.command.trace.summaryTitle", {
      count: options.summarySnapshot.runs.length,
    }),
    appliedFilterLine: options.t("agent.command.trace.appliedFilter", {
      filter: options.filterLabel,
      warnings: options.warningLabel,
    }),
    emptyLine: options.t("agent.command.trace.empty"),
  };
}

export function createTraceHotspotsMessageOptions(options: {
  t: TranslateFn;
  visibleEvents: QueryStreamEvent[];
  limit: number;
  queueLimit: number;
  filterLabel: string;
  warningLabel: string;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
  formatNumber: (value: number) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatPermissionRiskLabel: (risk: PermissionRiskClass) => string;
  formatQueuePressureLabel: (pressure: string) => string;
}): Parameters<typeof deriveTraceHotspotsMessage>[0] {
  return {
    visibleEvents: options.visibleEvents,
    limit: options.limit,
    queueLimit: options.queueLimit,
    filterLabel: options.filterLabel,
    warningLabel: options.warningLabel,
    runWindow: options.runWindow,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
    t: options.t,
    formatNumber: options.formatNumber,
    formatFailureClassLabel: options.formatFailureClassLabel,
    formatPermissionRiskLabel: options.formatPermissionRiskLabel,
    formatQueuePressureLabel: options.formatQueuePressureLabel,
    nowLabel: options.t("agent.queue.priority.now"),
    nextLabel: options.t("agent.queue.priority.next"),
    laterLabel: options.t("agent.queue.priority.later"),
  };
}

export function createTraceInvestigateMessageOptions(options: {
  t: TranslateFn;
  hotspot: TraceInvestigateHotspotSnapshot | null;
  filterLabel: string;
  warningLabel: string;
  runbookLines: string[];
  investigateRunbookMode: boolean;
  investigateWorkflowMode: boolean;
  submitResultLine: string | null;
  workflowTask: TraceInvestigateWorkflowTaskSnapshot | null;
}): Parameters<typeof deriveTraceInvestigateMessage>[0] {
  return {
    hotspot: options.hotspot,
    filterLabel: options.filterLabel,
    warningLabel: options.warningLabel,
    runbookLines: options.runbookLines,
    includeRunbook: options.investigateRunbookMode || options.investigateWorkflowMode,
    submitResultLine: options.submitResultLine,
    workflowTask: options.workflowTask,
    t: options.t,
  };
}

export function createTraceListMessageOptions(options: {
  t: TranslateFn;
  visibleEvents: readonly QueryStreamEvent[];
  formatEventTime: (at: number) => string;
  formatEventLine: (event: QueryStreamEvent) => string;
  filterLabel: string;
  warningLabel: string;
}): Parameters<typeof deriveTraceListMessage>[0] {
  return {
    visibleEvents: options.visibleEvents,
    t: options.t,
    formatEventTime: options.formatEventTime,
    formatEventLine: options.formatEventLine,
    filterLabel: options.filterLabel,
    warningLabel: options.warningLabel,
  };
}
