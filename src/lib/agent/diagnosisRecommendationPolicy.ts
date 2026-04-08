import type { RecoverDoctorRecommendation } from "./recoveryPolicy";
import type { TraceQueuePressure } from "./recoveryRuntime";

export type DoctorRecommendationId =
  | "selectWorkspace"
  | "checkGit"
  | "initGit"
  | "recoverPlan"
  | "queueHeal"
  | "recoverAuto"
  | "resumeInterruptedTurn"
  | "recoverExecuteStrict"
  | "recoverInvestigate"
  | "queueInvestigate"
  | "relieveQueue"
  | "relieveQueueForFallback"
  | "configureFallbackModel"
  | "enableFallbackGate"
  | "inspectTasks"
  | "allowWorkspaceWrite"
  | "fixPermissionRuleForTools"
  | "fixWorkspaceBoundaryFailures"
  | "reduceToolTimeoutPressure"
  | "checkNetworkAndEndpoint"
  | "investigateMissingResources"
  | "validateToolInputShape"
  | "inspectToolRuntimeErrors"
  | "tuneToolBudgetPolicy"
  | "waitForFailureBackoffRecovery"
  | "avoidDuplicateQueueSubmissions"
  | "reduceHighRiskApprovals"
  | "keepWorkspaceBoundaries"
  | "explicitConfirmationForIrreversible";

export interface DoctorRecommendationEntry {
  id: DoctorRecommendationId;
  text: string;
}

const DOCTOR_RECOMMENDATION_RANK: Readonly<Record<DoctorRecommendationId, number>> = Object.freeze({
  selectWorkspace: 0,
  checkGit: 10,
  initGit: 20,

  recoverPlan: 100,
  queueHeal: 110,
  recoverAuto: 120,
  resumeInterruptedTurn: 130,
  recoverExecuteStrict: 140,
  recoverInvestigate: 150,
  queueInvestigate: 160,

  relieveQueue: 200,
  relieveQueueForFallback: 210,
  configureFallbackModel: 220,
  enableFallbackGate: 230,
  inspectTasks: 240,
  allowWorkspaceWrite: 250,

  fixPermissionRuleForTools: 300,
  fixWorkspaceBoundaryFailures: 310,
  reduceToolTimeoutPressure: 320,
  checkNetworkAndEndpoint: 330,
  investigateMissingResources: 340,
  validateToolInputShape: 350,
  inspectToolRuntimeErrors: 360,
  tuneToolBudgetPolicy: 370,
  waitForFailureBackoffRecovery: 380,
  avoidDuplicateQueueSubmissions: 390,
  reduceHighRiskApprovals: 400,
  keepWorkspaceBoundaries: 410,
  explicitConfirmationForIrreversible: 420,
});

interface DoctorRecommendationEntryWithIndex extends DoctorRecommendationEntry {
  index: number;
}

export function prioritizeDoctorRecommendationEntries(
  recommendations: readonly DoctorRecommendationEntry[],
): DoctorRecommendationEntry[] {
  const unique: DoctorRecommendationEntryWithIndex[] = [];
  const seen = new Set<DoctorRecommendationId>();
  for (let index = 0; index < recommendations.length; index += 1) {
    const recommendation = recommendations[index];
    if (!recommendation || seen.has(recommendation.id)) {
      continue;
    }
    seen.add(recommendation.id);
    unique.push({
      ...recommendation,
      index,
    });
  }
  return unique
    .map((item) => ({
      ...item,
      rank: DOCTOR_RECOMMENDATION_RANK[item.id] ?? 1000 + item.index,
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ id, text }) => ({ id, text }));
}

export function prioritizeDoctorRecommendations(
  recommendations: readonly DoctorRecommendationEntry[],
): string[] {
  return prioritizeDoctorRecommendationEntries(recommendations).map((item) => item.text);
}

export type DiagnosisRecommendationId =
  | `recover_${RecoverDoctorRecommendation}`
  | "queue"
  | "hotspot"
  | "fallback"
  | "replay_failed";

export type DiagnosisRecommendationSeverity = "high" | "medium" | "low";
export type DiagnosisRecommendationReversibilityLevel = "reversible" | "mixed" | "hard_to_reverse";
export type DiagnosisRecommendationBlastRadiusLevel = "local" | "workspace" | "shared";

