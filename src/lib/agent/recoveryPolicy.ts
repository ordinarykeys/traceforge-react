export type RecoverStateKind = "none" | "awaiting_assistant" | "assistant_incomplete";

export interface RecoverActionDecisionInput {
  stateKind: RecoverStateKind;
  queueCount: number;
  queueLimit: number;
  queueDeduplicatedCount: number;
  queueRejectedCount: number;
  failureTotal: number;
}

export interface RecoverActionDecision {
  hasInterruption: boolean;
  hasFailureSignals: boolean;
  shouldRelieveQueueWithHeal: boolean;
  shouldRecommendStrict: boolean;
  shouldUseQueueAwareAutoRecover: boolean;
  shouldOfferInvestigate: boolean;
}

export type RecoverRunbookStep =
  | "plan"
  | "heal"
  | "auto"
  | "resume"
  | "strict"
  | "investigate";

export type RecoverDoctorRecommendation =
  | "queueHeal"
  | "queueInvestigate"
  | "recoverAuto"
  | "recoverPlan"
  | "resumeInterruptedTurn"
  | "recoverExecuteStrict"
  | "recoverInvestigate";

export type RecoverQuickCommandKind = "investigate" | "queue_diagnostics";

export type RecoverDoctorRecommendationTextKey =
  | "agent.command.doctor.recommend.queueHeal"
  | "agent.command.doctor.recommend.queueInvestigate"
  | "agent.command.doctor.recommend.recoverAuto"
  | "agent.command.doctor.recommend.recoverPlan"
  | "agent.command.doctor.recommend.resumeInterruptedTurn"
  | "agent.command.doctor.recommend.recoverExecuteStrict"
  | "agent.command.doctor.recommend.recoverInvestigate";

export type RecoverDoctorRecommendationUiLabelKey =
  | "agent.diff.diagnosisQueueHealRun"
  | "agent.diff.diagnosisQueueInvestigateRun"
  | "agent.diff.diagnosisRecoverAutoRun"
  | "agent.diff.diagnosisRecoverPlanRun"
  | "agent.diff.diagnosisRecoverResumeRun"
  | "agent.diff.diagnosisRecoverExecuteStrictRun"
  | "agent.diff.diagnosisRecoverInvestigateRun";

export type RecoverDoctorRecommendationUiReasonKey =
  | "agent.diff.diagnosisRecommendationQueueHealReason"
  | "agent.diff.diagnosisRecommendationQueueInvestigateReason"
  | "agent.diff.diagnosisRecommendationRecoverReason"
  | "agent.diff.diagnosisRecommendationRecoverPlanReason"
  | "agent.diff.diagnosisRecommendationRecoverExecuteStrictReason"
  | "agent.diff.diagnosisRecommendationRecoverInvestigateReason";

export interface RecoverDoctorRecommendationDescriptor {
  recommendation: RecoverDoctorRecommendation;
  doctorTextKey: RecoverDoctorRecommendationTextKey;
  uiLabelKey: RecoverDoctorRecommendationUiLabelKey;
  uiReasonKey: RecoverDoctorRecommendationUiReasonKey;
  command: string;
  quickKind: RecoverQuickCommandKind;
}

export type RecoverRecommendationSeverity = "high" | "medium" | "low";

export interface RecoverRecommendationSeverityInput {
  shouldRelieveQueueWithHeal: boolean;
  hasFailureSignals: boolean;
  failureTotal: number;
}

export interface RecoverDoctorRecommendationPresentation {
  recommendation: RecoverDoctorRecommendation;
  descriptor: RecoverDoctorRecommendationDescriptor;
  resolvedCommand: string;
  severity: RecoverRecommendationSeverity;
}

export interface RecoverRecommendationPresentationInput
  extends RecoverRecommendationSeverityInput {
  queueInvestigateCommand?: string | null;
}

export type RecoverRunbookStepTextKey =
  | "agent.command.doctor.recoveryLadderPlan"
  | "agent.command.doctor.recoveryLadderHeal"
  | "agent.command.doctor.recoveryLadderAuto"
  | "agent.command.doctor.recoveryLadderResume"
  | "agent.command.doctor.recoveryLadderStrict"
  | "agent.command.doctor.recoveryLadderInvestigate";

export type RecoverRunbookStepUiLabelKey =
  | "agent.diff.diagnosisRecoverPlanRun"
  | "agent.diff.diagnosisQueueHealRun"
  | "agent.diff.diagnosisRecoverAutoRun"
  | "agent.diff.diagnosisRecoverResumeRun"
  | "agent.diff.diagnosisRecoverExecuteStrictRun"
  | "agent.diff.diagnosisRecoverInvestigateRun";

