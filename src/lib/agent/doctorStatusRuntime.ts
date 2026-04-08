export interface DoctorFallbackSuppressionInput {
  used: number;
  suppressed: number;
  thresholdPct?: number;
}

export interface DoctorQueueHealthStatus {
  level: "full" | "high" | "healthy";
  pct: number;
}

export interface DoctorPermissionRiskInput {
  critical: number;
  highRisk: number;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveDoctorFallbackSuppressionRatioPct(
  input: DoctorFallbackSuppressionInput,
): number | null {
  const used = normalizeCount(input.used);
  const suppressed = normalizeCount(input.suppressed);
  const total = used + suppressed;
  if (suppressed <= 0 || total <= 0) {
    return null;
  }
  return Math.round((suppressed / total) * 100);
}

export function shouldWarnDoctorFallbackSuppressionRatio(
  input: DoctorFallbackSuppressionInput,
): boolean {
  const ratioPct = deriveDoctorFallbackSuppressionRatioPct(input);
  if (ratioPct === null) {
    return false;
  }
  const thresholdPct = Math.max(0, input.thresholdPct ?? 50);
  return ratioPct >= thresholdPct;
}

export function shouldWarnDoctorToolFailureSummary(totalFailures: number): boolean {
  return normalizeCount(totalFailures) > 0;
}

export function shouldWarnDoctorBudgetGuardSummary(totalGuards: number): boolean {
  return normalizeCount(totalGuards) > 0;
}

export function deriveDoctorQueueHealthStatus(
  queueCountValue: number,
  queueLimitValue: number,
): DoctorQueueHealthStatus {
  const queueCount = normalizeCount(queueCountValue);
  const queueLimit = normalizeCount(queueLimitValue);
  const pct = queueLimit > 0 ? Math.min(100, Math.round((queueCount / queueLimit) * 100)) : 0;
  if (queueLimit > 0 && queueCount >= queueLimit) {
    return {
      level: "full",
      pct,
    };
  }
  if (queueLimit > 0 && queueCount >= Math.ceil(queueLimit * 0.75)) {
    return {
      level: "high",
      pct,
    };
  }
  return {
    level: "healthy",
    pct,
  };
}

export function shouldWarnDoctorQueueDeduplicated(queueDeduplicatedCount: number): boolean {
  return normalizeCount(queueDeduplicatedCount) > 0;
}

export function shouldWarnDoctorPermissionRiskHigh(input: DoctorPermissionRiskInput): boolean {
  return normalizeCount(input.critical) > 0 || normalizeCount(input.highRisk) > 0;
}
