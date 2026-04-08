import type { RecoverDoctorRecommendation } from "./recoveryPolicy";
import type { TraceQueuePressure } from "./recoveryRuntime";
import {
  buildDiagnosisRecommendationBlueprint,
  deriveFallbackDiagnosisRecommendationSeverity,
  deriveHotspotDiagnosisRecommendationSeverity,
  deriveQueueDiagnosisRecommendationSeverity,
  deriveRecoverRecommendationTrendWeight,
  deriveReplayFailedRecommendationRiskProfile,
  shouldRecommendQueueDiagnosisByPressure,
  type DiagnosisRecommendationBlastRadiusLevel,
  type DiagnosisRecommendationBlueprint,
  type DiagnosisRecommendationId,
  type DiagnosisRecommendationReversibilityLevel,
  type DiagnosisRecommendationSeverity,
} from "./diagnosisRecommendationPolicy";

export interface QueueDiagnosisRecommendationBlueprintInput {
  pressure: TraceQueuePressure;
  label: string;
  reason: string;
  command: string;
  trendWeight: number;
  reversibility?: DiagnosisRecommendationReversibilityLevel;
  blastRadius?: DiagnosisRecommendationBlastRadiusLevel;
}

export function buildQueueDiagnosisRecommendationBlueprint(
  input: QueueDiagnosisRecommendationBlueprintInput,
): DiagnosisRecommendationBlueprint<"queue"> | null {
  if (!shouldRecommendQueueDiagnosisByPressure(input.pressure)) {
    return null;
  }
  const reversibility = input.reversibility ?? "reversible";
  const blastRadius = input.blastRadius ?? "local";
  return buildDiagnosisRecommendationBlueprint({
    id: "queue",
    label: input.label,
    reason: input.reason,
    severity: deriveQueueDiagnosisRecommendationSeverity(input.pressure),
    reversibility,
    blastRadius,
    trendWeight: input.trendWeight,
    command: input.command,
  });
}

export interface HotspotDiagnosisRecommendationBlueprintInput {
  label: string;
  reason: string;
  command: string;
  trendWeight: number;
  errors: number;
  denied: number;
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
}

export function buildHotspotDiagnosisRecommendationBlueprint(
  input: HotspotDiagnosisRecommendationBlueprintInput,
): DiagnosisRecommendationBlueprint<"hotspot"> {
  return buildDiagnosisRecommendationBlueprint({
    id: "hotspot",
    label: input.label,
    reason: input.reason,
    severity: deriveHotspotDiagnosisRecommendationSeverity({
      errors: input.errors,
      denied: input.denied,
    }),
    reversibility: input.reversibility,
    blastRadius: input.blastRadius,
    trendWeight: input.trendWeight,
    command: input.command,
  });
}

export interface FallbackDiagnosisRecommendationBlueprintInput {
  label: string;
  reason: string;
  command: string;
  trendWeight: number;
  suppressionRatioPct: number;
  thresholdPct?: number;
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
}

export function buildFallbackDiagnosisRecommendationBlueprint(
  input: FallbackDiagnosisRecommendationBlueprintInput,
): DiagnosisRecommendationBlueprint<"fallback"> {
  return buildDiagnosisRecommendationBlueprint({
    id: "fallback",
    label: input.label,
    reason: input.reason,
    severity: deriveFallbackDiagnosisRecommendationSeverity({
      suppressionRatioPct: input.suppressionRatioPct,
      thresholdPct: input.thresholdPct,
    }),
    reversibility: input.reversibility,
    blastRadius: input.blastRadius,
    trendWeight: input.trendWeight,
    command: input.command,
  });
}

export interface ReplayFailedDiagnosisRecommendationBlueprintInput {
  kind: string;
  label: string;
  reason: string;
  command: string;
  trendWeight: number;
  dominantReversibility: DiagnosisRecommendationReversibilityLevel;
  dominantBlastRadius: DiagnosisRecommendationBlastRadiusLevel;
}

export function buildReplayFailedDiagnosisRecommendationBlueprint(
  input: ReplayFailedDiagnosisRecommendationBlueprintInput,
): DiagnosisRecommendationBlueprint<"replay_failed"> {
  const { reversibility, blastRadius } = deriveReplayFailedRecommendationRiskProfile({
    kind: input.kind,
    dominantReversibility: input.dominantReversibility,
    dominantBlastRadius: input.dominantBlastRadius,
  });
  return buildDiagnosisRecommendationBlueprint({
    id: "replay_failed",
    label: input.label,
    reason: input.reason,
    severity: "high",
    reversibility,
    blastRadius,
    trendWeight: input.trendWeight,
    command: input.command,
  });
}

export interface RecoverDiagnosisRecommendationBlueprintInput {
  recommendation: RecoverDoctorRecommendation;
  label: string;
  reason: string;
  severity: DiagnosisRecommendationSeverity;
  command: string;
  queueInvestigateTrendWeight: number;
  recoverFailureTotal: number;
  recoverHasFailureSignals: boolean;
  reversibility?: DiagnosisRecommendationReversibilityLevel;
  blastRadius?: DiagnosisRecommendationBlastRadiusLevel;
}

export function buildRecoverDiagnosisRecommendationBlueprint(
  input: RecoverDiagnosisRecommendationBlueprintInput,
): DiagnosisRecommendationBlueprint<DiagnosisRecommendationId> {
  const trendWeight = deriveRecoverRecommendationTrendWeight({
    recommendation: input.recommendation,
    queueInvestigateTrendWeight: input.queueInvestigateTrendWeight,
    recoverFailureTotal: input.recoverFailureTotal,
    recoverHasFailureSignals: input.recoverHasFailureSignals,
  });
  const reversibility = input.reversibility ?? "reversible";
  const blastRadius = input.blastRadius ?? "local";
  return buildDiagnosisRecommendationBlueprint({
    id: `recover_${input.recommendation}` as DiagnosisRecommendationId,
    label: input.label,
    reason: input.reason,
    severity: input.severity,
    reversibility,
    blastRadius,
    trendWeight,
    command: input.command,
  });
}
