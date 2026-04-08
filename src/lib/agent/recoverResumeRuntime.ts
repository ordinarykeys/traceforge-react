import type { QueuePriority } from "./QueryEngine";
import type { RecoverPlanKind } from "./recoveryRuntime";
import { getQueuePriorityRank } from "./queueMaintenanceRuntime";

export type RecoverResumePolicyLineKey =
  | "agent.command.recover.resumeAutoPolicyNext"
  | "agent.command.recover.resumeAutoPolicyNow"
  | null;

export type RecoverResumeLineKey =
  | "agent.command.recover.noInterruption"
  | "agent.command.recover.resumeAutoPolicyNext"
  | "agent.command.recover.resumeAutoPolicyNow"
  | "agent.command.recover.resumeAlreadyQueued"
  | "agent.command.recover.resumeAlreadyQueuedPromoted"
  | "agent.command.recover.resumeAlreadyQueuedHint"
  | "agent.command.recover.resumeQueueFull"
  | "agent.command.recover.resumeQueueFullAfterPrune"
  | "agent.command.recover.resumeQueueFullHintHeal"
  | "agent.command.recover.resumeQueueFullHintInvestigate"
  | "agent.command.recover.resumeFailed"
  | "agent.command.recover.resumeFailedHintInvestigate"
  | "agent.command.recover.resumeStarted"
  | "agent.command.recover.resumePrunedStale"
  | "agent.command.recover.resumeNextStep"
  | "agent.command.recover.resumeQueued"
  | "agent.command.recover.resumeQueuedId";

export interface RecoverResumeLineDescriptor {
  key: RecoverResumeLineKey;
  vars?: Record<string, string | number>;
}

export interface RecoverResumePolicySnapshot {
  preferredPriority: QueuePriority;
  policyLineKey: RecoverResumePolicyLineKey;
}

function appendPolicyLine(
  lines: RecoverResumeLineDescriptor[],
  policyLineKey: RecoverResumePolicyLineKey,
): void {
  if (!policyLineKey) {
    return;
  }
  lines.push({
    key: policyLineKey,
  });
}

export function deriveRecoverResumePolicy(options: {
  autoMode: boolean;
  recoverPlanKind: RecoverPlanKind;
}): RecoverResumePolicySnapshot {
  const preferredPriority: QueuePriority =
    options.autoMode && options.recoverPlanKind === "heal_then_resume" ? "next" : "now";
  const policyLineKey: RecoverResumePolicyLineKey = options.autoMode
    ? preferredPriority === "next"
      ? "agent.command.recover.resumeAutoPolicyNext"
      : "agent.command.recover.resumeAutoPolicyNow"
    : null;
  return {
    preferredPriority,
    policyLineKey,
  };
}

export function shouldPromoteRecoverQueuedPriority(options: {
  queuedPriority: QueuePriority;
  preferredPriority: QueuePriority;
}): boolean {
  return getQueuePriorityRank(options.queuedPriority) > getQueuePriorityRank(options.preferredPriority);
}

export function buildRecoverResumeNoInterruptionLineDescriptors(): RecoverResumeLineDescriptor[] {
  return [
    {
      key: "agent.command.recover.noInterruption",
    },
  ];
}

export function buildRecoverResumeQueuedReuseLineDescriptors(options: {
  policyLineKey: RecoverResumePolicyLineKey;
  queuedRecoveryId: string;
  queueLabel: string;
  limitLabel: string;
  promoted: boolean;
}): RecoverResumeLineDescriptor[] {
  const lines: RecoverResumeLineDescriptor[] = [];
  appendPolicyLine(lines, options.policyLineKey);
  lines.push({
    key: "agent.command.recover.resumeAlreadyQueued",
    vars: {
      id: options.queuedRecoveryId,
      queue: options.queueLabel,
      limit: options.limitLabel,
    },
  });
  if (options.promoted) {
    lines.push({
      key: "agent.command.recover.resumeAlreadyQueuedPromoted",
      vars: {
        id: options.queuedRecoveryId,
      },
    });
  }
  lines.push({
    key: "agent.command.recover.resumeAlreadyQueuedHint",
  });
  return lines;
}

export function buildRecoverResumeQueueFullLineDescriptors(options: {
  policyLineKey: RecoverResumePolicyLineKey;
  queueCount: number;
  queueLimit: number;
  staleRemoved: number;
  staleMinutes: number;
}): RecoverResumeLineDescriptor[] {
  const lines: RecoverResumeLineDescriptor[] = [];
  appendPolicyLine(lines, options.policyLineKey);
  lines.push({
    key: "agent.command.recover.resumeQueueFull",
    vars: {
      queue: options.queueCount,
      limit: options.queueLimit,
    },
  });
  if (options.staleRemoved > 0) {
    lines.push({
      key: "agent.command.recover.resumeQueueFullAfterPrune",
      vars: {
        count: options.staleRemoved,
        minutes: options.staleMinutes,
      },
    });
  }
  lines.push({
    key: "agent.command.recover.resumeQueueFullHintHeal",
  });
  lines.push({
    key: "agent.command.recover.resumeQueueFullHintInvestigate",
  });
  return lines;
}

export function buildRecoverResumeFailedLineDescriptors(options: {
  policyLineKey: RecoverResumePolicyLineKey;
}): RecoverResumeLineDescriptor[] {
  const lines: RecoverResumeLineDescriptor[] = [];
  appendPolicyLine(lines, options.policyLineKey);
  lines.push({
    key: "agent.command.recover.resumeFailed",
  });
  lines.push({
    key: "agent.command.recover.resumeFailedHintInvestigate",
  });
  return lines;
}

export function buildRecoverResumeStartedLineDescriptors(options: {
  policyLineKey: RecoverResumePolicyLineKey;
  staleRemoved: number;
  staleMinutes: number;
}): RecoverResumeLineDescriptor[] {
  const lines: RecoverResumeLineDescriptor[] = [];
  appendPolicyLine(lines, options.policyLineKey);
  lines.push({
    key: "agent.command.recover.resumeStarted",
  });
  if (options.staleRemoved > 0) {
    lines.push({
      key: "agent.command.recover.resumePrunedStale",
      vars: {
        count: options.staleRemoved,
        minutes: options.staleMinutes,
      },
    });
  }
  lines.push({
    key: "agent.command.recover.resumeNextStep",
  });
  return lines;
}

export function buildRecoverResumeQueuedLineDescriptors(options: {
  policyLineKey: RecoverResumePolicyLineKey;
  queueCount: number;
  queueLimit: number;
  queuedId?: string;
  staleRemoved: number;
  staleMinutes: number;
}): RecoverResumeLineDescriptor[] {
  const lines: RecoverResumeLineDescriptor[] = [];
  appendPolicyLine(lines, options.policyLineKey);
  lines.push({
    key: "agent.command.recover.resumeQueued",
    vars: {
      queue: options.queueCount,
      limit: options.queueLimit,
    },
  });
  if (options.queuedId) {
    lines.push({
      key: "agent.command.recover.resumeQueuedId",
      vars: {
        id: options.queuedId,
      },
    });
  }
  if (options.staleRemoved > 0) {
    lines.push({
      key: "agent.command.recover.resumePrunedStale",
      vars: {
        count: options.staleRemoved,
        minutes: options.staleMinutes,
      },
    });
  }
  lines.push({
    key: "agent.command.recover.resumeNextStep",
  });
  return lines;
}
