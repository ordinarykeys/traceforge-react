import {
  canUseNativePersistence,
  loadPersistentEntries,
  removePersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

const AUTH_STORAGE_KEY = "traceforge.auth.api-config";
const LEGACY_AUTH_STORAGE_KEY = "tf_api_config";

export type ApiConfig = {
  baseUrl: string;
  apiKey: string;
};

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseApiConfig(raw: string | null): ApiConfig | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    if (
      typeof parsed.baseUrl === "string" &&
      parsed.baseUrl.trim() &&
      typeof parsed.apiKey === "string" &&
      parsed.apiKey.trim()
    ) {
      return {
        baseUrl: parsed.baseUrl.trim(),
        apiKey: parsed.apiKey.trim(),
      };
    }
  } catch (error) {
    console.error("Failed to parse saved auth config", error);
  }

  return null;
}

export async function loadAuthConfig() {
  if (!canUseNativePersistence()) {
    return parseApiConfig(hasWindowStorage() ? window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) : null);
  }

  const entries = await loadPersistentEntries([AUTH_STORAGE_KEY]);
  const nativeConfig = parseApiConfig(entries[AUTH_STORAGE_KEY] ?? null);
  if (nativeConfig) {
    if (hasWindowStorage()) {
      window.localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(nativeConfig));
    }
    return nativeConfig;
  }

  const legacyConfig = parseApiConfig(hasWindowStorage() ? window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) : null);
  if (legacyConfig) {
    await savePersistentEntries([
      {
        key: AUTH_STORAGE_KEY,
        value: JSON.stringify(legacyConfig),
      },
    ]);
    return legacyConfig;
  }

  return null;
}

export async function saveAuthConfig(config: ApiConfig) {
  const serialized = JSON.stringify(config);

  if (hasWindowStorage()) {
    window.localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, serialized);
  }

  if (!canUseNativePersistence()) {
    return;
  }

  await savePersistentEntries([
    {
      key: AUTH_STORAGE_KEY,
      value: serialized,
    },
  ]);
}

export async function clearAuthConfig() {
  if (hasWindowStorage()) {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  }

  if (!canUseNativePersistence()) {
    return;
  }

  await removePersistentEntries([AUTH_STORAGE_KEY]);
}
