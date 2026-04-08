import type { PermissionRiskClass, QueryStreamEvent, ToolFailureClass } from "./query/events";
import {
  buildTraceHotspotsHintCommand,
  deriveTraceHotspotLineDescriptors,
  deriveTraceHotspotsMetaLineDescriptors,
  deriveTraceHotspotsQueuePriorityVars,
} from "./traceHotspotsRuntime";
import { deriveTracePermissionRiskEntriesFromEvents } from "./tracePermissionRiskRuntime";
import type {
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";
import {
  buildTraceHotspotSummaries,
  buildTracePermissionRiskProfileStats,
  buildTraceQueuePriorityStats,
} from "./traceSummaryRuntime";
import { deriveTraceRiskProfileMatrixDescriptor } from "./traceSummaryDescriptorRuntime";
import { buildToolFailureClassStats, countToolBudgetGuards } from "./traceToolingRuntime";

function deriveTraceHotspotsPermissionRiskParts(options: {
  events: readonly QueryStreamEvent[];
  formatPermissionRiskLabel: (risk: PermissionRiskClass) => string;
}): string {
  return deriveTracePermissionRiskEntriesFromEvents(options.events)
    .map((entry) => `${options.formatPermissionRiskLabel(entry.risk)}=${entry.count}`)
    .join(" ");
}

export function deriveTraceHotspotsMessage(options: {
  visibleEvents: QueryStreamEvent[];
  limit: number;
  queueLimit: number;
  filterLabel: string;
  warningLabel: string;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number) => string;
  formatFailureClassLabel: (failureClass: ToolFailureClass) => string;
  formatPermissionRiskLabel: (risk: PermissionRiskClass) => string;
  formatQueuePressureLabel: (
    pressure: ReturnType<typeof buildTraceQueuePriorityStats>["pressure"],
  ) => string;
  nowLabel: string;
  nextLabel: string;
  laterLabel: string;
}): string {
  const hotspotLimit = Math.max(1, Math.min(20, options.limit));
  const hotspotSummaries = buildTraceHotspotSummaries(options.visibleEvents, hotspotLimit);
  if (hotspotSummaries.length === 0) {
    return [
      options.t("agent.command.trace.hotspotsTitle", { count: 0 }),
      options.t("agent.command.trace.appliedFilter", {
        filter: options.filterLabel,
        warnings: options.warningLabel,
      }),
      options.t("agent.command.trace.hotspotsEmpty"),
    ].join("\n");
  }

  const hotspotLines = deriveTraceHotspotLineDescriptors(hotspotSummaries)
    .map((line) => options.t(line.key, line.vars));
  const riskProfileParts = deriveTraceHotspotsPermissionRiskParts({
    events: options.visibleEvents,
    formatPermissionRiskLabel: options.formatPermissionRiskLabel,
  });
  const riskProfileMatrixDescriptor = deriveTraceRiskProfileMatrixDescriptor(
    buildTracePermissionRiskProfileStats(options.visibleEvents),
  );
  const hotspotFailureClassStats = buildToolFailureClassStats({
    events: options.visibleEvents,
    formatFailureClassLabel: options.formatFailureClassLabel,
  });
  const hotspotBudgetGuardCount = countToolBudgetGuards(options.visibleEvents);
  const queuePriorityStats = buildTraceQueuePriorityStats(options.visibleEvents, options.queueLimit);
  const queuePriorityVars = deriveTraceHotspotsQueuePriorityVars({
    stats: queuePriorityStats,
    queueLimit: options.queueLimit,
    nowLabel: options.nowLabel,
    nextLabel: options.nextLabel,
    laterLabel: options.laterLabel,
    pressureLabel: options.formatQueuePressureLabel(queuePriorityStats.pressure),
    formatNumber: options.formatNumber,
  });
  const hintCommand = buildTraceHotspotsHintCommand({
    topTool: hotspotSummaries[0]?.tool ?? null,
    runWindow: options.runWindow,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
  });
  const metaLines = deriveTraceHotspotsMetaLineDescriptors({
    hotspotCount: hotspotSummaries.length,
    filterLabel: options.filterLabel,
    warningLabel: options.warningLabel,
    riskProfileParts,
    riskProfileMatrixVars: riskProfileMatrixDescriptor?.vars ?? null,
    failureClassDetails: hotspotFailureClassStats.total > 0 ? hotspotFailureClassStats.parts : "",
    budgetGuardCount: hotspotBudgetGuardCount,
    queuePriorityVars,
    hintCommand: null,
    formatNumber: options.formatNumber,
  }).map((line) => options.t(line.key, line.vars));

  return [
    ...metaLines,
    ...hotspotLines,
    ...(hintCommand ? [options.t("agent.command.trace.hotspotsHint", { command: hintCommand })] : []),
  ].join("\n");
}
