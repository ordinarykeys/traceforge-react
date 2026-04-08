import type { DoctorRecommendationId } from "./diagnosisRecommendationPolicy";

export type DoctorEnvironmentLineLevel = "ok" | "warn" | "fail";

export type DoctorEnvironmentLineKey =
  | "agent.command.doctor.apiReady"
  | "agent.command.doctor.apiMissing"
  | "agent.command.doctor.workspaceMissing"
  | "agent.command.doctor.workspaceOk"
  | "agent.command.doctor.workspaceFail"
  | "agent.command.doctor.gitOk"
  | "agent.command.doctor.gitMissing"
  | "agent.command.doctor.gitFail";

export interface DoctorEnvironmentLineDescriptor {
  level: DoctorEnvironmentLineLevel;
  key: DoctorEnvironmentLineKey;
  vars?: Record<string, string>;
}

export interface DoctorEnvironmentEvaluation {
  line: DoctorEnvironmentLineDescriptor;
  recommendationIds: DoctorRecommendationId[];
}

export interface DoctorGitSnapshotLike {
  is_git_repo?: boolean | null;
  branch?: string | null;
  default_branch?: string | null;
}

export interface DeriveDoctorGitLineFromSnapshotInput {
  workspace: string;
  snapshot: DoctorGitSnapshotLike;
  unknownLabel: string;
}

export interface DoctorGitEvaluation extends DoctorEnvironmentEvaluation {
  hasGitRepo: boolean;
}

export function deriveDoctorApiStateLine(
  currentModel: string | undefined,
): DoctorEnvironmentLineDescriptor {
  if (currentModel && currentModel.trim().length > 0) {
    return {
      level: "ok",
      key: "agent.command.doctor.apiReady",
      vars: {
        model: currentModel,
      },
    };
  }
  return {
    level: "ok",
    key: "agent.command.doctor.apiMissing",
  };
}

export function deriveDoctorWorkspaceMissing(): DoctorEnvironmentEvaluation {
  return {
    line: {
      level: "warn",
      key: "agent.command.doctor.workspaceMissing",
    },
    recommendationIds: ["selectWorkspace"],
  };
}

export function deriveDoctorWorkspaceOk(
  workspace: string,
  fileCountLabel: string,
): DoctorEnvironmentEvaluation {
  return {
    line: {
      level: "ok",
      key: "agent.command.doctor.workspaceOk",
      vars: {
        workspace,
        count: fileCountLabel,
      },
    },
    recommendationIds: [],
  };
}

export function deriveDoctorWorkspaceFail(
  workspace: string,
  error: string,
): DoctorEnvironmentEvaluation {
  return {
    line: {
      level: "fail",
      key: "agent.command.doctor.workspaceFail",
      vars: {
        workspace,
        error,
      },
    },
    recommendationIds: [],
  };
}

export function deriveDoctorGitLineFromSnapshot(
  input: DeriveDoctorGitLineFromSnapshotInput,
): DoctorGitEvaluation {
  if (input.snapshot?.is_git_repo) {
    return {
      hasGitRepo: true,
      line: {
        level: "ok",
        key: "agent.command.doctor.gitOk",
        vars: {
          branch: input.snapshot.branch || input.unknownLabel,
          base: input.snapshot.default_branch || input.unknownLabel,
        },
      },
      recommendationIds: [],
    };
  }
  return {
    hasGitRepo: false,
    line: {
      level: "warn",
      key: "agent.command.doctor.gitMissing",
      vars: {
        workspace: input.workspace,
      },
    },
    recommendationIds: ["initGit"],
  };
}

export function deriveDoctorGitLineFromError(error: string): DoctorEnvironmentEvaluation {
  return {
    line: {
      level: "warn",
      key: "agent.command.doctor.gitFail",
      vars: {
        error,
      },
    },
    recommendationIds: ["checkGit"],
  };
}