const DIAGNOSIS_RECOMMENDATION_TIEBREAK_RANK: Readonly<Record<DiagnosisRecommendationId, number>> = Object.freeze({
  recover_recoverPlan: 0,
  recover_queueHeal: 1,
  recover_recoverAuto: 2,
  recover_resumeInterruptedTurn: 3,
  recover_recoverExecuteStrict: 4,
  recover_recoverInvestigate: 5,
  recover_queueInvestigate: 6,
  queue: 20,
  hotspot: 30,
  fallback: 40,
  replay_failed: 50,
});

export interface DiagnosisRecommendationRankingInput {
  id: string;
  priorityScore: number;
  matrixScore: number;
  trendWeight: number;
}

export function getDiagnosisRecommendationTieBreakRank(id: string): number {
  const rank = DIAGNOSIS_RECOMMENDATION_TIEBREAK_RANK[id as DiagnosisRecommendationId];
  return typeof rank === "number" ? rank : 10_000;
}

export function compareDiagnosisRecommendationPriority(
  left: DiagnosisRecommendationRankingInput,
  right: DiagnosisRecommendationRankingInput,
): number {
  return (
    right.priorityScore - left.priorityScore ||
    right.matrixScore - left.matrixScore ||
    right.trendWeight - left.trendWeight ||
    getDiagnosisRecommendationTieBreakRank(left.id) - getDiagnosisRecommendationTieBreakRank(right.id) ||
    left.id.localeCompare(right.id)
  );
}

export function getDiagnosisReversibilityMatrixScore(
  value: DiagnosisRecommendationReversibilityLevel,
): number {
  switch (value) {
    case "hard_to_reverse":
      return 3;
    case "mixed":
      return 2;
    case "reversible":
    default:
      return 1;
  }
}

export function getDiagnosisBlastRadiusMatrixScore(
  value: DiagnosisRecommendationBlastRadiusLevel,
): number {
  switch (value) {
    case "shared":
      return 3;
    case "workspace":
      return 2;
    case "local":
    default:
      return 1;
  }
}

export function deriveDiagnosisMatrixScore(
  reversibility: DiagnosisRecommendationReversibilityLevel,
  blastRadius: DiagnosisRecommendationBlastRadiusLevel,
): number {
  return getDiagnosisReversibilityMatrixScore(reversibility) + getDiagnosisBlastRadiusMatrixScore(blastRadius);
}

export function deriveDiagnosisPriorityScore(
  severity: DiagnosisRecommendationSeverity,
  matrixScore: number,
  trendWeight: number,
): number {
  const severityWeight = severity === "high" ? 3 : severity === "medium" ? 2 : 1;
  return severityWeight * 5 + matrixScore * 2 + trendWeight;
}

export interface DiagnosisRecommendationScoreInput {
  severity: DiagnosisRecommendationSeverity;
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
  trendWeight: number;
}

export interface DiagnosisRecommendationScoreOutput {
  matrixScore: number;
  priorityScore: number;
}

export function deriveDiagnosisRecommendationScore(
  input: DiagnosisRecommendationScoreInput,
): DiagnosisRecommendationScoreOutput {
  const matrixScore = deriveDiagnosisMatrixScore(input.reversibility, input.blastRadius);
  return {
    matrixScore,
    priorityScore: deriveDiagnosisPriorityScore(input.severity, matrixScore, input.trendWeight),
  };
}

export interface DiagnosisRecommendationBlueprintInput<Id extends string = string> {
  id: Id;
  label: string;
  reason: string;
  severity: DiagnosisRecommendationSeverity;
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
  trendWeight: number;
  command: string;
  canRun?: boolean;
}

export interface DiagnosisRecommendationBlueprint<Id extends string = string> {
  id: Id;
  label: string;
  reason: string;
  severity: DiagnosisRecommendationSeverity;
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
  matrixScore: number;
  trendWeight: number;
  priorityScore: number;
  command: string;
  canRun: boolean;
}

export function buildDiagnosisRecommendationBlueprint<Id extends string = string>(
  input: DiagnosisRecommendationBlueprintInput<Id>,
): DiagnosisRecommendationBlueprint<Id> {
  const normalizedCommand = input.command.trim();
  const canRun = typeof input.canRun === "boolean" ? input.canRun : normalizedCommand.length > 0;
  const score = deriveDiagnosisRecommendationScore({
    severity: input.severity,
    reversibility: input.reversibility,
    blastRadius: input.blastRadius,
    trendWeight: input.trendWeight,
  });
  return {
    id: input.id,
    label: input.label,
    reason: input.reason,
    severity: input.severity,
    reversibility: input.reversibility,
    blastRadius: input.blastRadius,
    matrixScore: score.matrixScore,
    trendWeight: input.trendWeight,
    priorityScore: score.priorityScore,
    command: input.command,
    canRun,
  };
}

