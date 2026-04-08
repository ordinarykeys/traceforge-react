import type { TraceCategory } from "./traceRunRuntime";
import { TRACE_CATEGORY_ORDER } from "./traceRunRuntime";
import type { TraceSummaryRunSnapshot } from "./traceSummaryRenderRuntime";

export interface TraceSummaryCategoryEntry {
  category: TraceCategory;
  count: number;
}

export function deriveTraceSummaryCategoryEntries(
  categoryCounts: Record<TraceCategory, number>,
  categoryOrder: readonly TraceCategory[] = TRACE_CATEGORY_ORDER,
): TraceSummaryCategoryEntry[] {
  return categoryOrder
    .filter((category) => categoryCounts[category] > 0)
    .map((category) => ({
      category,
      count: categoryCounts[category],
    }));
}

export interface TraceSummaryRunBaseDescriptor {
  key: "agent.command.trace.summaryLine";
  vars: {
    run: number;
    status: string;
    duration: string;
    events: number;
    warns: number;
    errors: number;
    categories: string;
  };
}

export function deriveTraceSummaryRunBaseDescriptor(options: {
  run: Pick<
    TraceSummaryRunSnapshot,
    "runIndex" | "durationSec" | "visibleEvents" | "warningCount" | "errorCount"
  >;
  statusLabel: string;
  categoryParts: string;
}): TraceSummaryRunBaseDescriptor {
  const { run, statusLabel, categoryParts } = options;
  return {
    key: "agent.command.trace.summaryLine",
    vars: {
      run: run.runIndex,
      status: statusLabel,
      duration: run.durationSec.toFixed(1),
      events: run.visibleEvents.length,
      warns: run.warningCount,
      errors: run.errorCount,
      categories: categoryParts,
    },
  };
}

export function composeTraceSummaryRunLine(baseLine: string, detailLines: string[]): string {
  if (detailLines.length === 0) {
    return baseLine;
  }
  return `${baseLine}\n  ${detailLines.join("\n  ")}`;
}

export function composeTraceSummaryMessage(options: {
  titleLine: string;
  appliedFilterLine: string;
  overviewLines: Array<string | null | undefined>;
  runLines: string[];
}): string {
  const { titleLine, appliedFilterLine, overviewLines, runLines } = options;
  return [
    titleLine,
    appliedFilterLine,
    ...overviewLines.filter((line): line is string => Boolean(line)),
    ...runLines,
  ].join("\n");
}
