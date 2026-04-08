import type {
  TraceFilter,
  TracePermissionBlastRadiusFilter,
  TracePermissionReversibilityFilter,
  TracePermissionRiskFilter,
  TraceRunWindow,
} from "./traceRunRuntime";

export interface TraceCommandParseSnapshot {
  limit: number;
  filter: TraceFilter;
  warningsOnly: boolean;
  summaryMode: boolean;
  hotspotsMode: boolean;
  hottestMode: boolean;
  investigateMode: boolean;
  investigateRunbookMode: boolean;
  investigateWorkflowMode: boolean;
  investigateSubmitMode: boolean;
  failureFocus: boolean;
  toolFocus: string | null;
  runWindow: TraceRunWindow;
  riskFilter: TracePermissionRiskFilter;
  reversibilityFilter: TracePermissionReversibilityFilter;
  blastRadiusFilter: TracePermissionBlastRadiusFilter;
}

export type TraceCommandParseResult =
  | {
    ok: true;
    snapshot: TraceCommandParseSnapshot;
  }
  | {
    ok: false;
  };

export function parseTraceFilterToken(token: string): TraceFilter | null {
  const normalized = token.toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "queue") return "queue";
  if (normalized === "tools" || normalized === "tool") return "tools";
  if (normalized === "permission" || normalized === "permissions" || normalized === "perm") return "permission";
  if (normalized === "query" || normalized === "lifecycle") return "query";
  if (normalized === "prompt" || normalized === "prompts") return "prompt";
  if (normalized === "retry" || normalized === "retries" || normalized === "backoff") return "retry";
  if (normalized === "continue" || normalized === "cont") return "continue";
  return null;
}

export function parseTraceSummaryToken(token: string): boolean {
  const normalized = token.toLowerCase();
  return normalized === "summary" || normalized === "runs" || normalized === "run";
}

export function parseTraceToolToken(token: string): string | null {
  const normalized = token.toLowerCase();
  if (normalized.startsWith("tool=")) {
    return token.slice(token.indexOf("=") + 1).trim();
  }
  if (normalized.startsWith("tool:")) {
    return token.slice(token.indexOf(":") + 1).trim();
  }
  return null;
}

export function parseTraceRunWindowToken(token: string): TraceRunWindow | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("runs=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("window=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  if (payload.toLowerCase() === "all") {
    return "all";
  }
  const parsed = Number.parseInt(payload, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeTraceRiskAlias(value: string): TracePermissionRiskFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "critical" || normalized === "crit" || normalized === "fatal") {
    return "critical";
  }
  if (normalized === "high_risk" || normalized === "highrisk" || normalized === "high") {
    return "high_risk";
  }
  if (normalized === "interactive" || normalized === "interact" || normalized === "tty") {
    return "interactive";
  }
  if (normalized === "path_outside" || normalized === "pathoutside" || normalized === "outside") {
    return "path_outside";
  }
  if (normalized === "policy" || normalized === "default") {
    return "policy";
  }
  return null;
}

export function parseTraceRiskToken(token: string): TracePermissionRiskFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("risk=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("risk:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceRiskAlias(payload);
  return parsed ?? "invalid";
}

function normalizeTraceReversibilityAlias(value: string): TracePermissionReversibilityFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "reversible" || normalized === "rev" || normalized === "safe") {
    return "reversible";
  }
  if (normalized === "mixed" || normalized === "partial") {
    return "mixed";
  }
  if (normalized === "hard_to_reverse" || normalized === "irreversible" || normalized === "hard") {
    return "hard_to_reverse";
  }
  return null;
}

export function parseTraceReversibilityToken(
  token: string,
): TracePermissionReversibilityFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("reversibility=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("reversibility:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("rev=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("rev:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceReversibilityAlias(payload);
  return parsed ?? "invalid";
}

function normalizeTraceBlastRadiusAlias(value: string): TracePermissionBlastRadiusFilter | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized === "all" || normalized === "any") {
    return "all";
  }
  if (normalized === "local" || normalized === "local_only") {
    return "local";
  }
  if (normalized === "workspace" || normalized === "workdir") {
    return "workspace";
  }
  if (normalized === "shared" || normalized === "global") {
    return "shared";
  }
  return null;
}