export interface RecoverRunbookStepDescriptor {
  step: RecoverRunbookStep;
  doctorTextKey: RecoverRunbookStepTextKey;
  uiLabelKey: RecoverRunbookStepUiLabelKey;
  command: string;
  quickKind: RecoverQuickCommandKind;
}

export interface RecoverRunbookBlueprint {
  steps: RecoverRunbookStep[];
  recommendations: RecoverDoctorRecommendation[];
}

const RECOVER_DOCTOR_RECOMMENDATION_DESCRIPTOR_BY_ID: Record<
  RecoverDoctorRecommendation,
  RecoverDoctorRecommendationDescriptor
> = {
  queueHeal: {
    recommendation: "queueHeal",
    doctorTextKey: "agent.command.doctor.recommend.queueHeal",
    uiLabelKey: "agent.diff.diagnosisQueueHealRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationQueueHealReason",
    command: "/queue heal",
    quickKind: "queue_diagnostics",
  },
  queueInvestigate: {
    recommendation: "queueInvestigate",
    doctorTextKey: "agent.command.doctor.recommend.queueInvestigate",
    uiLabelKey: "agent.diff.diagnosisQueueInvestigateRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationQueueInvestigateReason",
    command: "/doctor queue investigate",
    quickKind: "queue_diagnostics",
  },
  recoverAuto: {
    recommendation: "recoverAuto",
    doctorTextKey: "agent.command.doctor.recommend.recoverAuto",
    uiLabelKey: "agent.diff.diagnosisRecoverAutoRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationRecoverReason",
    command: "/recover auto",
    quickKind: "investigate",
  },
  recoverPlan: {
    recommendation: "recoverPlan",
    doctorTextKey: "agent.command.doctor.recommend.recoverPlan",
    uiLabelKey: "agent.diff.diagnosisRecoverPlanRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationRecoverPlanReason",
    command: "/recover plan",
    quickKind: "investigate",
  },
  resumeInterruptedTurn: {
    recommendation: "resumeInterruptedTurn",
    doctorTextKey: "agent.command.doctor.recommend.resumeInterruptedTurn",
    uiLabelKey: "agent.diff.diagnosisRecoverResumeRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationRecoverReason",
    command: "/recover resume",
    quickKind: "investigate",
  },
  recoverExecuteStrict: {
    recommendation: "recoverExecuteStrict",
    doctorTextKey: "agent.command.doctor.recommend.recoverExecuteStrict",
    uiLabelKey: "agent.diff.diagnosisRecoverExecuteStrictRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationRecoverExecuteStrictReason",
    command: "/recover execute --strict",
    quickKind: "investigate",
  },
  recoverInvestigate: {
    recommendation: "recoverInvestigate",
    doctorTextKey: "agent.command.doctor.recommend.recoverInvestigate",
    uiLabelKey: "agent.diff.diagnosisRecoverInvestigateRun",
    uiReasonKey: "agent.diff.diagnosisRecommendationRecoverInvestigateReason",
    command: "/doctor recover investigate",
    quickKind: "investigate",
  },
};

const RECOVER_RUNBOOK_STEP_DESCRIPTOR_BY_ID: Record<RecoverRunbookStep, RecoverRunbookStepDescriptor> = {
  plan: {
    step: "plan",
    doctorTextKey: "agent.command.doctor.recoveryLadderPlan",
    uiLabelKey: "agent.diff.diagnosisRecoverPlanRun",
    command: "/recover plan",
    quickKind: "investigate",
  },
  heal: {
    step: "heal",
    doctorTextKey: "agent.command.doctor.recoveryLadderHeal",
    uiLabelKey: "agent.diff.diagnosisQueueHealRun",
    command: "/queue heal",
    quickKind: "queue_diagnostics",
  },
  auto: {
    step: "auto",
    doctorTextKey: "agent.command.doctor.recoveryLadderAuto",
    uiLabelKey: "agent.diff.diagnosisRecoverAutoRun",
    command: "/recover auto",
    quickKind: "investigate",
  },
  resume: {
    step: "resume",
    doctorTextKey: "agent.command.doctor.recoveryLadderResume",
    uiLabelKey: "agent.diff.diagnosisRecoverResumeRun",
    command: "/recover resume",
    quickKind: "investigate",
  },
  strict: {
    step: "strict",
    doctorTextKey: "agent.command.doctor.recoveryLadderStrict",
    uiLabelKey: "agent.diff.diagnosisRecoverExecuteStrictRun",
    command: "/recover execute --strict",
    quickKind: "investigate",
  },
  investigate: {
    step: "investigate",
    doctorTextKey: "agent.command.doctor.recoveryLadderInvestigate",
    uiLabelKey: "agent.diff.diagnosisRecoverInvestigateRun",
    command: "/doctor recover investigate",
    quickKind: "investigate",
  },
};

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveRecoverActionDecision(
  input: RecoverActionDecisionInput,
): RecoverActionDecision {
  const queueCount = normalizeCount(input.queueCount);
  const queueLimit = normalizeCount(input.queueLimit);
  const queueDeduplicatedCount = normalizeCount(input.queueDeduplicatedCount);
  const queueRejectedCount = normalizeCount(input.queueRejectedCount);
  const failureTotal = normalizeCount(input.failureTotal);

  const hasInterruption = input.stateKind !== "none";
  const hasFailureSignals = failureTotal > 0;
  const shouldRelieveQueueWithHeal =
    (queueLimit > 0 && queueCount >= Math.ceil(Math.max(1, queueLimit) * 0.75)) ||
    queueDeduplicatedCount >= 3;
  const shouldRecommendStrict =
    hasInterruption && (hasFailureSignals || shouldRelieveQueueWithHeal || queueRejectedCount > 0);
  const shouldUseQueueAwareAutoRecover = shouldRelieveQueueWithHeal;
  const shouldOfferInvestigate = hasInterruption || hasFailureSignals;

  return {
    hasInterruption,
    hasFailureSignals,
    shouldRelieveQueueWithHeal,
    shouldRecommendStrict,
    shouldUseQueueAwareAutoRecover,
    shouldOfferInvestigate,
  };
}

