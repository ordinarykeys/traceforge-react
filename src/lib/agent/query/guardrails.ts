import type { PermissionRiskClass } from "./events";

export const DEFAULT_SCOPE_NOTICE_RISK_CLASSES = new Set<PermissionRiskClass>([
  "critical",
  "high_risk",
  "interactive",
  "path_outside",
]);

export function shouldTrackScopedApprovalRisk(
  riskClass: PermissionRiskClass | undefined,
  trackedRiskClasses: ReadonlySet<PermissionRiskClass> = DEFAULT_SCOPE_NOTICE_RISK_CLASSES,
): riskClass is PermissionRiskClass {
  return Boolean(riskClass && trackedRiskClasses.has(riskClass));
}

export function getPriorScopedApprovalsForTool(
  approvalCountsByTool: ReadonlyMap<string, number>,
  toolName: string,
  riskClass: PermissionRiskClass | undefined,
  trackedRiskClasses: ReadonlySet<PermissionRiskClass> = DEFAULT_SCOPE_NOTICE_RISK_CLASSES,
): {
  trackedRiskClass: PermissionRiskClass | undefined;
  priorApprovals: number;
} {
  const trackedRiskClass = shouldTrackScopedApprovalRisk(riskClass, trackedRiskClasses)
    ? riskClass
    : undefined;
  return {
    trackedRiskClass,
    priorApprovals: trackedRiskClass ? (approvalCountsByTool.get(toolName) ?? 0) : 0,
  };
}

export function noteScopedAuthorizationApproval(
  approvalCountsByTool: Map<string, number>,
  toolName: string,
  riskClass: PermissionRiskClass | undefined,
  trackedRiskClasses: ReadonlySet<PermissionRiskClass> = DEFAULT_SCOPE_NOTICE_RISK_CLASSES,
): {
  trackedRiskClass: PermissionRiskClass | undefined;
  previousApprovals: number;
  nextApprovals: number;
} {
  if (!shouldTrackScopedApprovalRisk(riskClass, trackedRiskClasses)) {
    return {
      trackedRiskClass: undefined,
      previousApprovals: 0,
      nextApprovals: 0,
    };
  }
  const previousApprovals = approvalCountsByTool.get(toolName) ?? 0;
  const nextApprovals = previousApprovals + 1;
  approvalCountsByTool.set(toolName, nextApprovals);
  return {
    trackedRiskClass: riskClass,
    previousApprovals,
    nextApprovals,
  };
}

export interface ToolRetryGuardHint {
  tool: string;
  streak: number;
}

export function updateToolFailureStreak(
  failureStreakBySignature: Map<string, ToolRetryGuardHint>,
  emittedRetryGuardSignatures: Set<string>,
  options: {
    signature: string;
    tool: string;
    outcome: "result" | "rejected" | "error";
    threshold: number;
  },
): ToolRetryGuardHint | null {
  if (options.outcome === "result") {
    failureStreakBySignature.delete(options.signature);
    emittedRetryGuardSignatures.delete(options.signature);
    return null;
  }

  const previous = failureStreakBySignature.get(options.signature)?.streak ?? 0;
  const nextStreak = previous + 1;
  const nextState = {
    tool: options.tool,
    streak: nextStreak,
  };
  failureStreakBySignature.set(options.signature, nextState);
  if (nextStreak < options.threshold) {
    return null;
  }
  if (emittedRetryGuardSignatures.has(options.signature)) {
    return null;
  }
  emittedRetryGuardSignatures.add(options.signature);
  return nextState;
}
