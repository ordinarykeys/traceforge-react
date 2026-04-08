import type { AgentMessage, QueuedQueryItem } from "./QueryEngine";
import type { QueryStreamEvent } from "./query/events";
import {
  buildRecoverRuntimeSnapshot,
  type RecoverRuntimeSnapshot,
} from "./recoveryRuntime";

export interface BuildRecoverCommandRuntimeSnapshotInput {
  messages: readonly AgentMessage[];
  queuedQueries: readonly QueuedQueryItem[];
  queueLimit: number;
  queueCountOverride?: number;
  queueLimitOverride?: number;
  events?: readonly QueryStreamEvent[];
  queuedRecoveryMatcher: (query: string) => boolean;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function buildRecoverCommandRuntimeSnapshot(
  input: BuildRecoverCommandRuntimeSnapshotInput,
): RecoverRuntimeSnapshot<QueuedQueryItem> {
  const queueCount =
    typeof input.queueCountOverride === "number"
      ? normalizeCount(input.queueCountOverride)
      : normalizeCount(input.queuedQueries.length);
  const queueLimit =
    typeof input.queueLimitOverride === "number"
      ? normalizeCount(input.queueLimitOverride)
      : normalizeCount(input.queueLimit);

  return buildRecoverRuntimeSnapshot({
    messages: input.messages,
    queuedQueries: input.queuedQueries,
    queueCount,
    queueLimit,
    queuedRecoveryMatcher: input.queuedRecoveryMatcher,
    events: input.events ?? [],
  });
}
