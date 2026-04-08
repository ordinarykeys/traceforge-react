import {
  deriveRecoverActionDecision,
  deriveRecoverRunbookBlueprint,
  getRecoverRunbookStepDescriptor,
  type RecoverActionDecision,
  type RecoverDoctorRecommendation,
  type RecoverRunbookBlueprint,
  type RecoverRunbookStepTextKey,
  type RecoverStateKind,
} from "./recoveryPolicy";

export type DoctorRecoveryLineFormat = "doctor" | "plain";

export type DoctorRecoveryLineKey =
  | "agent.command.doctor.recoveryHealthy"
  | "agent.command.doctor.recoveryInterrupted"
  | "agent.command.doctor.recoveryLadderTitle"
  | RecoverRunbookStepTextKey;

export interface DoctorRecoveryLineDescriptor {
  format: DoctorRecoveryLineFormat;
  key: DoctorRecoveryLineKey;
  level?: "ok" | "warn" | "fail";
  vars?: Record<string, string>;
}

export interface DoctorRecoverySectionRuntimeInput {
  stateKind: RecoverStateKind;
  stateLastMessageId?: string | null;
  interruptionReasonLabel?: string | null;
  notSetLabel: string;
  queueCount: number;
  queueLimit: number;
  queueDeduplicatedCount: number;
  queueRejectedCount: number;
  failureTotal: number;
}

export interface DoctorRecoverySectionRuntimeOutput {
  lines: DoctorRecoveryLineDescriptor[];
  recommendations: RecoverDoctorRecommendation[];
  decision: RecoverActionDecision;
  runbook: RecoverRunbookBlueprint;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveDoctorRecoverySectionRuntime(
  input: DoctorRecoverySectionRuntimeInput,
): DoctorRecoverySectionRuntimeOutput {
  const decision = deriveRecoverActionDecision({
    stateKind: input.stateKind,
    queueCount: normalizeCount(input.queueCount),
    queueLimit: normalizeCount(input.queueLimit),
    queueDeduplicatedCount: normalizeCount(input.queueDeduplicatedCount),
    queueRejectedCount: normalizeCount(input.queueRejectedCount),
    failureTotal: normalizeCount(input.failureTotal),
  });
  const runbook = deriveRecoverRunbookBlueprint(input.stateKind, decision);
  const lines: DoctorRecoveryLineDescriptor[] = [];

  if (input.stateKind === "none") {
    lines.push({
      format: "doctor",
      level: "ok",
      key: "agent.command.doctor.recoveryHealthy",
    });
  } else {
    lines.push({
      format: "doctor",
      level: "warn",
      key: "agent.command.doctor.recoveryInterrupted",
      vars: {
        reason: input.interruptionReasonLabel ?? input.stateKind,
        id: input.stateLastMessageId ?? input.notSetLabel,
      },
    });
    lines.push({
      format: "plain",
      key: "agent.command.doctor.recoveryLadderTitle",
    });
    for (const step of runbook.steps) {
      lines.push({
        format: "plain",
        key: getRecoverRunbookStepDescriptor(step).doctorTextKey,
      });
    }
  }

  return {
    lines,
    recommendations: [...runbook.recommendations],
    decision,
    runbook,
  };
}
