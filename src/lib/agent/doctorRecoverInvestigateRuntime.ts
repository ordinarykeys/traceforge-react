import {
  deriveRecoverActionDecision,
  type RecoverStateKind,
} from "./recoveryPolicy";
import type { RecoverEventSignalsSnapshot } from "./recoveryRuntime";

export interface DoctorRecoverInvestigateStats {
  queryEndAborted: number;
  queryEndError: number;
  queryEndMaxIterations: number;
  queryEndStopHookPrevented: number;
  lifecycleFailed: number;
  lifecycleAborted: number;
  queueRejected: number;
}

export type DoctorRecoverInvestigateLineKey =
  | "agent.command.doctor.recoverInvestigateTitle"
  | "agent.command.doctor.recoverInvestigateScope"
  | "agent.command.doctor.recoverInvestigateAssessmentHigh"
  | "agent.command.doctor.recoverInvestigateAssessmentNormal"
  | "agent.command.doctor.recoverInvestigateDiagnosisHeader"
  | "agent.command.doctor.recoverInvestigateDiagnosisRecoverState"
  | "agent.command.doctor.recoverInvestigateDiagnosisTraceSummary"
  | "agent.command.doctor.recoverInvestigateFixHeader"
  | "agent.command.doctor.recoverInvestigateFixResume"
  | "agent.command.doctor.recoverInvestigateFixResumeIfNeeded"
  | "agent.command.doctor.recoverInvestigateFixQueueHeal"
  | "agent.command.doctor.recoverInvestigateFixQueueHealIfNeeded"
  | "agent.command.doctor.recoverInvestigateFixExecuteStrict"
  | "agent.command.doctor.recoverInvestigateFixExecuteStrictIfNeeded"
  | "agent.command.doctor.recoverInvestigateVerifyHeader"
  | "agent.command.doctor.recoverInvestigateVerifyRecoverStatus"
  | "agent.command.doctor.recoverInvestigateVerifyDoctor"
  | "agent.command.doctor.recoverInvestigateVerifyOutcome";

export interface DoctorRecoverInvestigateLineDescriptor {
  key: DoctorRecoverInvestigateLineKey;
  vars?: Record<string, string>;
}

export interface DoctorRecoverInvestigateRuntimeInput {
  stateKind: RecoverStateKind;
  stateLabel: string;
  messageIdLabel: string;
  queueCount: number;
  queueLimit: number;
  queueDeduplicatedCount: number;
  queueRejectedCount: number;
  failureTotal: number;
  pressureLabel: string;
  runningTaskCount: number;
  stats: DoctorRecoverInvestigateStats;
  formatNumber: (value: number) => string;
}

export interface DoctorRecoverInvestigateRuntimeOutput {
  assessmentKey:
    | "agent.command.doctor.recoverInvestigateAssessmentHigh"
    | "agent.command.doctor.recoverInvestigateAssessmentNormal";
  fixResumeKey:
    | "agent.command.doctor.recoverInvestigateFixResume"
    | "agent.command.doctor.recoverInvestigateFixResumeIfNeeded";
  fixQueueHealKey:
    | "agent.command.doctor.recoverInvestigateFixQueueHeal"
    | "agent.command.doctor.recoverInvestigateFixQueueHealIfNeeded";
  fixExecuteStrictKey:
    | "agent.command.doctor.recoverInvestigateFixExecuteStrict"
    | "agent.command.doctor.recoverInvestigateFixExecuteStrictIfNeeded";
  lines: DoctorRecoverInvestigateLineDescriptor[];
}

