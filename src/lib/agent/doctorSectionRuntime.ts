export type DoctorSectionId =
  | "header"
  | "workspace"
  | "git"
  | "query"
  | "fallback"
  | "tooling"
  | "prompt"
  | "queue"
  | "recovery"
  | "permission"
  | "recommend";

export const DOCTOR_SECTION_ORDER: readonly DoctorSectionId[] = Object.freeze([
  "header",
  "workspace",
  "git",
  "query",
  "fallback",
  "tooling",
  "prompt",
  "queue",
  "recovery",
  "permission",
  "recommend",
]);

export interface DoctorSectionComposer {
  addLine: (sectionId: DoctorSectionId, line: string) => void;
  appendLines: (sectionId: DoctorSectionId, lines: readonly string[]) => void;
  getSectionLines: (sectionId: DoctorSectionId) => string[];
  buildLines: () => string[];
}

function createSectionMap(
  sectionOrder: readonly DoctorSectionId[],
): Map<DoctorSectionId, string[]> {
  const map = new Map<DoctorSectionId, string[]>();
  for (const sectionId of sectionOrder) {
    map.set(sectionId, []);
  }
  return map;
}

export function createDoctorSectionComposer(
  sectionOrder: readonly DoctorSectionId[] = DOCTOR_SECTION_ORDER,
): DoctorSectionComposer {
  const sectionMap = createSectionMap(sectionOrder);

  const ensureSection = (sectionId: DoctorSectionId): string[] => {
    const lines = sectionMap.get(sectionId);
    if (lines) {
      return lines;
    }
    const next: string[] = [];
    sectionMap.set(sectionId, next);
    return next;
  };

  return {
    addLine(sectionId, line) {
      ensureSection(sectionId).push(line);
    },
    appendLines(sectionId, lines) {
      if (!Array.isArray(lines) || lines.length === 0) {
        return;
      }
      ensureSection(sectionId).push(...lines);
    },
    getSectionLines(sectionId) {
      return [...ensureSection(sectionId)];
    },
    buildLines() {
      const flattened: string[] = [];
      for (const sectionId of sectionOrder) {
        const sectionLines = sectionMap.get(sectionId);
        if (!sectionLines || sectionLines.length === 0) {
          continue;
        }
        flattened.push(...sectionLines);
      }
      return flattened;
    },
  };
}
