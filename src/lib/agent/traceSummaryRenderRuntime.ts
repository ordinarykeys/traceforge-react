import type { QueryStreamEvent } from "./query/events";
import type { TraceCategory, VisibleTraceRunSummary } from "./traceRunRuntime";
import {
  buildTraceFallbackStats,
  buildTraceHotspotParts,
  buildTracePermissionRiskProfileStats,
  buildTraceQueuePriorityStats,
  type TraceFallbackStats,
  type TracePermissionRiskProfileStats,
  type TraceQueuePriorityStats,
} from "./traceSummaryRuntime";

type PromptCompiledEvent = Extract<QueryStreamEvent, { type: "prompt_compiled" }>;

export interface TraceSummaryRunSnapshot {
  runIndex: number;
  startedAt: number;
  endedAt: number;
  terminalReason?: Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"];
  visibleEvents: QueryStreamEvent[];
  warningCount: number;
  errorCount: number;
  categoryCounts: Record<TraceCategory, number>;
  durationSec: number;
  latestPromptCompiled: PromptCompiledEvent | null;
  hotspotParts: string;
  riskProfileStats: TracePermissionRiskProfileStats | null;
  fallbackStats: TraceFallbackStats;
  queuePriorityStats: TraceQueuePriorityStats;
}

export interface TraceSummaryOverviewSnapshot {
  visibleEvents: QueryStreamEvent[];
  hotspotParts: string;
  riskProfileStats: TracePermissionRiskProfileStats | null;
  fallbackStats: TraceFallbackStats;
  queuePriorityStats: TraceQueuePriorityStats;
}

export interface TraceSummarySnapshot {
  runs: TraceSummaryRunSnapshot[];
  overview: TraceSummaryOverviewSnapshot;
}

function getLatestPromptCompiledEvent(events: QueryStreamEvent[]): PromptCompiledEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "prompt_compiled") {
      return event;
    }
  }
  return null;
}

function normalizeRiskProfileStats(
  stats: TracePermissionRiskProfileStats,
): TracePermissionRiskProfileStats | null {
  return stats.total > 0 ? stats : null;
}

export function deriveTraceSummarySnapshot(options: {
  visibleRuns: VisibleTraceRunSummary[];
  limit: number;
  queueLimit: number;
}): TraceSummarySnapshot {
  const limitedRuns =
    options.visibleRuns.length > options.limit
      ? options.visibleRuns.slice(options.visibleRuns.length - options.limit)
      : options.visibleRuns;

  const runSnapshots: TraceSummaryRunSnapshot[] = limitedRuns.map((run) => {
    const riskProfileStats = buildTracePermissionRiskProfileStats(run.visibleEvents);
    return {
      runIndex: run.runIndex,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      terminalReason: run.terminalReason,
      visibleEvents: run.visibleEvents,
      warningCount: run.warningCount,
      errorCount: run.errorCount,
      categoryCounts: run.categoryCounts,
      durationSec: Math.max(0, (run.endedAt - run.startedAt) / 1000),
      latestPromptCompiled: getLatestPromptCompiledEvent(run.visibleEvents),
      hotspotParts: buildTraceHotspotParts(run.visibleEvents, 5),
      riskProfileStats: normalizeRiskProfileStats(riskProfileStats),
      fallbackStats: buildTraceFallbackStats(run.visibleEvents),
      queuePriorityStats: buildTraceQueuePriorityStats(run.visibleEvents, options.queueLimit),
    };
  });

  const overallVisibleEvents = runSnapshots.flatMap((run) => run.visibleEvents);
  const overallRiskProfileStats = buildTracePermissionRiskProfileStats(overallVisibleEvents);

  return {
    runs: runSnapshots,
    overview: {
      visibleEvents: overallVisibleEvents,
      hotspotParts: buildTraceHotspotParts(overallVisibleEvents, 8),
      riskProfileStats: normalizeRiskProfileStats(overallRiskProfileStats),
      fallbackStats: buildTraceFallbackStats(overallVisibleEvents),
      queuePriorityStats: buildTraceQueuePriorityStats(overallVisibleEvents, options.queueLimit),
    },
  };
}
