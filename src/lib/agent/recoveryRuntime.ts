import type { QueryStreamEvent } from "./query/events";

export type TraceQueuePressure = "idle" | "busy" | "congested" | "saturated";
export type RecoverStateKind = "none" | "awaiting_assistant" | "assistant_incomplete";
export type RecoverPlanKind = "none" | "queued_recovery" | "resume_now" | "heal_then_resume";

export interface RecoverStateSnapshot {
  kind: RecoverStateKind;
  lastMessageId?: string;
}

export interface RecoverPlanSnapshot<TQueuedRecovery = unknown> {
  kind: RecoverPlanKind;
  queuedRecovery: TQueuedRecovery | null;
  queueCount: number;
  queueLimit: number;
  pressure: TraceQueuePressure;
}

export interface RecoverFailureCountersSnapshot {
  query_end_aborted: number;
  query_end_error: number;
  query_end_max_iterations: number;
  query_end_stop_hook_prevented: number;
  lifecycle_failed: number;
  lifecycle_aborted: number;
}

export interface RecoverEventSignalsSnapshot {
  failure: RecoverFailureCountersSnapshot;
  failureTotal: number;
  queueRejectedCount: number;
  queueDeduplicatedCount: number;
}

export interface RecoverRuntimeSnapshot<TQueuedRecovery = unknown> {
  state: RecoverStateSnapshot;
  plan: RecoverPlanSnapshot<TQueuedRecovery>;
  signals: RecoverEventSignalsSnapshot;
}

export const RECOVER_CONTINUE_PROMPT_LOCALES = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
  "ru-RU",
] as const;

interface RecoverMessageLike {
  id?: string;
  role?: "user" | "assistant" | string;
  status?: "pending" | "running" | "completed" | "aborted" | "failed" | string;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function normalizeRecoverContinuePromptFingerprint(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u3002\uFF01\uFF1F\uFF0C\uFF1B\uFF1A.,!?:;]+$/g, "");
}

export function buildRecoverContinuePromptFingerprintSet(
  prompts: readonly string[],
): ReadonlySet<string> {
  const next = new Set<string>();
  for (const prompt of prompts) {
    const fingerprint = normalizeRecoverContinuePromptFingerprint(prompt);
    if (fingerprint.length > 0) {
      next.add(fingerprint);
    }
  }
  return next;
}

export function getQueuedRecoveryItemFromQueue<T extends { query: string }>(
  queuedQueries: readonly T[],
  matcher: (query: string) => boolean,
): T | null {
  for (const item of queuedQueries) {
    if (matcher(item.query)) {
      return item;
    }
  }
  return null;
}

export function detectRecoverStateFromMessages(
  messages: readonly RecoverMessageLike[],
): RecoverStateSnapshot {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { kind: "none" };
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) {
      continue;
    }
    if (message.role === "assistant") {
      if (message.status === "pending" || message.status === "running") {
        return { kind: "assistant_incomplete", lastMessageId: message.id };
      }
      return { kind: "none" };
    }
    return { kind: "awaiting_assistant", lastMessageId: message.id };
  }
  return { kind: "none" };
}

export function buildRecoverStateSignature(state: RecoverStateSnapshot): string {
  if (state.kind === "none") {
    return "none";
  }
  return `${state.kind}:${state.lastMessageId ?? "unknown"}`;
}

export function deriveQueuePressure(depth: number, queueLimit: number): TraceQueuePressure {
  const normalizedDepth = normalizeCount(depth);
  const normalizedQueueLimit = normalizeCount(queueLimit);
  if (normalizedDepth <= 0) {
    return "idle";
  }
  if (normalizedQueueLimit > 0) {
    const ratio = normalizedDepth / normalizedQueueLimit;
    if (ratio >= 1) {
      return "saturated";
    }
    if (ratio >= 0.75) {
      return "congested";
    }
    return "busy";
  }
  if (normalizedDepth >= 8) {
    return "saturated";
  }
  if (normalizedDepth >= 4) {
    return "congested";
  }
  return "busy";
}

