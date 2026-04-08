import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";
import {
  deriveDoctorBudgetRecommendationIds,
  deriveDoctorFallbackRecommendationIds,
  deriveDoctorToolFailureRecommendationIds,
  type DoctorToolFailureClass,
} from "./doctorRecommendationRuntime";
import {
  deriveDoctorBudgetGuardLineLevel,
  deriveDoctorFallbackSuppressionRatioLineDescriptor,
  deriveDoctorToolFailureLineLevel,
} from "./doctorLineRuntime";

export type DoctorOperationalSectionId = "query" | "fallback" | "tooling";

export type DoctorOperationalLineKey =
  | "agent.command.doctor.usageStats"
  | "agent.command.doctor.queryProfile"
  | "agent.command.doctor.fallbackActivity"
  | "agent.command.doctor.fallbackSuppressedRatio"
  | "agent.command.doctor.fallbackSuppressed"
  | "agent.command.doctor.toolFailureSummary"
  | "agent.command.doctor.toolBudgetGuardSummary";

export interface DoctorOperationalLineDescriptor {
  section: DoctorOperationalSectionId;
  level: "ok" | "warn" | "fail";
  key: DoctorOperationalLineKey;
  vars: Record<string, string>;
}

export interface DoctorOperationalSectionRuntimeInput {
  usage: {
    totalTokensLabel: string;
    modelCountLabel: string;
  };
  queryProfile?: {
    laneLabel: string;
    retriesLabel: string;
    fallbackLabel: string;
    strategyLabel: string;
  } | null;
  fallback: {
    used: number;
    suppressed: number;
    usedLabel: string;
    suppressedLabel: string;
    suppressionWarnThresholdPct: number;
    latestSuppressed?: {
      countLabel: string;
      reasonLabel: string;
      strategyLabel: string;
      reasonId: string;
    } | null;
    formatNumber: (value: number) => string;
  };
  tooling: {
    toolFailure: {
      total: number;
      detailsLabel: string;
      counts: Readonly<Record<DoctorToolFailureClass, number>>;
    };
    budgetGuard: {
      total: number;
      perToolLimit: number;
      perToolLimitLabel: string;
      failureBackoff: number;
      failureBackoffLabel: string;
      dominantLabel: string;
    };
  };
}

export interface DoctorOperationalSectionRuntimeOutput {
  lines: DoctorOperationalLineDescriptor[];
  recommendationIds: DoctorRecommendationId[];
}

export function deriveDoctorOperationalSectionRuntime(
  input: DoctorOperationalSectionRuntimeInput,
): DoctorOperationalSectionRuntimeOutput {
  const lines: DoctorOperationalLineDescriptor[] = [];
  const recommendationIds: DoctorRecommendationId[] = [];

  lines.push({
    section: "query",
    level: "ok",
    key: "agent.command.doctor.usageStats",
    vars: {
      total: input.usage.totalTokensLabel,
      models: input.usage.modelCountLabel,
    },
  });

  if (input.queryProfile) {
    lines.push({
      section: "query",
      level: "ok",
      key: "agent.command.doctor.queryProfile",
      vars: {
        lane: input.queryProfile.laneLabel,
        retries: input.queryProfile.retriesLabel,
        fallback: input.queryProfile.fallbackLabel,
        strategy: input.queryProfile.strategyLabel,
      },
    });
  }

  if (input.fallback.used > 0 || input.fallback.suppressed > 0) {
    lines.push({
      section: "fallback",
      level: "ok",
      key: "agent.command.doctor.fallbackActivity",
      vars: {
        used: input.fallback.usedLabel,
        suppressed: input.fallback.suppressedLabel,
      },
    });
  }

  const suppressionRatioLine = deriveDoctorFallbackSuppressionRatioLineDescriptor({
    used: input.fallback.used,
    suppressed: input.fallback.suppressed,
    thresholdPct: input.fallback.suppressionWarnThresholdPct,
  });
  if (suppressionRatioLine) {
    lines.push({
      section: "fallback",
      level: suppressionRatioLine.level,
      key: suppressionRatioLine.key,
      vars: {
        ratio: input.fallback.formatNumber(suppressionRatioLine.vars.ratio),
        used: input.fallback.formatNumber(suppressionRatioLine.vars.used),
        suppressed: input.fallback.formatNumber(suppressionRatioLine.vars.suppressed),
      },
    });
  }

  if (input.fallback.latestSuppressed) {
    lines.push({
      section: "fallback",
      level: "warn",
      key: "agent.command.doctor.fallbackSuppressed",
      vars: {
        count: input.fallback.latestSuppressed.countLabel,
        reason: input.fallback.latestSuppressed.reasonLabel,
        strategy: input.fallback.latestSuppressed.strategyLabel,
      },
    });
    recommendationIds.push(
      ...deriveDoctorFallbackRecommendationIds(input.fallback.latestSuppressed.reasonId),
    );
  }

  lines.push({
    section: "tooling",
    level: deriveDoctorToolFailureLineLevel(input.tooling.toolFailure.total),
    key: "agent.command.doctor.toolFailureSummary",
    vars: {
      total: input.fallback.formatNumber(input.tooling.toolFailure.total),
      details: input.tooling.toolFailure.detailsLabel,
    },
  });
  recommendationIds.push(
    ...deriveDoctorToolFailureRecommendationIds(input.tooling.toolFailure.counts),
  );

  lines.push({
    section: "tooling",
    level: deriveDoctorBudgetGuardLineLevel(input.tooling.budgetGuard.total),
    key: "agent.command.doctor.toolBudgetGuardSummary",
    vars: {
      total: input.fallback.formatNumber(input.tooling.budgetGuard.total),
      perToolLimit: input.tooling.budgetGuard.perToolLimitLabel,
      failureBackoff: input.tooling.budgetGuard.failureBackoffLabel,
      dominant: input.tooling.budgetGuard.dominantLabel,
    },
  });
  recommendationIds.push(
    ...deriveDoctorBudgetRecommendationIds({
      perToolLimit: input.tooling.budgetGuard.perToolLimit,
      failureBackoff: input.tooling.budgetGuard.failureBackoff,
    }),
  );

  return {
    lines,
    recommendationIds,
  };
}