export interface DiagnosisTrendHistoryEntry {
  kind: string;
  status: string;
  command: string;
  at: number;
}

export function extractDiagnosisCommandTool(command: string): string | null {
  const matched = command.match(/\btool=([^\s]+)/);
  return matched?.[1] ?? null;
}

export function deriveDiagnosisTrendWeight(options: {
  history: readonly DiagnosisTrendHistoryEntry[];
  kind: string;
  command: string;
  failedStatuses: ReadonlySet<string>;
  maxWindow?: number;
}): number {
  const normalizedCommand = options.command.trim();
  if (!normalizedCommand) {
    return 0;
  }
  const tool = extractDiagnosisCommandTool(normalizedCommand);
  const maxWindow = Math.max(2, options.maxWindow ?? 3);
  const related = options.history
    .filter((item) => {
      if (item.kind !== options.kind) return false;
      if (!tool) return true;
      return extractDiagnosisCommandTool(item.command) === tool;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, maxWindow);
  if (related.length < 2) {
    return 0;
  }
  const latest = related[0];
  const previous = related[1];
  const latestFailed = options.failedStatuses.has(latest.status);
  const previousFailed = options.failedStatuses.has(previous.status);
  if (latestFailed && previousFailed) return 2;
  if (!latestFailed && previousFailed) return -1;
  if (latestFailed && !previousFailed) return 1;
  return 0;
}

export function shouldRecommendQueueDiagnosisByPressure(pressure: TraceQueuePressure): boolean {
  return pressure === "busy" || pressure === "congested" || pressure === "saturated";
}

export function deriveQueueDiagnosisRecommendationSeverity(
  pressure: TraceQueuePressure,
): DiagnosisRecommendationSeverity {
  if (pressure === "busy") {
    return "medium";
  }
  return "high";
}

export function deriveHotspotDiagnosisRecommendationSeverity(options: {
  errors: number;
  denied: number;
}): DiagnosisRecommendationSeverity {
  return options.errors > 0 || options.denied > 0 ? "high" : "medium";
}

export function deriveFallbackDiagnosisRecommendationSeverity(options: {
  suppressionRatioPct: number;
  thresholdPct?: number;
}): DiagnosisRecommendationSeverity {
  const thresholdPct = Math.max(0, options.thresholdPct ?? 50);
  return options.suppressionRatioPct >= thresholdPct ? "high" : "medium";
}

export function deriveReplayFailedRecommendationRiskProfile(options: {
  kind: string;
  dominantReversibility: DiagnosisRecommendationReversibilityLevel;
  dominantBlastRadius: DiagnosisRecommendationBlastRadiusLevel;
}): {
  reversibility: DiagnosisRecommendationReversibilityLevel;
  blastRadius: DiagnosisRecommendationBlastRadiusLevel;
} {
  if (options.kind === "summary") {
    return {
      reversibility: "reversible",
      blastRadius: "local",
    };
  }
  return {
    reversibility: options.dominantReversibility,
    blastRadius: options.dominantBlastRadius,
  };
}

export function deriveRecoverRecommendationTrendWeight(options: {
  recommendation: RecoverDoctorRecommendation;
  queueInvestigateTrendWeight: number;
  recoverFailureTotal: number;
  recoverHasFailureSignals: boolean;
}): number {
  if (options.recommendation === "queueHeal") {
    return 1;
  }
  if (options.recommendation === "queueInvestigate") {
    return options.queueInvestigateTrendWeight;
  }
  if (options.recommendation === "recoverExecuteStrict") {
    if (options.recoverFailureTotal > 0) {
      return Math.min(2, Math.max(1, options.recoverFailureTotal));
    }
    return 1;
  }
  if (options.recommendation === "recoverInvestigate") {
    return Math.min(2, options.recoverFailureTotal);
  }
  if (options.recoverHasFailureSignals) {
    return Math.min(2, Math.ceil(options.recoverFailureTotal / 2));
  }
  return 0;
}
