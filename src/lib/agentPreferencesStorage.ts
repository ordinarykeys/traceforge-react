import {
  canUseNativePersistence,
  loadPersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

export type AgentPermissionMode = "default" | "full_access";

export type AgentToolBudgetPolicySnapshot = {
  readOnlyBase: number;
  mutatingBase: number;
  shellBase: number;
  failureBackoffStep: number;
  minimum: number;
};

export type AgentPreferencesSnapshot = {
  currentModel: string;
  permissionMode: AgentPermissionMode;
  toolCallBudgetPolicy: AgentToolBudgetPolicySnapshot;
};

type AgentPreferencesState = {
  version: 1;
  byScope: Record<string, AgentPreferencesSnapshot>;
};

const AGENT_PREFERENCES_STORAGE_KEY = "traceforge.agent.preferences";
const LEGACY_MODEL_KEY = "tf-agent-current-model";
const LEGACY_PERMISSION_MODE_KEY = "tf-agent-permission-mode";
const DEFAULT_SCOPE = "__default__";

const DEFAULT_TOOL_CALL_BUDGET_POLICY: AgentToolBudgetPolicySnapshot = {
  readOnlyBase: 28,
  mutatingBase: 18,
  shellBase: 12,
  failureBackoffStep: 2,
  minimum: 4,
};

const DEFAULT_AGENT_PREFERENCES: AgentPreferencesSnapshot = {
  currentModel: "deepseek-ai/DeepSeek-V3",
  permissionMode: "default",
  toolCallBudgetPolicy: DEFAULT_TOOL_CALL_BUDGET_POLICY,
};

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeScope(scope?: string) {
  const value = typeof scope === "string" ? scope.trim() : "";
  return value || DEFAULT_SCOPE;
}

function normalizePermissionMode(mode: unknown): AgentPermissionMode {
  return mode === "full_access" ? "full_access" : "default";
}

function normalizeModel(model: unknown): string {
  if (typeof model !== "string") return DEFAULT_AGENT_PREFERENCES.currentModel;
  const trimmed = model.trim();
  return trimmed || DEFAULT_AGENT_PREFERENCES.currentModel;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

function normalizeToolCallBudgetPolicy(
  value: Partial<AgentToolBudgetPolicySnapshot> | null | undefined,
): AgentToolBudgetPolicySnapshot {
  const base = DEFAULT_TOOL_CALL_BUDGET_POLICY;
  const readOnlyBase = clampInt(value?.readOnlyBase, base.readOnlyBase, 1, 500);
  const mutatingBase = clampInt(value?.mutatingBase, base.mutatingBase, 1, 500);
  const shellBase = clampInt(value?.shellBase, base.shellBase, 1, 500);
  const failureBackoffStep = clampInt(value?.failureBackoffStep, base.failureBackoffStep, 0, 200);
  const candidateMin = clampInt(value?.minimum, base.minimum, 1, 500);
  const minimum = Math.min(candidateMin, readOnlyBase, mutatingBase, shellBase);
  return {
    readOnlyBase,
    mutatingBase,
    shellBase,
    failureBackoffStep,
    minimum,
  };
}

function normalizeSnapshot(value: Partial<AgentPreferencesSnapshot> | null | undefined): AgentPreferencesSnapshot {
  return {
    currentModel: normalizeModel(value?.currentModel),
    permissionMode: normalizePermissionMode(value?.permissionMode),
    toolCallBudgetPolicy: normalizeToolCallBudgetPolicy(value?.toolCallBudgetPolicy),
  };
}

function parseState(raw: string | null | undefined): AgentPreferencesState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentPreferencesState>;
    const byScopeRaw = parsed.byScope && typeof parsed.byScope === "object" ? parsed.byScope : {};
    const byScope: Record<string, AgentPreferencesSnapshot> = {};
    for (const [scope, value] of Object.entries(byScopeRaw)) {
      byScope[normalizeScope(scope)] = normalizeSnapshot(value as Partial<AgentPreferencesSnapshot>);
    }
    return {
      version: 1,
      byScope,
    };
  } catch (error) {
    console.error("Failed to parse saved agent preferences", error);
    return null;
  }
}

