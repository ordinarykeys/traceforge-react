import type { QueryStreamEvent, ToolFailureClass } from "./query/events";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function formatTraceTerminalReasonLabel(
  t: TranslateFn,
  terminalReason: Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"],
): string {
  switch (terminalReason) {
    case "completed":
      return t("agent.trace.terminal.completed");
    case "aborted":
      return t("agent.trace.terminal.aborted");
    case "stop_hook_prevented":
      return t("agent.trace.terminal.stopHookPrevented");
    case "max_iterations":
      return t("agent.trace.terminal.maxIterations");
    case "error":
      return t("agent.trace.terminal.error");
    default:
      return terminalReason;
  }
}

export function formatTraceRetryStrategyLabel(
  t: TranslateFn,
  strategy: string | undefined,
): string {
  if (typeof strategy !== "string" || strategy.length === 0) {
    return t("agent.trace.retryStrategy.balanced");
  }
  return t(`agent.trace.retryStrategy.${strategy}`);
}

export function formatTraceQueuePriorityLabel(
  t: TranslateFn,
  priority: Extract<QueryStreamEvent, { type: "queue_update" }>["priority"],
): string {
  if (!priority) {
    return "";
  }
  return t(`agent.queue.priority.${priority}`);
}

export function formatTraceToolFailureClassLabel(
  t: TranslateFn,
  failureClass: ToolFailureClass,
): string {
  return t(`agent.trace.toolFailureClass.${failureClass}`);
}

export function formatTraceToolBudgetReasonLabel(
  t: TranslateFn,
  reason: Extract<QueryStreamEvent, { type: "tool_budget_guard" }>["reason"],
): string {
  return t(`agent.trace.toolBudgetReason.${reason}`);
}

export function formatTraceFallbackSuppressedReasonLabel(
  t: TranslateFn,
  reason: string | undefined,
  unknownLabel: string,
): string {
  const normalized = (reason ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    return unknownLabel;
  }
  const key = `agent.trace.fallbackSuppressedReason.${normalized}`;
  const translated = t(key);
  return translated === key ? normalized : translated;
}
