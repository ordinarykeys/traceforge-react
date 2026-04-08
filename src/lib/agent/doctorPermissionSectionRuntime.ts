import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";
import { deriveDoctorPermissionRiskHighLineLevel } from "./doctorLineRuntime";
import { deriveDoctorPermissionRecommendationIds } from "./doctorRecommendationRuntime";
import type { QueryStreamEvent } from "./query/events";

export interface DoctorPermissionRiskCounters {
  critical: number;
  high_risk: number;
  interactive: number;
  path_outside: number;
  policy: number;
  scopeNotices: number;
  reversibilityReversible: number;
  reversibilityMixed: number;
  reversibilityHardToReverse: number;
  blastLocal: number;
  blastWorkspace: number;
  blastShared: number;
}

export type DoctorPermissionLineKey =
  | "agent.command.doctor.permissions"
  | "agent.command.doctor.permissionRiskSummary"
  | "agent.command.doctor.permissionRiskProfileSummary"
  | "agent.command.doctor.permissionRiskHigh";

export interface DoctorPermissionLineDescriptor {
  level: "ok" | "warn";
  key: DoctorPermissionLineKey;
  vars?: Record<string, string>;
}

export interface DoctorPermissionSectionRuntimeInput {
  events: readonly QueryStreamEvent[];
  permissionMode: string;
  permissionRuleCount: number;
  formatNumber: (value: number) => string;
}

export interface DoctorPermissionSectionRuntimeOutput {
  counters: DoctorPermissionRiskCounters;
  lines: DoctorPermissionLineDescriptor[];
  recommendationIds: DoctorRecommendationId[];
}

export function createEmptyDoctorPermissionRiskCounters(): DoctorPermissionRiskCounters {
  return {
    critical: 0,
    high_risk: 0,
    interactive: 0,
    path_outside: 0,
    policy: 0,
    scopeNotices: 0,
    reversibilityReversible: 0,
    reversibilityMixed: 0,
    reversibilityHardToReverse: 0,
    blastLocal: 0,
    blastWorkspace: 0,
    blastShared: 0,
  };
}

export function collectDoctorPermissionRiskCounters(
  events: readonly QueryStreamEvent[],
): DoctorPermissionRiskCounters {
  const counters = createEmptyDoctorPermissionRiskCounters();
  for (const event of events) {
    if (event.type === "authorization_scope_notice") {
      counters.scopeNotices += 1;
      continue;
    }
    if (event.type !== "permission_decision") {
      if (event.type === "permission_risk_profile") {
        if (event.reversibility === "reversible") counters.reversibilityReversible += 1;
        else if (event.reversibility === "mixed") counters.reversibilityMixed += 1;
        else counters.reversibilityHardToReverse += 1;

        if (event.blastRadius === "local") counters.blastLocal += 1;
        else if (event.blastRadius === "workspace") counters.blastWorkspace += 1;
        else counters.blastShared += 1;
      }
      continue;
    }
    if (!event.riskClass) {
      continue;
    }
    counters[event.riskClass] += 1;
  }
  return counters;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function deriveDoctorPermissionSectionRuntime(
  input: DoctorPermissionSectionRuntimeInput,
): DoctorPermissionSectionRuntimeOutput {
  const counters = collectDoctorPermissionRiskCounters(input.events);
  const lines: DoctorPermissionLineDescriptor[] = [
    {
      level: "ok",
      key: "agent.command.doctor.permissions",
      vars: {
        mode: input.permissionMode,
        rules: input.formatNumber(normalizeCount(input.permissionRuleCount)),
      },
    },
    {
      level: "ok",
      key: "agent.command.doctor.permissionRiskSummary",
      vars: {
        critical: input.formatNumber(counters.critical),
        highRisk: input.formatNumber(counters.high_risk),
        interactive: input.formatNumber(counters.interactive),
        pathOutside: input.formatNumber(counters.path_outside),
        policy: input.formatNumber(counters.policy),
        scopeNotices: input.formatNumber(counters.scopeNotices),
      },
    },
    {
      level: "ok",
      key: "agent.command.doctor.permissionRiskProfileSummary",
      vars: {
        reversible: input.formatNumber(counters.reversibilityReversible),
        mixed: input.formatNumber(counters.reversibilityMixed),
        hardToReverse: input.formatNumber(counters.reversibilityHardToReverse),
        local: input.formatNumber(counters.blastLocal),
        workspace: input.formatNumber(counters.blastWorkspace),
        shared: input.formatNumber(counters.blastShared),
      },
    },
  ];

  if (
    deriveDoctorPermissionRiskHighLineLevel(
      counters.critical,
      counters.high_risk,
    ) === "warn"
  ) {
    lines.push({
      level: "warn",
      key: "agent.command.doctor.permissionRiskHigh",
    });
  }

  const recommendationIds = deriveDoctorPermissionRecommendationIds({
    critical: counters.critical,
    high_risk: counters.high_risk,
    path_outside: counters.path_outside,
    reversibilityHardToReverse: counters.reversibilityHardToReverse,
    blastShared: counters.blastShared,
  });

  return {
    counters,
    lines,
    recommendationIds,
  };
}
