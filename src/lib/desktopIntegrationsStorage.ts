import {
  canUseNativePersistence,
  loadPersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

export type UpdateChannel = "stable" | "beta";

const CHANNEL_STORAGE_KEY = "traceforge.desktop.update-channel";
const LEGACY_CHANNEL_KEY = "tf-update-channel";

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeChannel(value: string | null | undefined): UpdateChannel {
  return value === "beta" ? "beta" : "stable";
}

async function persistChannel(channel: UpdateChannel) {
  if (hasWindowStorage()) {
    window.localStorage.setItem(LEGACY_CHANNEL_KEY, channel);
  }

  if (!canUseNativePersistence()) {
    return;
  }

  await savePersistentEntries([{ key: CHANNEL_STORAGE_KEY, value: channel }]);
}

export async function loadUpdateChannel(): Promise<UpdateChannel> {
  if (canUseNativePersistence()) {
    const entries = await loadPersistentEntries([CHANNEL_STORAGE_KEY]);
    const nativeValue = entries[CHANNEL_STORAGE_KEY];
    if (nativeValue) {
      const channel = normalizeChannel(nativeValue);
      if (hasWindowStorage()) {
        window.localStorage.setItem(LEGACY_CHANNEL_KEY, channel);
      }
      return channel;
    }
  }

  return normalizeChannel(
    hasWindowStorage() ? window.localStorage.getItem(LEGACY_CHANNEL_KEY) : null,
  );
}

export async function saveUpdateChannel(channel: UpdateChannel) {
  await persistChannel(channel);
}
