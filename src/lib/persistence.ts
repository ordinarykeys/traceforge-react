export type PersistentStateEntry = {
  key: string;
  value: string;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

function getHostWindow() {
  if (typeof window === "undefined") {
    return null;
  }

  return window as TauriWindow;
}

export function canUseNativePersistence() {
  return Boolean(getHostWindow()?.__TAURI_INTERNALS__);
}

async function invokeNative<T>(command: string, payload: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, payload);
}

export async function loadPersistentEntries(keys: string[]) {
  if (!keys.length || !canUseNativePersistence()) {
    return {} as Record<string, string>;
  }

  return invokeNative<Record<string, string>>("load_state_entries", { keys });
}

export async function savePersistentEntries(entries: PersistentStateEntry[]) {
  if (!entries.length || !canUseNativePersistence()) {
    return;
  }

  await invokeNative<void>("save_state_entries", { entries });
}

export async function removePersistentEntries(keys: string[]) {
  if (!keys.length || !canUseNativePersistence()) {
    return;
  }

  await invokeNative<void>("remove_state_entries", { keys });
}