export function deriveDoctorRecoverInvestigateStats(
  signals: RecoverEventSignalsSnapshot,
): DoctorRecoverInvestigateStats {
  const counters = signals.failure;
  return {
    queryEndAborted: counters.query_end_aborted,
    queryEndError: counters.query_end_error,
    queryEndMaxIterations: counters.query_end_max_iterations,
    queryEndStopHookPrevented: counters.query_end_stop_hook_prevented,
    lifecycleFailed: counters.lifecycle_failed,
    lifecycleAborted: counters.lifecycle_aborted,
    queueRejected: signals.queueRejectedCount,
  };
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveDoctorRecoverInvestigateRuntime(
  input: DoctorRecoverInvestigateRuntimeInput,
): DoctorRecoverInvestigateRuntimeOutput {
  const queueCount = normalizeCount(input.queueCount);
  const queueLimit = normalizeCount(input.queueLimit);
  const queueRejectedCount = normalizeCount(input.queueRejectedCount);
  const queueDeduplicatedCount = normalizeCount(input.queueDeduplicatedCount);
  const failureTotal = normalizeCount(input.failureTotal);
  const runningTaskCount = normalizeCount(input.runningTaskCount);
  const stats = {
    queryEndAborted: normalizeCount(input.stats.queryEndAborted),
    queryEndError: normalizeCount(input.stats.queryEndError),
    queryEndMaxIterations: normalizeCount(input.stats.queryEndMaxIterations),
    queryEndStopHookPrevented: normalizeCount(input.stats.queryEndStopHookPrevented),
    lifecycleFailed: normalizeCount(input.stats.lifecycleFailed),
    lifecycleAborted: normalizeCount(input.stats.lifecycleAborted),
    queueRejected: normalizeCount(input.stats.queueRejected),
  };

  const decision = deriveRecoverActionDecision({
    stateKind: input.stateKind,
    queueCount,
    queueLimit,
    queueDeduplicatedCount,
    queueRejectedCount,
    failureTotal,
  });

  const assessmentKey =
    decision.hasInterruption || decision.hasFailureSignals || decision.shouldRelieveQueueWithHeal
      ? "agent.command.doctor.recoverInvestigateAssessmentHigh"
      : "agent.command.doctor.recoverInvestigateAssessmentNormal";

  const fixResumeKey =
    input.stateKind !== "none"
      ? "agent.command.doctor.recoverInvestigateFixResume"
      : "agent.command.doctor.recoverInvestigateFixResumeIfNeeded";
  const fixQueueHealKey = decision.shouldRelieveQueueWithHeal
    ? "agent.command.doctor.recoverInvestigateFixQueueHeal"
    : "agent.command.doctor.recoverInvestigateFixQueueHealIfNeeded";
  const fixExecuteStrictKey = decision.shouldRecommendStrict
    ? "agent.command.doctor.recoverInvestigateFixExecuteStrict"
    : "agent.command.doctor.recoverInvestigateFixExecuteStrictIfNeeded";

  return {
    assessmentKey,
    fixResumeKey,
    fixQueueHealKey,
    fixExecuteStrictKey,
    lines: [
      {
        key: "agent.command.doctor.recoverInvestigateTitle",
      },
      {
        key: "agent.command.doctor.recoverInvestigateScope",
        vars: {
          state: input.stateLabel,
          message: input.messageIdLabel,
          queue: input.formatNumber(queueCount),
          limit: input.formatNumber(queueLimit),
          pressure: input.pressureLabel,
          running: input.formatNumber(runningTaskCount),
          aborted: input.formatNumber(stats.queryEndAborted),
          error: input.formatNumber(stats.queryEndError),
          maxIterations: input.formatNumber(stats.queryEndMaxIterations),
          stopHook: input.formatNumber(stats.queryEndStopHookPrevented),
          lifecycleFailed: input.formatNumber(stats.lifecycleFailed),
          lifecycleAborted: input.formatNumber(stats.lifecycleAborted),
          rejected: input.formatNumber(stats.queueRejected),
        },
      },
      {
        key: assessmentKey,
      },
      {
        key: "agent.command.doctor.recoverInvestigateDiagnosisHeader",
      },
      {
        key: "agent.command.doctor.recoverInvestigateDiagnosisRecoverState",
      },
      {
        key: "agent.command.doctor.recoverInvestigateDiagnosisTraceSummary",
      },
      {
        key: "agent.command.doctor.recoverInvestigateFixHeader",
      },
      {
        key: fixResumeKey,
      },
      {
        key: fixQueueHealKey,
      },
      {
        key: fixExecuteStrictKey,
      },
      {
        key: "agent.command.doctor.recoverInvestigateVerifyHeader",
      },
      {
        key: "agent.command.doctor.recoverInvestigateVerifyRecoverStatus",
      },
      {
        key: "agent.command.doctor.recoverInvestigateVerifyDoctor",
      },
      {
        key: "agent.command.doctor.recoverInvestigateVerifyOutcome",
      },
    ],
  };
}
