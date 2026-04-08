import {
  deriveDoctorFallbackSuppressionRatioPct,
  deriveDoctorQueueHealthStatus,
  shouldWarnDoctorBudgetGuardSummary,
  shouldWarnDoctorFallbackSuppressionRatio,
  shouldWarnDoctorPermissionRiskHigh,
  shouldWarnDoctorQueueDeduplicated,
  shouldWarnDoctorToolFailureSummary,
} from "./doctorStatusRuntime";

export type DoctorLineLevel = "ok" | "warn" | "fail";
export type DoctorLinePrefix = "[OK]" | "[WARN]" | "[FAIL]";

export interface DoctorQueueLineDescriptor {
  level: DoctorLineLevel;
  key:
    | "agent.command.doctor.queueFull"
    | "agent.command.doctor.queueHigh"
    | "agent.command.doctor.queueHealthy";
  vars: {
    queue: number;
    limit: number;
    pct: number;
  };
}

export interface DoctorFallbackSuppressionRatioLineDescriptor {
  level: DoctorLineLevel;
  key: "agent.command.doctor.fallbackSuppressedRatio";
  vars: {
    ratio: number;
    used: number;
    suppressed: number;
  };
}

export function toDoctorLinePrefix(level: DoctorLineLevel): DoctorLinePrefix {
  if (level === "warn") return "[WARN]";
  if (level === "fail") return "[FAIL]";
  return "[OK]";
}

export function formatDoctorLine(level: DoctorLineLevel, text: string): string {
  return `${toDoctorLinePrefix(level)} ${text}`;
}

export function deriveDoctorQueueLineDescriptor(
  queueCount: number,
  queueLimit: number,
): DoctorQueueLineDescriptor {
  const status = deriveDoctorQueueHealthStatus(queueCount, queueLimit);
  if (status.level === "full") {
    return {
      level: "warn",
      key: "agent.command.doctor.queueFull",
      vars: {
        queue: Math.max(0, Math.round(queueCount)),
        limit: Math.max(0, Math.round(queueLimit)),
        pct: status.pct,
      },
    };
  }
  if (status.level === "high") {
    return {
      level: "warn",
      key: "agent.command.doctor.queueHigh",
      vars: {
        queue: Math.max(0, Math.round(queueCount)),
        limit: Math.max(0, Math.round(queueLimit)),
        pct: status.pct,
      },
    };
  }
  return {
    level: "ok",
    key: "agent.command.doctor.queueHealthy",
    vars: {
      queue: Math.max(0, Math.round(queueCount)),
      limit: Math.max(0, Math.round(queueLimit)),
      pct: status.pct,
    },
  };
}

export function deriveDoctorFallbackSuppressionRatioLineDescriptor(
  input: {
    used: number;
    suppressed: number;
    thresholdPct?: number;
  },
): DoctorFallbackSuppressionRatioLineDescriptor | null {
  const ratio = deriveDoctorFallbackSuppressionRatioPct(input);
  if (ratio === null) {
    return null;
  }
  if (!shouldWarnDoctorFallbackSuppressionRatio(input)) {
    return null;
  }
  return {
    level: "warn",
    key: "agent.command.doctor.fallbackSuppressedRatio",
    vars: {
      ratio,
      used: Math.max(0, Math.round(input.used)),
      suppressed: Math.max(0, Math.round(input.suppressed)),
    },
  };
}

export function deriveDoctorToolFailureLineLevel(totalFailures: number): DoctorLineLevel {
  return shouldWarnDoctorToolFailureSummary(totalFailures) ? "warn" : "ok";
}

export function deriveDoctorBudgetGuardLineLevel(totalGuards: number): DoctorLineLevel {
  return shouldWarnDoctorBudgetGuardSummary(totalGuards) ? "warn" : "ok";
}

export function deriveDoctorQueueDeduplicatedLineLevel(queueDeduplicatedCount: number): DoctorLineLevel {
  return shouldWarnDoctorQueueDeduplicated(queueDeduplicatedCount) ? "warn" : "ok";
}

export function deriveDoctorPermissionRiskHighLineLevel(
  critical: number,
  highRisk: number,
): DoctorLineLevel {
  return shouldWarnDoctorPermissionRiskHigh({
    critical,
    highRisk,
  })
    ? "warn"
    : "ok";
}
