export interface TraceAppliedFilterLabelSnapshot {
  filterLabel: string;
  warningLabel: string;
  suffixes: string[];
}

export interface DeriveTraceAppliedFilterLabelSnapshotOptions {
  filterLabel: string;
  warningsOnly: boolean;
  warningsOnlyLabel: string;
  failureFocus: boolean;
  failureFocusLabel: string;
  hottestMode: boolean;
  hottestApplied: boolean;
  hottestAppliedLabel: string;
  hottestNoDataLabel: string;
  toolLabel: string | null;
  runsAll: boolean;
  runsAllLabel: string;
  runsWindowLabel: string;
  riskLabel: string | null;
  reversibilityLabel: string | null;
  blastRadiusLabel: string | null;
}

export function deriveTraceAppliedFilterLabelSnapshot(
  options: DeriveTraceAppliedFilterLabelSnapshotOptions,
): TraceAppliedFilterLabelSnapshot {
  const suffixes: string[] = [];

  if (options.warningsOnly) {
    suffixes.push(options.warningsOnlyLabel);
  }
  if (options.failureFocus) {
    suffixes.push(options.failureFocusLabel);
  }
  if (options.hottestMode) {
    if (options.hottestApplied && options.toolLabel) {
      suffixes.push(options.hottestAppliedLabel);
    } else {
      suffixes.push(options.hottestNoDataLabel);
    }
  }
  if (options.toolLabel) {
    suffixes.push(options.toolLabel);
  }
  if (options.runsAll) {
    suffixes.push(options.runsAllLabel);
  } else {
    suffixes.push(options.runsWindowLabel);
  }
  if (options.riskLabel) {
    suffixes.push(options.riskLabel);
  }
  if (options.reversibilityLabel) {
    suffixes.push(options.reversibilityLabel);
  }
  if (options.blastRadiusLabel) {
    suffixes.push(options.blastRadiusLabel);
  }

  return {
    filterLabel: options.filterLabel,
    warningLabel: suffixes.length > 0 ? ` | ${suffixes.join(" | ")}` : "",
    suffixes,
  };
}
