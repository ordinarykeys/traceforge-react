import type { TraceQueuePressure } from "./recoveryRuntime";

export type DoctorQueueInvestigateLineKey =
  | "agent.command.doctor.queueInvestigateTitle"
  | "agent.command.doctor.queueInvestigateScope"
  | "agent.command.doctor.queueInvestigateAssessmentHigh"
  | "agent.command.doctor.queueInvestigateAssessmentNormal"
  | "agent.command.doctor.queueInvestigateDiagnosisHeader"
  | "agent.command.doctor.queueInvestigateDiagnosisQueueOps"
  | "agent.command.doctor.queueInvestigateDiagnosisTraceHotspots"
  | "agent.command.doctor.queueInvestigateFixHeader"
  | "agent.command.doctor.queueInvestigateFixHeal"
  | "agent.command.doctor.queueInvestigateFixHealIfNeeded"
  | "agent.command.doctor.queueInvestigateFixCompact"
  | "agent.command.doctor.queueInvestigateFixPriority"
  | "agent.command.doctor.queueInvestigateVerifyHeader"
  | "agent.command.doctor.queueInvestigateVerifyStatus"
  | "agent.command.doctor.queueInvestigateVerifyQueueOps"
  | "agent.command.doctor.queueInvestigateVerifyOutcome";

export interface DoctorQueueInvestigateLineDescriptor {
  key: DoctorQueueInvestigateLineKey;
  vars?: Record<string, string>;
}

interface DoctorQueueInvestigatePriorityLabelMap {
  now: string;
  next: string;
  later: string;
}

interface DoctorQueueInvestigatePressureLabelMap {
  idle: string;
  busy: string;
  congested: string;
  saturated: string;
}

interface DoctorQueueInvestigateFallbackMetrics {
  pressure: TraceQueuePressure;
  queueLimit: number;
  latestDepth: number;
  maxDepth: number;
  queuedCount: number;
  dequeuedCount: number;
  rejectedCount: number;
  deduplicatedCount: number;
  capacityRejections: number;
  staleRejections: number;
  manualRejections: number;
  dominantPriorityLabel: string;
}

export interface DoctorQueueInvestigateRuntimeInput {
  kv: Record<string, string>;
  fallback: DoctorQueueInvestigateFallbackMetrics;
  labels: {
    pressureById: DoctorQueueInvestigatePressureLabelMap;
    priorityById: DoctorQueueInvestigatePriorityLabelMap;
  };
  formatNumber: (value: number) => string;
}

export interface DoctorQueueInvestigateRuntimeOutput {
  pressure: TraceQueuePressure;
  assessmentKey:
    | "agent.command.doctor.queueInvestigateAssessmentHigh"
    | "agent.command.doctor.queueInvestigateAssessmentNormal";
  fixHealKey:
    | "agent.command.doctor.queueInvestigateFixHeal"
    | "agent.command.doctor.queueInvestigateFixHealIfNeeded";
  lines: DoctorQueueInvestigateLineDescriptor[];
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

function parseTraceQueuePressure(
  value: string | undefined,
  fallback: TraceQueuePressure,
): TraceQueuePressure {
  const normalized = (value ?? fallback).trim().toLowerCase();
  if (
    normalized === "idle" ||
    normalized === "busy" ||
    normalized === "congested" ||
    normalized === "saturated"
  ) {
    return normalized;
  }
  return "idle";
}

function parseDominantPriorityId(
  value: string | undefined,
): keyof DoctorQueueInvestigatePriorityLabelMap | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "now" || normalized === "next" || normalized === "later") {
    return normalized;
  }
  return null;
}

