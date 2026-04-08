import type { QueryStreamEvent } from "./query/events";
import {
  buildVisibleTraceRunSummaries,
  type TraceFilter,
  type TracePermissionBlastRadiusFilter,
  type TracePermissionReversibilityFilter,
  type TracePermissionRiskFilter,
  type TraceRunWindow,
  type VisibleTraceRunSummary,
} from "./traceRunRuntime";
import { buildTraceHotspotSummaries } from "./traceSummaryRuntime";

export interface TraceVisibilitySnapshot {
  allEvents: QueryStreamEvent[];
  effectiveToolFocus: string | null;
  hottestApplied: boolean;
  visibleRuns: VisibleTraceRunSummary[];
  flattenedVisibleEvents: QueryStreamEvent[];
  visibleEvents: QueryStreamEvent[];
}

export function deriveTraceVisibilitySnapshot(options: {
  allEvents: QueryStreamEvent[];
  filter: TraceFilter;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
  warningsOnly: boolean;
  failureFocus: boolean;
  toolFocus: string | null;
  runWindow: TraceRunWindow;
  hottestMode: boolean;
  limit: number;
}): TraceVisibilitySnapshot {
  let effectiveToolFocus = options.toolFocus;
  let hottestApplied = false;

  if (options.hottestMode && !effectiveToolFocus) {
    const candidateRuns = buildVisibleTraceRunSummaries({
      events: options.allEvents,
      filter: options.filter,
      riskFilter: options.riskFilter,
      reversibilityFilter: options.reversibilityFilter,
      blastRadiusFilter: options.blastRadiusFilter,
      warningsOnly: options.warningsOnly,
      failureFocus: options.failureFocus,
      toolFocus: null,
      runWindow: options.runWindow,
    });
    const hottest = buildTraceHotspotSummaries(
      candidateRuns.flatMap((run) => run.visibleEvents),
      1,
    )[0];
    if (hottest) {
      effectiveToolFocus = hottest.tool;
      hottestApplied = true;
    }
  }

  const visibleRuns = buildVisibleTraceRunSummaries({
    events: options.allEvents,
    filter: options.filter,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
    warningsOnly: options.warningsOnly,
    failureFocus: options.failureFocus,
    toolFocus: effectiveToolFocus,
    runWindow: options.runWindow,
  });
  const flattenedVisibleEvents = visibleRuns.flatMap((run) => run.visibleEvents);
  const visibleEvents =
    flattenedVisibleEvents.length > options.limit
      ? flattenedVisibleEvents.slice(flattenedVisibleEvents.length - options.limit)
      : flattenedVisibleEvents;

  return {
    allEvents: options.allEvents,
    effectiveToolFocus,
    hottestApplied,
    visibleRuns,
    flattenedVisibleEvents,
    visibleEvents,
  };
}

