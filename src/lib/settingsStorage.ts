import { canUseNativePersistence, loadPersistentEntries, savePersistentEntries } from "@/lib/persistence";

const SETTINGS_STORAGE_KEY = "traceforge.ui.settings";

export type ThemeSettingValue = "zinc" | "slate" | "stone" | "gray" | "neutral";
export type ThemeModeSettingValue = "light" | "dark" | "system";

export type ThemeSettingsSnapshot = {
  theme: ThemeSettingValue;
  isDark: boolean;
  themeMode: ThemeModeSettingValue;
  uiFontSize: number;
  codeFontSize: number;
  minimap: boolean;
  lineNumbers: boolean;
  contrast: number;
  isTranslucent: boolean;
  usePointerCursor: boolean;
  fontFamily: string;
};

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isValidTheme(value: string): value is ThemeSettingValue {
  return ["zinc", "slate", "stone", "gray", "neutral"].includes(value);
}

function isValidThemeMode(value: string): value is ThemeModeSettingValue {
  return ["light", "dark", "system"].includes(value);
}

function parseStoredSettings(
  raw: string | null | undefined,
  fallback: ThemeSettingsSnapshot,
): ThemeSettingsSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ThemeSettingsSnapshot>;
    return {
      theme: typeof parsed.theme === "string" && isValidTheme(parsed.theme) ? parsed.theme : fallback.theme,
      isDark: typeof parsed.isDark === "boolean" ? parsed.isDark : fallback.isDark,
      themeMode: typeof parsed.themeMode === "string" && isValidThemeMode(parsed.themeMode) ? parsed.themeMode : fallback.themeMode,
      uiFontSize: typeof parsed.uiFontSize === "number" ? parsed.uiFontSize : fallback.uiFontSize,
      codeFontSize: typeof parsed.codeFontSize === "number" ? parsed.codeFontSize : fallback.codeFontSize,
      minimap: typeof parsed.minimap === "boolean" ? parsed.minimap : fallback.minimap,
      lineNumbers: typeof parsed.lineNumbers === "boolean" ? parsed.lineNumbers : fallback.lineNumbers,
      contrast: typeof parsed.contrast === "number" ? parsed.contrast : fallback.contrast,
      isTranslucent: typeof parsed.isTranslucent === "boolean" ? parsed.isTranslucent : fallback.isTranslucent,
      usePointerCursor: typeof parsed.usePointerCursor === "boolean" ? parsed.usePointerCursor : fallback.usePointerCursor,
      fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily : fallback.fontFamily,
    };
  } catch (error) {
    console.error("Failed to parse stored theme settings", error);
    return null;
  }
}

export function syncThemeSettingsToLocalStorage(settings: ThemeSettingsSnapshot) {
  if (!hasWindowStorage()) {
    return;
  }

  window.localStorage.setItem("tf-theme", settings.theme);
  window.localStorage.setItem("tf-dark", String(settings.isDark));
  window.localStorage.setItem("tf-theme-mode", settings.themeMode);
  window.localStorage.setItem("tf-ui-font-size", String(settings.uiFontSize));
  window.localStorage.setItem("tf-code-font-size", String(settings.codeFontSize));
  window.localStorage.setItem("tf-minimap", String(settings.minimap));
  window.localStorage.setItem("tf-line-numbers", String(settings.lineNumbers));
  window.localStorage.setItem("tf-contrast", String(settings.contrast));
  window.localStorage.setItem("tf-translucent", String(settings.isTranslucent));
  window.localStorage.setItem("tf-pointer-cursor", String(settings.usePointerCursor));
  window.localStorage.setItem("tf-font-family", settings.fontFamily);
}

export async function loadThemeSettings(fallback: ThemeSettingsSnapshot) {
  if (!canUseNativePersistence()) {
    return fallback;
  }

  const entries = await loadPersistentEntries([SETTINGS_STORAGE_KEY]);
  const nativeSettings = parseStoredSettings(entries[SETTINGS_STORAGE_KEY], fallback);
  if (nativeSettings) {
    syncThemeSettingsToLocalStorage(nativeSettings);
    return nativeSettings;
  }

  await saveThemeSettings(fallback);
  return fallback;
}

export async function saveThemeSettings(settings: ThemeSettingsSnapshot) {
  syncThemeSettingsToLocalStorage(settings);

  if (!canUseNativePersistence()) {
    return;
  }

  await savePersistentEntries([
    {
      key: SETTINGS_STORAGE_KEY,
      value: JSON.stringify(settings),
    },
  ]);
}
