import type { TracePermissionBlastRadiusFilter, TracePermissionReversibilityFilter, TracePermissionRiskFilter, TraceRunWindow } from "./traceRunRuntime";
import { deriveTraceInvestigateRunbookLineDescriptors } from "./traceInvestigateRuntime";

export interface TraceInvestigateHotspotSnapshot {
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
}

export interface TraceInvestigateSubmitResult {
  accepted: boolean;
  reason?: "empty" | "queue_full";
  queueCount: number;
  queueLimit: number;
  started?: boolean;
}

export interface TraceInvestigateWorkflowTaskSnapshot {
  id: string;
  type: string;
  description: string;
}

export function deriveTraceInvestigateRunbookLines(options: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  tool: string;
  total: number;
  errors: number;
  rejected: number;
  denied: number;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}): string[] {
  return deriveTraceInvestigateRunbookLineDescriptors({
    tool: options.tool,
    total: options.total,
    errors: options.errors,
    rejected: options.rejected,
    denied: options.denied,
    runWindow: options.runWindow,
    riskFilter: options.riskFilter,
    reversibilityFilter: options.reversibilityFilter,
    blastRadiusFilter: options.blastRadiusFilter,
  }).map((line) => options.t(line.key, line.vars));
}

export function deriveTraceInvestigateSubmitResultLine(options: {
  submitResult: TraceInvestigateSubmitResult | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string | null {
  const { submitResult, t } = options;
  if (!submitResult) {
    return null;
  }
  if (submitResult.accepted) {
    if (submitResult.started) {
      return t("agent.command.trace.investigateSubmitStarted");
    }
    return t("agent.command.trace.investigateSubmitQueued", {
      queue: submitResult.queueCount,
      limit: submitResult.queueLimit,
    });
  }
  if (submitResult.reason === "queue_full") {
    return t("agent.command.trace.investigateSubmitQueueFull", {
      queue: submitResult.queueCount,
      limit: submitResult.queueLimit,
    });
  }
  return t("agent.command.trace.investigateSubmitEmpty");
}

export function deriveTraceInvestigateMessage(options: {
  hotspot: TraceInvestigateHotspotSnapshot | null;
  filterLabel: string;
  warningLabel: string;
  runbookLines: string[];
  includeRunbook: boolean;
  submitResultLine: string | null;
  workflowTask: TraceInvestigateWorkflowTaskSnapshot | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string {
  const { hotspot, t } = options;
  if (!hotspot) {
    return [
      t("agent.command.trace.investigateTitleEmpty"),
      t("agent.command.trace.appliedFilter", {
        filter: options.filterLabel,
        warnings: options.warningLabel,
      }),
      t("agent.command.trace.hotspotsEmpty"),
    ].join("\n");
  }

  const prompt = t("agent.command.trace.investigatePrompt", {
    tool: hotspot.tool,
    total: hotspot.total,
    errors: hotspot.errors,
    rejected: hotspot.rejected,
    denied: hotspot.denied,
  });

  return [
    t("agent.command.trace.investigateTitle", { tool: hotspot.tool }),
    t("agent.command.trace.appliedFilter", {
      filter: options.filterLabel,
      warnings: options.warningLabel,
    }),
    t("agent.command.trace.investigateStats", {
      total: hotspot.total,
      errors: hotspot.errors,
      rejected: hotspot.rejected,
      denied: hotspot.denied,
    }),
    ...(options.submitResultLine ? ["", options.submitResultLine] : []),
    "",
    prompt,
    ...(options.includeRunbook ? ["", ...options.runbookLines] : []),
    ...(options.workflowTask
      ? [
          "",
          t("agent.command.task.created", { taskId: options.workflowTask.id }),
          t("agent.command.task.createdType", { type: options.workflowTask.type }),
          t("agent.command.task.createdDescription", {
            description: options.workflowTask.description,
          }),
          t("agent.command.task.createdHint", { taskId: options.workflowTask.id }),
        ]
      : []),
  ].join("\n");
}

