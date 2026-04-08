import type { TranslationKey } from "@/lib/i18n";
import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";

export interface DoctorRecommendationTextDescriptor {
  key: TranslationKey;
  includeWorkspaceVar?: boolean;
}

export interface DoctorRecommendationTextVarOptions {
  workspace?: string | null;
  fallbackWorkspace?: string;
}

export const DOCTOR_RECOMMENDATION_TEXT_DESCRIPTOR_MAP: Readonly<
  Record<DoctorRecommendationId, DoctorRecommendationTextDescriptor>
> = Object.freeze({
  selectWorkspace: {
    key: "agent.command.doctor.recommend.selectWorkspace",
  },
  checkGit: {
    key: "agent.command.doctor.recommend.checkGit",
  },
  initGit: {
    key: "agent.command.doctor.recommend.initGit",
    includeWorkspaceVar: true,
  },
  recoverPlan: {
    key: "agent.command.doctor.recommend.recoverPlan",
  },
  queueHeal: {
    key: "agent.command.doctor.recommend.queueHeal",
  },
  recoverAuto: {
    key: "agent.command.doctor.recommend.recoverAuto",
  },
  resumeInterruptedTurn: {
    key: "agent.command.doctor.recommend.resumeInterruptedTurn",
  },
  recoverExecuteStrict: {
    key: "agent.command.doctor.recommend.recoverExecuteStrict",
  },
  recoverInvestigate: {
    key: "agent.command.doctor.recommend.recoverInvestigate",
  },
  queueInvestigate: {
    key: "agent.command.doctor.recommend.queueInvestigate",
  },
  relieveQueue: {
    key: "agent.command.doctor.recommend.relieveQueue",
  },
  relieveQueueForFallback: {
    key: "agent.command.doctor.recommend.relieveQueueForFallback",
  },
  configureFallbackModel: {
    key: "agent.command.doctor.recommend.configureFallbackModel",
  },
  enableFallbackGate: {
    key: "agent.command.doctor.recommend.enableFallbackGate",
  },
  inspectTasks: {
    key: "agent.command.doctor.recommend.inspectTasks",
  },
  allowWorkspaceWrite: {
    key: "agent.command.doctor.recommend.allowWorkspaceWrite",
  },
  fixPermissionRuleForTools: {
    key: "agent.command.doctor.recommend.fixPermissionRuleForTools",
  },
  fixWorkspaceBoundaryFailures: {
    key: "agent.command.doctor.recommend.fixWorkspaceBoundaryFailures",
  },
  reduceToolTimeoutPressure: {
    key: "agent.command.doctor.recommend.reduceToolTimeoutPressure",
  },
  checkNetworkAndEndpoint: {
    key: "agent.command.doctor.recommend.checkNetworkAndEndpoint",
  },
  investigateMissingResources: {
    key: "agent.command.doctor.recommend.investigateMissingResources",
  },
  validateToolInputShape: {
    key: "agent.command.doctor.recommend.validateToolInputShape",
  },
  inspectToolRuntimeErrors: {
    key: "agent.command.doctor.recommend.inspectToolRuntimeErrors",
  },
  tuneToolBudgetPolicy: {
    key: "agent.command.doctor.recommend.tuneToolBudgetPolicy",
  },
  waitForFailureBackoffRecovery: {
    key: "agent.command.doctor.recommend.waitForFailureBackoffRecovery",
  },
  avoidDuplicateQueueSubmissions: {
    key: "agent.command.doctor.recommend.avoidDuplicateQueueSubmissions",
  },
  reduceHighRiskApprovals: {
    key: "agent.command.doctor.recommend.reduceHighRiskApprovals",
  },
  keepWorkspaceBoundaries: {
    key: "agent.command.doctor.recommend.keepWorkspaceBoundaries",
  },
  explicitConfirmationForIrreversible: {
    key: "agent.command.doctor.recommend.explicitConfirmationForIrreversible",
  },
});

export function getDoctorRecommendationTextDescriptor(
  id: DoctorRecommendationId,
): DoctorRecommendationTextDescriptor {
  return DOCTOR_RECOMMENDATION_TEXT_DESCRIPTOR_MAP[id];
}

export function getDoctorRecommendationTextVars(
  id: DoctorRecommendationId,
  options?: DoctorRecommendationTextVarOptions,
): Record<string, string> | undefined {
  if (id !== "initGit") {
    return undefined;
  }
  const workspace = options?.workspace ?? options?.fallbackWorkspace ?? "";
  return { workspace };
}
