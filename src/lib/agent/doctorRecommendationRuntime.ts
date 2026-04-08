import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";

export type DoctorToolFailureClass =
  | "permission"
  | "workspace"
  | "timeout"
  | "not_found"
  | "network"
  | "validation"
  | "runtime";

export type DoctorFallbackSuppressedReason =
  | "retry_strategy"
  | "already_retried"
  | "fallback_missing"
  | "same_model"
  | "gate_disabled"
  | string;

export interface DoctorBudgetGuardStatsInput {
  perToolLimit: number;
  failureBackoff: number;
}

export interface DoctorPermissionRiskCountersInput {
  critical: number;
  high_risk: number;
  path_outside: number;
  reversibilityHardToReverse: number;
  blastShared: number;
}

export function deriveDoctorFallbackRecommendationIds(
  reason: DoctorFallbackSuppressedReason | undefined | null,
): DoctorRecommendationId[] {
  if (reason === "retry_strategy" || reason === "already_retried") {
    return ["relieveQueueForFallback"];
  }
  if (reason === "fallback_missing" || reason === "same_model") {
    return ["configureFallbackModel"];
  }
  if (reason === "gate_disabled") {
    return ["enableFallbackGate"];
  }
  return [];
}

export function deriveDoctorToolFailureRecommendationIds(
  counts: Readonly<Record<DoctorToolFailureClass, number>>,
): DoctorRecommendationId[] {
  const recommendations: DoctorRecommendationId[] = [];
  if (counts.permission > 0) recommendations.push("fixPermissionRuleForTools");
  if (counts.workspace > 0) recommendations.push("fixWorkspaceBoundaryFailures");
  if (counts.timeout > 0) recommendations.push("reduceToolTimeoutPressure");
  if (counts.network > 0) recommendations.push("checkNetworkAndEndpoint");
  if (counts.not_found > 0) recommendations.push("investigateMissingResources");
  if (counts.validation > 0) recommendations.push("validateToolInputShape");
  if (counts.runtime > 0) recommendations.push("inspectToolRuntimeErrors");
  return recommendations;
}

export function deriveDoctorBudgetRecommendationIds(
  stats: DoctorBudgetGuardStatsInput,
): DoctorRecommendationId[] {
  const recommendations: DoctorRecommendationId[] = [];
  if (stats.perToolLimit > 0) {
    recommendations.push("tuneToolBudgetPolicy");
  }
  if (stats.failureBackoff > 0) {
    recommendations.push("waitForFailureBackoffRecovery");
  }
  return recommendations;
}

export function shouldRecommendDoctorRelieveQueue(
  queueCount: number,
  queueLimit: number,
): boolean {
  if (queueLimit <= 0) {
    return false;
  }
  return queueCount >= Math.ceil(queueLimit * 0.75);
}

export function shouldRecommendDoctorAvoidDuplicateQueueSubmissions(
  queueDeduplicatedCount: number,
): boolean {
  return queueDeduplicatedCount >= 3;
}

export function shouldRecommendDoctorInspectTasks(runningTaskCount: number): boolean {
  return runningTaskCount > 0;
}

export function deriveDoctorPermissionRecommendationIds(
  counters: DoctorPermissionRiskCountersInput,
): DoctorRecommendationId[] {
  const recommendations: DoctorRecommendationId[] = [];
  if (counters.critical > 0 || counters.high_risk > 0) {
    recommendations.push("reduceHighRiskApprovals");
  }
  if (counters.path_outside > 0) {
    recommendations.push("keepWorkspaceBoundaries");
  }
  if (counters.reversibilityHardToReverse > 0 || counters.blastShared > 0) {
    recommendations.push("explicitConfirmationForIrreversible");
  }
  return recommendations;
}
