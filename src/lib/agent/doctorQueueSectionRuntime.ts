import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";
import {
  shouldRecommendDoctorAvoidDuplicateQueueSubmissions,
  shouldRecommendDoctorInspectTasks,
  shouldRecommendDoctorRelieveQueue,
} from "./doctorRecommendationRuntime";
import {
  deriveDoctorQueueDeduplicatedLineLevel,
  deriveDoctorQueueLineDescriptor,
  type DoctorLineLevel,
} from "./doctorLineRuntime";

export type DoctorQueueLineKey =
  | "agent.command.doctor.queueFull"
  | "agent.command.doctor.queueHigh"
  | "agent.command.doctor.queueHealthy"
  | "agent.command.doctor.queueDeduplicated"
  | "agent.command.doctor.tasks";

export interface DoctorQueueLineDescriptor {
  level: DoctorLineLevel;
  key: DoctorQueueLineKey;
  vars: Record<string, string | number>;
}

export interface DoctorQueueSectionRuntimeInput {
  queueCount: number;
  queueLimit: number;
  queueDeduplicatedCount: number;
  runningTaskCount: number;
  totalTaskCount: number;
  formatNumber: (value: number) => string;
}

export interface DoctorQueueSectionRuntimeOutput {
  lines: DoctorQueueLineDescriptor[];
  recommendationIds: DoctorRecommendationId[];
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveDoctorQueueSectionRuntime(
  input: DoctorQueueSectionRuntimeInput,
): DoctorQueueSectionRuntimeOutput {
  const queueCount = normalizeCount(input.queueCount);
  const queueLimit = normalizeCount(input.queueLimit);
  const queueDeduplicatedCount = normalizeCount(input.queueDeduplicatedCount);
  const runningTaskCount = normalizeCount(input.runningTaskCount);
  const totalTaskCount = normalizeCount(input.totalTaskCount);
  const lines: DoctorQueueLineDescriptor[] = [];
  const recommendationIds: DoctorRecommendationId[] = [];

  const queueLine = deriveDoctorQueueLineDescriptor(queueCount, queueLimit);
  lines.push({
    level: queueLine.level,
    key: queueLine.key,
    vars: {
      queue: queueLine.vars.queue,
      limit: queueLine.vars.limit,
      pct: queueLine.vars.pct,
    },
  });

  if (shouldRecommendDoctorRelieveQueue(queueCount, queueLimit)) {
    recommendationIds.push("relieveQueue");
  }

  lines.push({
    level: deriveDoctorQueueDeduplicatedLineLevel(queueDeduplicatedCount),
    key: "agent.command.doctor.queueDeduplicated",
    vars: {
      count: input.formatNumber(queueDeduplicatedCount),
    },
  });

  if (shouldRecommendDoctorAvoidDuplicateQueueSubmissions(queueDeduplicatedCount)) {
    recommendationIds.push("avoidDuplicateQueueSubmissions");
  }

  lines.push({
    level: "ok",
    key: "agent.command.doctor.tasks",
    vars: {
      running: input.formatNumber(runningTaskCount),
      total: input.formatNumber(totalTaskCount),
    },
  });

  if (shouldRecommendDoctorInspectTasks(runningTaskCount)) {
    recommendationIds.push("inspectTasks");
  }

  return {
    lines,
    recommendationIds,
  };
}