function buildState(base: AgentPreferencesState | null): AgentPreferencesState {
  if (base) return base;
  return {
    version: 1,
    byScope: {},
  };
}

function readLegacySnapshot(): AgentPreferencesSnapshot | null {
  if (!hasWindowStorage()) return null;
  const model = window.localStorage.getItem(LEGACY_MODEL_KEY);
  const permissionMode = window.localStorage.getItem(LEGACY_PERMISSION_MODE_KEY);
  if (!model && !permissionMode) return null;
  const legacy: Partial<AgentPreferencesSnapshot> = {
    currentModel: model ?? undefined,
    permissionMode: normalizePermissionMode(permissionMode ?? undefined),
  };
  return normalizeSnapshot(legacy);
}

function writeLegacySnapshot(snapshot: AgentPreferencesSnapshot) {
  if (!hasWindowStorage()) return;
  window.localStorage.setItem(LEGACY_MODEL_KEY, snapshot.currentModel);
  window.localStorage.setItem(LEGACY_PERMISSION_MODE_KEY, snapshot.permissionMode);
}

async function persistState(state: AgentPreferencesState) {
  const serialized = JSON.stringify(state);
  if (hasWindowStorage()) {
    window.localStorage.setItem(AGENT_PREFERENCES_STORAGE_KEY, serialized);
  }
  if (!canUseNativePersistence()) {
    return;
  }
  await savePersistentEntries([{ key: AGENT_PREFERENCES_STORAGE_KEY, value: serialized }]);
}

export async function loadAgentPreferences(scope?: string): Promise<AgentPreferencesSnapshot> {
  const normalizedScope = normalizeScope(scope);
  let state: AgentPreferencesState | null = null;

  if (canUseNativePersistence()) {
    const entries = await loadPersistentEntries([AGENT_PREFERENCES_STORAGE_KEY]);
    state = parseState(entries[AGENT_PREFERENCES_STORAGE_KEY] ?? null);
  }

  if (!state && hasWindowStorage()) {
    state = parseState(window.localStorage.getItem(AGENT_PREFERENCES_STORAGE_KEY));
  }

  if (!state) {
    const legacy = readLegacySnapshot();
    if (legacy) {
      const migrated = buildState(null);
      migrated.byScope[DEFAULT_SCOPE] = legacy;
      await persistState(migrated);
      writeLegacySnapshot(legacy);
      return legacy;
    }
    return DEFAULT_AGENT_PREFERENCES;
  }

  const scoped = state.byScope[normalizedScope];
  const fallback = state.byScope[DEFAULT_SCOPE];
  const snapshot = normalizeSnapshot(scoped ?? fallback ?? DEFAULT_AGENT_PREFERENCES);
  writeLegacySnapshot(snapshot);
  return snapshot;
}

export async function saveAgentPreferences(
  scope: string | undefined,
  patch: Partial<AgentPreferencesSnapshot>,
): Promise<void> {
  const normalizedScope = normalizeScope(scope);
  let state: AgentPreferencesState | null = null;

  if (canUseNativePersistence()) {
    const entries = await loadPersistentEntries([AGENT_PREFERENCES_STORAGE_KEY]);
    state = parseState(entries[AGENT_PREFERENCES_STORAGE_KEY] ?? null);
  }

  if (!state && hasWindowStorage()) {
    state = parseState(window.localStorage.getItem(AGENT_PREFERENCES_STORAGE_KEY));
  }

  const nextState = buildState(state);
  const previous = nextState.byScope[normalizedScope] ?? DEFAULT_AGENT_PREFERENCES;
  const nextSnapshot = normalizeSnapshot({
    ...previous,
    ...patch,
  });

  nextState.byScope[normalizedScope] = nextSnapshot;
  await persistState(nextState);
  writeLegacySnapshot(nextSnapshot);
}