export function buildRecoverFailureCountersFromEvents(
  events: readonly QueryStreamEvent[],
): RecoverFailureCountersSnapshot {
  const stats: RecoverFailureCountersSnapshot = {
    query_end_aborted: 0,
    query_end_error: 0,
    query_end_max_iterations: 0,
    query_end_stop_hook_prevented: 0,
    lifecycle_failed: 0,
    lifecycle_aborted: 0,
  };
  for (const event of events) {
    if (event.type === "query_end") {
      if (event.terminalReason === "aborted") {
        stats.query_end_aborted += 1;
      } else if (event.terminalReason === "error") {
        stats.query_end_error += 1;
      } else if (event.terminalReason === "max_iterations") {
        stats.query_end_max_iterations += 1;
      } else if (event.terminalReason === "stop_hook_prevented") {
        stats.query_end_stop_hook_prevented += 1;
      }
      continue;
    }
    if (event.type === "command_lifecycle") {
      if (event.state === "failed") {
        stats.lifecycle_failed += 1;
      } else if (event.state === "aborted") {
        stats.lifecycle_aborted += 1;
      }
    }
  }
  return stats;
}

export function countRecoverQueueRejectedEvents(events: readonly QueryStreamEvent[]): number {
  let rejected = 0;
  for (const event of events) {
    if (event.type === "queue_update" && event.action === "rejected") {
      rejected += 1;
    }
  }
  return rejected;
}

export function countRecoverQueueDeduplicatedEvents(events: readonly QueryStreamEvent[]): number {
  let deduplicated = 0;
  for (const event of events) {
    if (event.type === "queue_update" && event.reason === "deduplicated") {
      deduplicated += 1;
    }
  }
  return deduplicated;
}

export function sumRecoverFailureCounters(counters: RecoverFailureCountersSnapshot): number {
  return (
    counters.query_end_aborted +
    counters.query_end_error +
    counters.query_end_max_iterations +
    counters.query_end_stop_hook_prevented +
    counters.lifecycle_failed +
    counters.lifecycle_aborted
  );
}

export function buildRecoverEventSignalsSnapshot(
  events: readonly QueryStreamEvent[],
): RecoverEventSignalsSnapshot {
  const failure = buildRecoverFailureCountersFromEvents(events);
  return {
    failure,
    failureTotal: sumRecoverFailureCounters(failure),
    queueRejectedCount: countRecoverQueueRejectedEvents(events),
    queueDeduplicatedCount: countRecoverQueueDeduplicatedEvents(events),
  };
}

export function deriveRecoverPlanSnapshotFromRuntime<TQueuedRecovery>(
  options: {
    state: RecoverStateSnapshot;
    queuedRecovery: TQueuedRecovery | null;
    queueCount: number;
    queueLimit: number;
  },
): RecoverPlanSnapshot<TQueuedRecovery> {
  const queueCount = normalizeCount(options.queueCount);
  const queueLimit = normalizeCount(options.queueLimit);
  const pressure = deriveQueuePressure(queueCount, queueLimit);
  const queuedRecovery = options.queuedRecovery;
  if (options.state.kind === "none") {
    return {
      kind: "none",
      queuedRecovery,
      queueCount,
      queueLimit,
      pressure,
    };
  }
  if (queuedRecovery) {
    return {
      kind: "queued_recovery",
      queuedRecovery,
      queueCount,
      queueLimit,
      pressure,
    };
  }
  if (pressure === "congested" || pressure === "saturated") {
    return {
      kind: "heal_then_resume",
      queuedRecovery: null,
      queueCount,
      queueLimit,
      pressure,
    };
  }
  return {
    kind: "resume_now",
    queuedRecovery: null,
    queueCount,
    queueLimit,
    pressure,
  };
}

export function buildRecoverRuntimeSnapshot<TQueuedRecovery extends { query: string }>(
  options: {
    messages: readonly RecoverMessageLike[];
    queuedQueries: readonly TQueuedRecovery[];
    queueCount: number;
    queueLimit: number;
    queuedRecoveryMatcher: (query: string) => boolean;
    events?: readonly QueryStreamEvent[];
  },
): RecoverRuntimeSnapshot<TQueuedRecovery> {
  const state = detectRecoverStateFromMessages(options.messages);
  const queuedRecovery = getQueuedRecoveryItemFromQueue(options.queuedQueries, options.queuedRecoveryMatcher);
  const plan = deriveRecoverPlanSnapshotFromRuntime({
    state,
    queuedRecovery,
    queueCount: options.queueCount,
    queueLimit: options.queueLimit,
  });
  const signals = buildRecoverEventSignalsSnapshot(options.events ?? []);
  return {
    state,
    plan,
    signals,
  };
}
