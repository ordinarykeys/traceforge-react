import type {
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";

export interface TraceInvestigateRunbookLineDescriptor {
  key: string;
  vars?: Record<string, string | number>;
}

export function buildTraceInvestigateSummaryCommand(options: {
  tool: string;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): string {
  const scopedFilters: string[] = [];
  if (options.riskFilter !== "all") scopedFilters.push(`risk=${options.riskFilter}`);
  if (options.reversibilityFilter !== "all") scopedFilters.push(`reversibility=${options.reversibilityFilter}`);
  if (options.blastRadiusFilter !== "all") scopedFilters.push(`blast=${options.blastRadiusFilter}`);
  return `/trace summary failure tool=${options.tool} ${
    options.runWindow === "all" ? "runs=all" : `runs=${options.runWindow}`
  }${scopedFilters.length > 0 ? ` ${scopedFilters.join(" ")}` : ""}`;
}

export function deriveTraceInvestigateRunbookLineDescriptors(options: {
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): TraceInvestigateRunbookLineDescriptor[] {
  const traceCommand = buildTraceInvestigateSummaryCommand({
    tool: options.tool,
    runWindow: options.runWindow,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
  });
  return [
    { key: "agent.command.trace.investigateRunbookTitle" },
    {
      key: "agent.command.trace.investigateRunbookScope",
      vars: {
        tool: options.tool,
        total: options.total,
        errors: options.errors,
        rejected: options.rejected,
        denied: options.denied,
      },
    },
    { key: "agent.command.trace.investigateRunbookDiagnosis" },
    { key: "agent.command.trace.investigateRunbookDiagnosisItem", vars: { command: traceCommand } },
    { key: "agent.command.trace.investigateRunbookFix" },
    { key: "agent.command.trace.investigateRunbookFixItem" },
    { key: "agent.command.trace.investigateRunbookVerify" },
    { key: "agent.command.trace.investigateRunbookVerifyItemLint" },
    { key: "agent.command.trace.investigateRunbookVerifyItemBuild" },
    { key: "agent.command.trace.investigateRunbookVerifyItemTest" },
    { key: "agent.command.trace.investigateRunbookRollback" },
    { key: "agent.command.trace.investigateRunbookRollbackItem" },
  ];
}
