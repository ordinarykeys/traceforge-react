import type { PermissionRiskClass, QueryStreamEvent } from "./query/events";
import { getTracePermissionRisk } from "./traceRunRuntime";

export const TRACE_PERMISSION_RISK_ORDER: PermissionRiskClass[] = [
  "critical",
  "high_risk",
  "interactive",
  "path_outside",
  "policy",
];

export interface TracePermissionRiskEntry {
  risk: PermissionRiskClass;
  count: number;
}

function createEmptyTracePermissionRiskCounter(): Record<PermissionRiskClass, number> {
  return {
    critical: 0,
    high_risk: 0,
    interactive: 0,
    path_outside: 0,
    policy: 0,
  };
}

export function buildTracePermissionRiskCounter(
  events: readonly QueryStreamEvent[],
): Record<PermissionRiskClass, number> {
  const counter = createEmptyTracePermissionRiskCounter();
  for (const event of events) {
    const risk = getTracePermissionRisk(event);
    if (!risk) {
      continue;
    }
    counter[risk] += 1;
  }
  return counter;
}

export function deriveTracePermissionRiskEntries(
  counter: Readonly<Record<PermissionRiskClass, number>>,
): TracePermissionRiskEntry[] {
  return TRACE_PERMISSION_RISK_ORDER
    .map((risk) => ({
      risk,
      count: counter[risk],
    }))
    .filter((item) => item.count > 0);
}

export function deriveTracePermissionRiskEntriesFromEvents(
  events: readonly QueryStreamEvent[],
): TracePermissionRiskEntry[] {
  return deriveTracePermissionRiskEntries(buildTracePermissionRiskCounter(events));
}