export function deriveRecoverRunbookBlueprint(
  stateKind: RecoverStateKind,
  decision: RecoverActionDecision,
): RecoverRunbookBlueprint {
  const steps: RecoverRunbookStep[] = [];
  const recommendations: RecoverDoctorRecommendation[] = [];

  if (decision.shouldRelieveQueueWithHeal) {
    recommendations.push("queueHeal", "queueInvestigate");
  }

  if (stateKind === "none") {
    if (decision.hasFailureSignals) {
      recommendations.push("recoverInvestigate");
    }
    return { steps, recommendations };
  }

  steps.push("plan");
  if (decision.shouldRelieveQueueWithHeal) {
    steps.push("heal", "auto");
    recommendations.push("recoverAuto");
  } else {
    steps.push("resume");
  }

  if (decision.shouldRecommendStrict) {
    steps.push("strict");
    recommendations.push("recoverExecuteStrict");
  }

  steps.push("investigate");
  recommendations.push("recoverPlan", "resumeInterruptedTurn", "recoverInvestigate");
  return { steps, recommendations };
}

export function getRecoverDoctorRecommendationDescriptor(
  recommendation: RecoverDoctorRecommendation,
): RecoverDoctorRecommendationDescriptor {
  return RECOVER_DOCTOR_RECOMMENDATION_DESCRIPTOR_BY_ID[recommendation];
}

export function getRecoverRunbookStepDescriptor(step: RecoverRunbookStep): RecoverRunbookStepDescriptor {
  return RECOVER_RUNBOOK_STEP_DESCRIPTOR_BY_ID[step];
}

export function getRecoverRecommendationSeverity(
  recommendation: RecoverDoctorRecommendation,
  input: RecoverRecommendationSeverityInput,
): RecoverRecommendationSeverity {
  const failureTotal = normalizeCount(input.failureTotal);
  if (recommendation === "queueHeal") {
    return "high";
  }
  if (recommendation === "recoverExecuteStrict") {
    return input.shouldRelieveQueueWithHeal || failureTotal >= 2 ? "high" : "medium";
  }
  if (recommendation === "queueInvestigate" || recommendation === "recoverAuto") {
    return input.shouldRelieveQueueWithHeal ? "high" : "medium";
  }
  if (recommendation === "recoverPlan" || recommendation === "resumeInterruptedTurn") {
    return input.shouldRelieveQueueWithHeal ? "medium" : "low";
  }
  return failureTotal >= 2 ? "high" : input.hasFailureSignals ? "medium" : "low";
}

export function deriveRecoverDoctorRecommendationPresentations(
  recommendations: readonly RecoverDoctorRecommendation[],
  input: RecoverRecommendationPresentationInput,
): RecoverDoctorRecommendationPresentation[] {
  const seen = new Set<RecoverDoctorRecommendation>();
  const queueInvestigateCommand =
    typeof input.queueInvestigateCommand === "string"
      ? input.queueInvestigateCommand.trim()
      : "";
  const rows: RecoverDoctorRecommendationPresentation[] = [];
  for (const recommendation of recommendations) {
    if (seen.has(recommendation)) {
      continue;
    }
    seen.add(recommendation);
    const descriptor = getRecoverDoctorRecommendationDescriptor(recommendation);
    const resolvedCommand =
      recommendation === "queueInvestigate" && queueInvestigateCommand.length > 0
        ? queueInvestigateCommand
        : descriptor.command;
    rows.push({
      recommendation,
      descriptor,
      resolvedCommand,
      severity: getRecoverRecommendationSeverity(recommendation, input),
    });
  }
  return rows;
}
