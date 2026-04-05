export interface QueryConfig {
  gates: {
    enableStopHooks: boolean;
    enableTokenBudget: boolean;
    enableFallbackModel: boolean;
  };
}

function envEnabled(name: string, defaultValue: boolean): boolean {
  const raw = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];
  if (raw == null) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  return defaultValue;
}

export function buildQueryConfig(): QueryConfig {
  return {
    gates: {
      enableStopHooks: envEnabled("TRACEFORGE_AGENT_STOP_HOOKS", true),
      enableTokenBudget: envEnabled("TRACEFORGE_AGENT_TOKEN_BUDGET", true),
      enableFallbackModel: envEnabled("TRACEFORGE_AGENT_FALLBACK", true),
    },
  };
}