export function parseTraceBlastRadiusToken(
  token: string,
): TracePermissionBlastRadiusFilter | "invalid" | null {
  const normalized = token.toLowerCase();
  let payload: string | null = null;
  if (normalized.startsWith("blast=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("blast:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("blast_radius=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("blast_radius:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  } else if (normalized.startsWith("radius=")) {
    payload = token.slice(token.indexOf("=") + 1).trim();
  } else if (normalized.startsWith("radius:")) {
    payload = token.slice(token.indexOf(":") + 1).trim();
  }
  if (payload === null) {
    return null;
  }
  const parsed = normalizeTraceBlastRadiusAlias(payload);
  return parsed ?? "invalid";
}

export function deriveTraceCommandParseSnapshot(args: readonly string[]): TraceCommandParseResult {
  let limit = 20;
  let filter: TraceFilter = "all";
  let warningsOnly = false;
  let summaryMode = false;
  let hotspotsMode = false;
  let hottestMode = false;
  let investigateMode = false;
  let investigateRunbookMode = false;
  let investigateWorkflowMode = false;
  let investigateSubmitMode = false;
  let failureFocus = false;
  let toolFocus: string | null = null;
  let runWindow: TraceRunWindow = "all";
  let riskFilter: TracePermissionRiskFilter = "all";
  let reversibilityFilter: TracePermissionReversibilityFilter = "all";
  let blastRadiusFilter: TracePermissionBlastRadiusFilter = "all";

  for (const rawToken of args) {
    const raw = rawToken.trim();
    if (!raw) {
      continue;
    }
    const token = raw.toLowerCase();
    if (token === "warn" || token === "warning" || token === "warnings") {
      warningsOnly = true;
      continue;
    }
    if (token === "failure" || token === "failures" || token === "failurefocus" || token === "focus") {
      failureFocus = true;
      continue;
    }

    if (parseTraceSummaryToken(token)) {
      summaryMode = true;
      continue;
    }
    if (token === "hotspots" || token === "hotspot") {
      hotspotsMode = true;
      continue;
    }
    if (token === "hottest" || token === "toptool" || token === "top-tool" || token === "top") {
      hottestMode = true;
      continue;
    }
    if (token === "investigate" || token === "investigation" || token === "invest") {
      investigateMode = true;
      continue;
    }
    if (token === "runbook" || token === "playbook") {
      investigateRunbookMode = true;
      continue;
    }
    if (token === "workflow" || token === "task") {
      investigateWorkflowMode = true;
      continue;
    }
    if (token === "execute" || token === "submit" || token === "run") {
      investigateSubmitMode = true;
      continue;
    }

    const parsedToolFocus = parseTraceToolToken(raw);
    if (parsedToolFocus !== null) {
      if (!parsedToolFocus) {
        return { ok: false };
      }
      toolFocus = parsedToolFocus;
      continue;
    }

    const parsedRunWindow = parseTraceRunWindowToken(raw);
    if (parsedRunWindow !== null) {
      runWindow = parsedRunWindow;
      continue;
    }

    const parsedRiskFilter = parseTraceRiskToken(raw);
    if (parsedRiskFilter === "invalid") {
      return { ok: false };
    }
    if (parsedRiskFilter !== null) {
      riskFilter = parsedRiskFilter;
      continue;
    }

    const parsedReversibilityFilter = parseTraceReversibilityToken(raw);
    if (parsedReversibilityFilter === "invalid") {
      return { ok: false };
    }
    if (parsedReversibilityFilter !== null) {
      reversibilityFilter = parsedReversibilityFilter;
      continue;
    }

    const parsedBlastRadiusFilter = parseTraceBlastRadiusToken(raw);
    if (parsedBlastRadiusFilter === "invalid") {
      return { ok: false };
    }
    if (parsedBlastRadiusFilter !== null) {
      blastRadiusFilter = parsedBlastRadiusFilter;
      continue;
    }

    const parsedFilter = parseTraceFilterToken(token);
    if (parsedFilter) {
      filter = parsedFilter;
      continue;
    }

    const parsedLimit = Number.parseInt(token, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      limit = parsedLimit;
      continue;
    }

    return { ok: false };
  }

  const usingPromptOnlyShortcut =
    args.length === 1 &&
    parseTraceFilterToken(args[0] ?? "") === "prompt";
  if (
    usingPromptOnlyShortcut &&
    !summaryMode &&
    !hotspotsMode &&
    !investigateMode
  ) {
    summaryMode = true;
    limit = Math.max(limit, 8);
  }

  return {
    ok: true,
    snapshot: {
      limit,
      filter,
      warningsOnly,
      summaryMode,
      hotspotsMode,
      hottestMode,
      investigateMode,
      investigateRunbookMode,
      investigateWorkflowMode,
      investigateSubmitMode,
      failureFocus,
      toolFocus,
      runWindow,
      riskFilter,
      reversibilityFilter,
      blastRadiusFilter,
    },
  };
}
