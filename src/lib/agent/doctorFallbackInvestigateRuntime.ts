import type { TraceQueuePressure } from "./recoveryRuntime";

export type DoctorFallbackInvestigateLineKey =
  | "agent.command.doctor.fallbackInvestigateTitle"
  | "agent.command.doctor.fallbackInvestigateScope"
  | "agent.command.doctor.fallbackInvestigateAssessmentHigh"
  | "agent.command.doctor.fallbackInvestigateAssessmentNormal"
  | "agent.command.doctor.fallbackInvestigateDiagnosisHeader"
  | "agent.command.doctor.fallbackInvestigateDiagnosisTraceSummary"
  | "agent.command.doctor.fallbackInvestigateDiagnosisQueueHotspots"
  | "agent.command.doctor.fallbackInvestigateFixHeader"
  | "agent.command.doctor.fallbackInvestigateFixPolicy"
  | "agent.command.doctor.fallbackInvestigateFixQueue"
  | "agent.command.doctor.fallbackInvestigateVerifyHeader"
  | "agent.command.doctor.fallbackInvestigateVerifyStatus"
  | "agent.command.doctor.fallbackInvestigateVerifyDoctor"
  | "agent.command.doctor.fallbackInvestigateVerifyOutcome";

export interface DoctorFallbackInvestigateLineDescriptor {
  key: DoctorFallbackInvestigateLineKey;
  vars?: Record<string, string>;
}

export interface DoctorFallbackInvestigateRuntimeInput {
  kv: Record<string, string>;
  queuePressure: TraceQueuePressure;
  queuePressureLabel: string;
  reasonLabel: string;
  strategyLabel: string;
  suppressionWarnThresholdPct: number;
  formatNumber: (value: number) => string;
}

export interface DoctorFallbackInvestigateRuntimeOutput {
  fallbackSuppressed: number;
  fallbackUsed: number;
  retryEvents: number;
  suppressionRatioPct: number;
  assessmentKey:
    | "agent.command.doctor.fallbackInvestigateAssessmentHigh"
    | "agent.command.doctor.fallbackInvestigateAssessmentNormal";
  lines: DoctorFallbackInvestigateLineDescriptor[];
}

function parseNonNegativeNumber(value: string | undefined, fallback = 0): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.round(parsed));
}

export function deriveDoctorFallbackInvestigateRuntime(
  input: DoctorFallbackInvestigateRuntimeInput,
): DoctorFallbackInvestigateRuntimeOutput {
  const fallbackSuppressed = parseNonNegativeNumber(input.kv.fallback_suppressed, 0);
  const fallbackUsed = parseNonNegativeNumber(input.kv.fallback_used, 0);
  const retryEvents = parseNonNegativeNumber(input.kv.retry_events, 0);
  const derivedTotal = fallbackSuppressed + fallbackUsed;
  const suppressionRatioPct = parseNonNegativeNumber(
    input.kv.suppression_ratio_pct,
    derivedTotal > 0 ? Math.round((fallbackSuppressed / derivedTotal) * 100) : 0,
  );

  const assessmentKey =
    suppressionRatioPct >= input.suppressionWarnThresholdPct || fallbackSuppressed > 0
      ? "agent.command.doctor.fallbackInvestigateAssessmentHigh"
      : "agent.command.doctor.fallbackInvestigateAssessmentNormal";

  return {
    fallbackSuppressed,
    fallbackUsed,
    retryEvents,
    suppressionRatioPct,
    assessmentKey,
    lines: [
      {
        key: "agent.command.doctor.fallbackInvestigateTitle",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateScope",
        vars: {
          suppressed: input.formatNumber(fallbackSuppressed),
          used: input.formatNumber(fallbackUsed),
          ratio: input.formatNumber(suppressionRatioPct),
          retryEvents: input.formatNumber(retryEvents),
          reason: input.reasonLabel,
          strategy: input.strategyLabel,
          pressure: input.queuePressureLabel,
        },
      },
      {
        key: assessmentKey,
      },
      {
        key: "agent.command.doctor.fallbackInvestigateDiagnosisHeader",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateDiagnosisTraceSummary",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateDiagnosisQueueHotspots",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateFixHeader",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateFixPolicy",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateFixQueue",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateVerifyHeader",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateVerifyStatus",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateVerifyDoctor",
      },
      {
        key: "agent.command.doctor.fallbackInvestigateVerifyOutcome",
      },
    ],
  };
}
