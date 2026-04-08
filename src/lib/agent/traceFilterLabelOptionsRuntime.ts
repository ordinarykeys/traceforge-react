import type { DeriveTraceAppliedFilterLabelSnapshotOptions } from "./traceFilterRuntime";
import type {
  TraceFilter,
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";

export function createTraceAppliedFilterLabelOptions(options: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  filter: TraceFilter;
  warningsOnly: boolean;
  failureFocus: boolean;
  hottestMode: boolean;
  hottestApplied: boolean;
  effectiveToolFocus: string | null;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): DeriveTraceAppliedFilterLabelSnapshotOptions {
  return {
    filterLabel:
      options.filter === "all"
        ? options.t("agent.trace.filter.all")
        : options.t(`agent.trace.filter.${options.filter}`),
    warningsOnly: options.warningsOnly,
    warningsOnlyLabel: options.t("agent.trace.filter.warningsOnly"),
    failureFocus: options.failureFocus,
    failureFocusLabel: options.t("agent.trace.filter.failureFocus"),
    hottestMode: options.hottestMode,
    hottestApplied: options.hottestApplied,
    hottestAppliedLabel: options.t("agent.command.trace.filterHottestApplied", {
      tool: options.effectiveToolFocus ?? "",
    }),
    hottestNoDataLabel: options.t("agent.command.trace.filterHottestNoData"),
    toolLabel: options.effectiveToolFocus
      ? options.t("agent.command.trace.filterTool", { tool: options.effectiveToolFocus })
      : null,
    runsAll: options.runWindow === "all",
    runsAllLabel: options.t("agent.command.trace.filterRunsAll"),
    runsWindowLabel: options.t("agent.command.trace.filterRunsWindow", { runs: options.runWindow }),
    riskLabel:
      options.riskFilter !== "all"
        ? options.t("agent.command.trace.filterRisk", {
            risk: options.t(`agent.trace.permissionRisk.${options.riskFilter}`),
          })
        : null,
    reversibilityLabel:
      options.reversibilityFilter !== "all"
        ? options.t("agent.command.trace.filterReversibility", {
            value: options.t(`agent.permission.prompt.reversibility.${options.reversibilityFilter}`),
          })
        : null,
    blastRadiusLabel:
      options.blastRadiusFilter !== "all"
        ? options.t("agent.command.trace.filterBlastRadius", {
            value: options.t(`agent.permission.prompt.blastRadius.${options.blastRadiusFilter}`),
          })
        : null,
  };
}
