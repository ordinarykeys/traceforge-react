import { create } from "zustand";
import { useEffect } from "react";
import { setI18nLocale, type AppLocale } from "@/lib/i18n";
import {
  canUseNativePersistence,
  loadPersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

const LOCALE_STORAGE_KEY = "traceforge.ui.locale";
const LEGACY_LOCALE_STORAGE_KEY = "tf-locale";

interface LocaleState {
  locale: AppLocale;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: AppLocale) => void;
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeLocale(value: string | null | undefined): AppLocale {
  if (
    value === "zh-CN" ||
    value === "en-US" ||
    value === "ja-JP" ||
    value === "ko-KR" ||
    value === "fr-FR" ||
    value === "de-DE" ||
    value === "es-ES" ||
    value === "ru-RU"
  ) {
    return value;
  }
  return "zh-CN";
}

async function persistLocale(locale: AppLocale) {
  if (hasWindowStorage()) {
    window.localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, locale);
  }

  if (!canUseNativePersistence()) {
    return;
  }

  await savePersistentEntries([{ key: LOCALE_STORAGE_KEY, value: locale }]);
}

async function loadLocale(): Promise<AppLocale> {
  if (canUseNativePersistence()) {
    const entries = await loadPersistentEntries([LOCALE_STORAGE_KEY]);
    const nativeValue = entries[LOCALE_STORAGE_KEY];
    if (nativeValue) {
      const locale = normalizeLocale(nativeValue);
      if (hasWindowStorage()) {
        window.localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, locale);
      }
      return locale;
    }
  }

  return normalizeLocale(
    hasWindowStorage() ? window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY) : null,
  );
}

const useLocaleStoreBase = create<LocaleState>((set, get) => ({
  locale: normalizeLocale(
    typeof window !== "undefined" ? window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY) : null,
  ),
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    const locale = await loadLocale();
    setI18nLocale(locale);
    set({ locale, hydrated: true });
  },
  setLocale: (locale) => {
    setI18nLocale(locale);
    set({ locale });
    void persistLocale(locale);
  },
}));

export function useLocaleStore() {
  const state = useLocaleStoreBase();
  const hydrate = state.hydrate;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return state;
}
