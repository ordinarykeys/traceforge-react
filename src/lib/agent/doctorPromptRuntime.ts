import type { PromptCompiledSectionMetadata, QueryStreamEvent } from "./query/events";

type PromptCompiledEvent = Extract<QueryStreamEvent, { type: "prompt_compiled" }>;

export interface DoctorPromptGovernanceSummary {
  ownerCounts: {
    core: number;
    safeguards: number;
    runtime: number;
  };
  immutableCount: number;
  modelLaunchCount: number;
}

export type DoctorPromptLineKey =
  | "agent.command.doctor.promptStats"
  | "agent.command.doctor.promptHashes"
  | "agent.command.doctor.promptTags"
  | "agent.command.doctor.promptGovernance"
  | "agent.command.doctor.promptStatsMissing";

export interface DoctorPromptLineDescriptor {
  level: "ok" | "warn";
  key: DoctorPromptLineKey;
  vars?: Record<string, string>;
}

export function summarizeDoctorPromptGovernance(
  sectionMetadata: PromptCompiledSectionMetadata[],
): DoctorPromptGovernanceSummary {
  const ownerCounts = {
    core: 0,
    safeguards: 0,
    runtime: 0,
  };
  let immutableCount = 0;
  let modelLaunchCount = 0;
  for (const section of sectionMetadata) {
    ownerCounts[section.owner] += 1;
    if (!section.mutable) {
      immutableCount += 1;
    }
    if (section.modelLaunchTag) {
      modelLaunchCount += 1;
    }
  }
  return {
    ownerCounts,
    immutableCount,
    modelLaunchCount,
  };
}

export function deriveDoctorPromptSectionLineDescriptors(options: {
  lastPromptCompiled: PromptCompiledEvent | null;
  formatNumber: (value: number) => string;
}): DoctorPromptLineDescriptor[] {
  const { lastPromptCompiled, formatNumber } = options;
  if (!lastPromptCompiled) {
    return [
      {
        level: "warn",
        key: "agent.command.doctor.promptStatsMissing",
      },
    ];
  }

  const lines: DoctorPromptLineDescriptor[] = [
    {
      level: "ok",
      key: "agent.command.doctor.promptStats",
      vars: {
        staticSections: formatNumber(lastPromptCompiled.staticSections),
        dynamicSections: formatNumber(lastPromptCompiled.dynamicSections),
        staticChars: formatNumber(lastPromptCompiled.staticChars),
        dynamicChars: formatNumber(lastPromptCompiled.dynamicChars),
        totalChars: formatNumber(lastPromptCompiled.totalChars),
      },
    },
  ];

  if (lastPromptCompiled.staticHash && lastPromptCompiled.dynamicHash) {
    lines.push({
      level: "ok",
      key: "agent.command.doctor.promptHashes",
      vars: {
        staticHash: lastPromptCompiled.staticHash,
        dynamicHash: lastPromptCompiled.dynamicHash,
      },
    });
  }

  if (Array.isArray(lastPromptCompiled.modelLaunchTags) && lastPromptCompiled.modelLaunchTags.length > 0) {
    lines.push({
      level: "ok",
      key: "agent.command.doctor.promptTags",
      vars: {
        tags: lastPromptCompiled.modelLaunchTags.join(", "),
      },
    });
  }

  if (Array.isArray(lastPromptCompiled.sectionMetadata) && lastPromptCompiled.sectionMetadata.length > 0) {
    const governance = summarizeDoctorPromptGovernance(lastPromptCompiled.sectionMetadata);
    lines.push({
      level: "ok",
      key: "agent.command.doctor.promptGovernance",
      vars: {
        core: formatNumber(governance.ownerCounts.core),
        safeguards: formatNumber(governance.ownerCounts.safeguards),
        runtime: formatNumber(governance.ownerCounts.runtime),
        immutable: formatNumber(governance.immutableCount),
        launch: formatNumber(governance.modelLaunchCount),
      },
    });
  }

  return lines;
}