export function deriveDoctorQueueInvestigateRuntime(
  input: DoctorQueueInvestigateRuntimeInput,
): DoctorQueueInvestigateRuntimeOutput {
  const pressure = parseTraceQueuePressure(input.kv.pressure, input.fallback.pressure);
  const queueLimit = parseNonNegativeNumber(input.kv.queue_limit, input.fallback.queueLimit);
  const latestDepth = parseNonNegativeNumber(input.kv.latest_depth, input.fallback.latestDepth);
  const maxDepth = parseNonNegativeNumber(
    input.kv.max_depth,
    Math.max(input.fallback.maxDepth, latestDepth),
  );
  const queuedCount = parseNonNegativeNumber(input.kv.queued_count, input.fallback.queuedCount);
  const dequeuedCount = parseNonNegativeNumber(input.kv.dequeued_count, input.fallback.dequeuedCount);
  const rejectedCount = parseNonNegativeNumber(input.kv.rejected_count, input.fallback.rejectedCount);
  const deduplicatedCount = parseNonNegativeNumber(
    input.kv.deduplicated_count,
    input.fallback.deduplicatedCount,
  );
  const capacityRejections = parseNonNegativeNumber(
    input.kv.capacity_rejections,
    input.fallback.capacityRejections,
  );
  const staleRejections = parseNonNegativeNumber(
    input.kv.stale_rejections,
    input.fallback.staleRejections,
  );
  const manualRejections = parseNonNegativeNumber(
    input.kv.manual_rejections,
    input.fallback.manualRejections,
  );

  const dominantPriorityId = parseDominantPriorityId(input.kv.dominant_priority);
  const dominantPriority =
    dominantPriorityId === null
      ? input.fallback.dominantPriorityLabel
      : input.labels.priorityById[dominantPriorityId];

  const assessmentKey =
    pressure === "congested" ||
    pressure === "saturated" ||
    rejectedCount > 0 ||
    deduplicatedCount >= 3
      ? "agent.command.doctor.queueInvestigateAssessmentHigh"
      : "agent.command.doctor.queueInvestigateAssessmentNormal";

  const shouldHealQueue =
    pressure === "congested" ||
    pressure === "saturated" ||
    rejectedCount > 0 ||
    deduplicatedCount > 0 ||
    capacityRejections > 0 ||
    staleRejections > 0;
  const fixHealKey = shouldHealQueue
    ? "agent.command.doctor.queueInvestigateFixHeal"
    : "agent.command.doctor.queueInvestigateFixHealIfNeeded";

  return {
    pressure,
    assessmentKey,
    fixHealKey,
    lines: [
      {
        key: "agent.command.doctor.queueInvestigateTitle",
      },
      {
        key: "agent.command.doctor.queueInvestigateScope",
        vars: {
          pressure: input.labels.pressureById[pressure],
          latest: input.formatNumber(latestDepth),
          max: input.formatNumber(maxDepth),
          limit: input.formatNumber(queueLimit),
          queued: input.formatNumber(queuedCount),
          dequeued: input.formatNumber(dequeuedCount),
          rejected: input.formatNumber(rejectedCount),
          deduplicated: input.formatNumber(deduplicatedCount),
          capacity: input.formatNumber(capacityRejections),
          stale: input.formatNumber(staleRejections),
          manual: input.formatNumber(manualRejections),
          dominant: dominantPriority,
        },
      },
      {
        key: assessmentKey,
      },
      {
        key: "agent.command.doctor.queueInvestigateDiagnosisHeader",
      },
      {
        key: "agent.command.doctor.queueInvestigateDiagnosisQueueOps",
      },
      {
        key: "agent.command.doctor.queueInvestigateDiagnosisTraceHotspots",
      },
      {
        key: "agent.command.doctor.queueInvestigateFixHeader",
      },
      {
        key: fixHealKey,
      },
      {
        key: "agent.command.doctor.queueInvestigateFixCompact",
      },
      {
        key: "agent.command.doctor.queueInvestigateFixPriority",
      },
      {
        key: "agent.command.doctor.queueInvestigateVerifyHeader",
      },
      {
        key: "agent.command.doctor.queueInvestigateVerifyStatus",
      },
      {
        key: "agent.command.doctor.queueInvestigateVerifyQueueOps",
      },
      {
        key: "agent.command.doctor.queueInvestigateVerifyOutcome",
      },
    ],
  };
}
