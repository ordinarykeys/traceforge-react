import { create } from "zustand";
import { useEffect } from "react";
import { loadThemeSettings, saveThemeSettings, syncThemeSettingsToLocalStorage, type ThemeSettingsSnapshot } from "@/lib/settingsStorage";

export type Theme = "zinc" | "slate" | "stone" | "gray" | "neutral";
export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  uiFontSize: number;
  codeFontSize: number;
  minimap: boolean;
  lineNumbers: boolean;
  contrast: number;
  isTranslucent: boolean;
  usePointerCursor: boolean;
  fontFamily: string;
  setTheme: (theme: Theme) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDark: () => void;
  setUiFontSize: (size: number) => void;
  setCodeFontSize: (size: number) => void;
  setMinimap: (enabled: boolean) => void;
  setLineNumbers: (enabled: boolean) => void;
  setContrast: (val: number) => void;
  setTranslucent: (enabled: boolean) => void;
  setPointerCursor: (enabled: boolean) => void;
  setFontFamily: (family: string) => void;
  hydrate: () => Promise<void>;
  hydrated: boolean;
}

const VALID_THEMES: Theme[] = ["zinc", "slate", "stone", "gray", "neutral"];

function resolveSystemDarkMode() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readLegacyThemeSettings(): ThemeSettingsSnapshot {
  const savedTheme = localStorage.getItem("tf-theme") as Theme;
  const initialTheme = VALID_THEMES.includes(savedTheme) ? savedTheme : "zinc";

  return {
    theme: initialTheme,
    isDark:
      localStorage.getItem("tf-dark") === "true" ||
      (localStorage.getItem("tf-dark") === null && resolveSystemDarkMode()),
    themeMode: (localStorage.getItem("tf-theme-mode") as ThemeMode) || "system",
    uiFontSize: parseInt(localStorage.getItem("tf-ui-font-size") || "13"),
    codeFontSize: parseInt(localStorage.getItem("tf-code-font-size") || "14"),
    minimap: localStorage.getItem("tf-minimap") !== "false",
    lineNumbers: localStorage.getItem("tf-line-numbers") !== "false",
    contrast: parseInt(localStorage.getItem("tf-contrast") || "45"),
    isTranslucent: localStorage.getItem("tf-translucent") !== "false",
    usePointerCursor: localStorage.getItem("tf-pointer-cursor") === "true",
    fontFamily: localStorage.getItem("tf-font-family") || "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
  };
}

function pickPersistedState(state: Pick<ThemeState, keyof ThemeSettingsSnapshot>): ThemeSettingsSnapshot {
  return {
    theme: state.theme,
    isDark: state.isDark,
    themeMode: state.themeMode,
    uiFontSize: state.uiFontSize,
    codeFontSize: state.codeFontSize,
    minimap: state.minimap,
    lineNumbers: state.lineNumbers,
    contrast: state.contrast,
    isTranslucent: state.isTranslucent,
    usePointerCursor: state.usePointerCursor,
    fontFamily: state.fontFamily,
  };
}

// 1. Create a global store using zustand
const useThemeStoreBase = create<ThemeState>((set, get) => {
  const initialState = readLegacyThemeSettings();

  const persistState = (patch: Partial<ThemeSettingsSnapshot>) => {
    const nextState = {
      ...pickPersistedState(get()),
      ...patch,
    };

    syncThemeSettingsToLocalStorage(nextState);
    void saveThemeSettings(nextState);
  };

  return {
    ...initialState,
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated) {
        return;
      }

      const loaded = await loadThemeSettings(readLegacyThemeSettings());
      set({
        ...loaded,
        hydrated: true,
      });
      syncThemeSettingsToLocalStorage(loaded);
    },
    setTheme: (theme) => {
      persistState({ theme });
      set({ theme });
    },
    setThemeMode: (mode) => {
      const isDark = mode === "dark" || (mode === "system" && resolveSystemDarkMode());
      persistState({ themeMode: mode, isDark });
      set({ themeMode: mode, isDark });
    },
    setUiFontSize: (size) => {
      persistState({ uiFontSize: size });
      set({ uiFontSize: size });
    },
    setCodeFontSize: (size) => {
      persistState({ codeFontSize: size });
      set({ codeFontSize: size });
    },
    setMinimap: (enabled) => {
      persistState({ minimap: enabled });
      set({ minimap: enabled });
    },
    setLineNumbers: (enabled) => {
      persistState({ lineNumbers: enabled });
      set({ lineNumbers: enabled });
    },
    setContrast: (val) => {
      persistState({ contrast: val });
      set({ contrast: val });
    },
    setTranslucent: (enabled) => {
      persistState({ isTranslucent: enabled });
      set({ isTranslucent: enabled });
    },
    setPointerCursor: (enabled) => {
      persistState({ usePointerCursor: enabled });
      set({ usePointerCursor: enabled });
    },
    toggleDark: () => set((state) => {
      const nextDark = !state.isDark;
      persistState({ isDark: nextDark });
      return { isDark: nextDark };
    }),
    setFontFamily: (family) => {
      persistState({ fontFamily: family });
      set({ fontFamily: family });
    },
  };
});

// 2. Export a hook that manages the side effects (DOM classes)
export function useThemeStore() {
  const { 
    theme, isDark, themeMode, uiFontSize, codeFontSize, minimap, lineNumbers, contrast, isTranslucent, usePointerCursor, fontFamily,
    setTheme, setThemeMode, toggleDark, setUiFontSize, setCodeFontSize, setMinimap, setLineNumbers, setContrast, setTranslucent, setPointerCursor, setFontFamily,
    hydrate
  } = useThemeStoreBase();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = window.document.documentElement;
    const classesToRemove = Array.from(root.classList).filter(c => c.startsWith("theme-"));
    classesToRemove.forEach(c => root.classList.remove(c));
    root.classList.add(`theme-${theme}`);

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (usePointerCursor) {
      root.style.setProperty("--cursor-pointer", "pointer");
    } else {
      root.style.removeProperty("--cursor-pointer");
    }
  }, [theme, isDark, usePointerCursor]);

  return {
    theme,
    isDark,
    themeMode,
    uiFontSize,
    codeFontSize,
    minimap,
    lineNumbers,
    contrast,
    isTranslucent,
    usePointerCursor,
    fontFamily,
    setTheme,
    setThemeMode,
    toggleDark,
    setUiFontSize,
    setCodeFontSize,
    setMinimap,
    setLineNumbers,
    setContrast,
    setTranslucent,
    setPointerCursor,
    setFontFamily
  };
}
