import type { QueryStreamEvent } from "./query/events";
import {
  deriveTraceInvestigateRunbookLines,
  type TraceInvestigateHotspotSnapshot,
} from "./traceInvestigateMessageRuntime";
import type {
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";
import { buildTraceHotspotSummaries } from "./traceSummaryRuntime";

export interface TraceInvestigateWorkflowDescriptor {
  description: string;
  metadata: {
    source: "trace_investigate";
    tool: string;
    total: number;
    errors: number;
    rejected: number;
    denied: number;
  };
  logHeader: string;
}

export interface TraceInvestigateActionPlan {
  hotspot: TraceInvestigateHotspotSnapshot | null;
  runbookLines: string[];
  workflowDescriptor: TraceInvestigateWorkflowDescriptor | null;
  submitPrompt: string | null;
}

export function deriveTraceInvestigateActionPlan(options: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  visibleEvents: QueryStreamEvent[];
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
  investigateWorkflowMode: boolean;
  investigateSubmitMode: boolean;
}): TraceInvestigateActionPlan {
  const hotspot = buildTraceHotspotSummaries(options.visibleEvents, 1)[0] ?? null;
  const runbookLines = hotspot
    ? deriveTraceInvestigateRunbookLines({
        t: options.t,
        tool: hotspot.tool,
        total: hotspot.total,
        errors: hotspot.errors,
        rejected: hotspot.rejected,
        denied: hotspot.denied,
        runWindow: options.runWindow,
        riskFilter: options.riskFilter,
        reversibilityFilter: options.reversibilityFilter,
        blastRadiusFilter: options.blastRadiusFilter,
      })
    : [];

  const workflowDescriptor =
    hotspot && options.investigateWorkflowMode
      ? {
          description: options.t("agent.command.trace.investigateWorkflowDescription", {
            tool: hotspot.tool,
          }),
          metadata: {
            source: "trace_investigate" as const,
            tool: hotspot.tool,
            total: hotspot.total,
            errors: hotspot.errors,
            rejected: hotspot.rejected,
            denied: hotspot.denied,
          },
          logHeader: options.t("agent.command.trace.investigateWorkflowLogHeader", {
            tool: hotspot.tool,
          }),
        }
      : null;

  const submitPrompt =
    hotspot && options.investigateSubmitMode
      ? options.t("agent.command.trace.investigatePrompt", {
          tool: hotspot.tool,
          total: hotspot.total,
          errors: hotspot.errors,
          rejected: hotspot.rejected,
          denied: hotspot.denied,
        })
      : null;

  return {
    hotspot,
    runbookLines,
    workflowDescriptor,
    submitPrompt,
  };
}
