import {
  canUseNativePersistence,
  loadPersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

import {
  createRequestDocument,
  type RequestCollection,
  type RequestDocument,
  type RequestHistoryEntry,
} from "./requestTypes";

const REQUESTS_STORAGE_KEY = "traceforge.request.tabs";
const REQUESTS_STORAGE_BACKUP_KEY = "traceforge.request.tabs.backup";
const ACTIVE_REQUEST_STORAGE_KEY = "traceforge.request.active";
const COLLECTIONS_STORAGE_KEY = "traceforge.request.collections";
const COLLECTIONS_STORAGE_BACKUP_KEY = "traceforge.request.collections.backup";
const HISTORY_STORAGE_KEY = "traceforge.request.history";
const HISTORY_STORAGE_BACKUP_KEY = "traceforge.request.history.backup";

export type StorageNoticeTone = "info" | "error";

export type StorageLoadResult<T> = {
  value: T;
  notice?: string;
  tone?: StorageNoticeTone;
};

export type RequestWorkspaceState = {
  requests: RequestDocument[];
  collections: RequestCollection[];
  activeRequestId: string;
};

type WorkspaceSnapshotEntries = Record<string, string>;

function isRequestHistoryArray(value: unknown): value is RequestHistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "id" in item &&
        "method" in item &&
        "url" in item &&
        "snapshot" in item,
    )
  );
}

function isRequestDocumentArray(value: unknown): value is RequestDocument[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && "id" in item && "method" in item)
  );
}

function isRequestCollectionArray(value: unknown): value is RequestCollection[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && "id" in item && "name" in item)
  );
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createDefaultCollection(): RequestCollection {
  const now = Date.now();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${now}-collection`,
    name: "Default Workspace",
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultWorkspaceState(): RequestWorkspaceState {
  const collection = createDefaultCollection();
  const request = createRequestDocument({ collectionId: collection.id });
  return {
    requests: [request],
    collections: [collection],
    activeRequestId: request.id,
  };
}

function tryParseStoredValue<T>(
  raw: string,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadLocalWithBackup<T>(
  storageKey: string,
  backupKey: string,
  label: string,
  fallbackFactory: () => T,
  validate: (value: unknown) => value is T,
): StorageLoadResult<T> {
  if (!hasWindowStorage()) {
    return { value: fallbackFactory() };
  }

  const raw = window.localStorage.getItem(storageKey);
  if (raw) {
    const parsed = tryParseStoredValue(raw, validate);
    if (parsed) {
      return { value: parsed };
    }
  }

  const backupRaw = window.localStorage.getItem(backupKey);
  if (backupRaw) {
    const parsedBackup = tryParseStoredValue(backupRaw, validate);
    if (parsedBackup) {
      window.localStorage.setItem(storageKey, backupRaw);
      return {
        value: parsedBackup,
        notice: `${label} restored from local backup`,
        tone: "info",
      };
    }
  }

  const fallback = fallbackFactory();
  const serialized = JSON.stringify(fallback);
  window.localStorage.setItem(backupKey, raw ?? serialized);
  window.localStorage.setItem(storageKey, serialized);

  if (raw || backupRaw) {
    return {
      value: fallback,
      notice: `${label} cache was corrupted and reset`,
      tone: "error",
    };
  }

  return { value: fallback };
}

function loadLocalRequestWorkspaceState(): StorageLoadResult<RequestWorkspaceState> {
  const fallbackWorkspace = createDefaultWorkspaceState();
  const collectionsResult = loadLocalWithBackup(
    COLLECTIONS_STORAGE_KEY,
    COLLECTIONS_STORAGE_BACKUP_KEY,
    "Collections",
    () => fallbackWorkspace.collections,
    isRequestCollectionArray,
  );
  const fallbackCollectionId =
    collectionsResult.value[0]?.id ?? fallbackWorkspace.collections[0].id;
  const requestsResult = loadLocalWithBackup(
    REQUESTS_STORAGE_KEY,
    REQUESTS_STORAGE_BACKUP_KEY,
    "Requests",
    () => [createRequestDocument({ collectionId: fallbackCollectionId })],
    isRequestDocumentArray,
  );

  const requestIds = new Set(requestsResult.value.map((request) => request.id));
  const storedActiveId = hasWindowStorage()
    ? window.localStorage.getItem(ACTIVE_REQUEST_STORAGE_KEY)
    : null;
  const activeRequestId =
    storedActiveId && requestIds.has(storedActiveId)
      ? storedActiveId
      : requestsResult.value[0]?.id ?? fallbackWorkspace.activeRequestId;
  const notices = [collectionsResult.notice, requestsResult.notice].filter(
    (message): message is string => Boolean(message),
  );

  return {
    value: {
      requests: requestsResult.value,
      collections: collectionsResult.value,
      activeRequestId,
    },
    notice: notices.length > 0 ? notices.join("; ") : undefined,
    tone:
      collectionsResult.tone === "error" || requestsResult.tone === "error"
        ? "error"
        : notices.length > 0
          ? "info"
          : undefined,
  };
}

function saveLocalRequestWorkspaceState(state: RequestWorkspaceState) {
  if (!hasWindowStorage()) {
    return;
  }

  const serializedRequests = JSON.stringify(state.requests);
  const serializedCollections = JSON.stringify(state.collections);
  const existingRequests = window.localStorage.getItem(REQUESTS_STORAGE_KEY);
  const existingCollections = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);

  window.localStorage.setItem(
    REQUESTS_STORAGE_BACKUP_KEY,
    existingRequests ?? serializedRequests,
  );
  window.localStorage.setItem(REQUESTS_STORAGE_KEY, serializedRequests);
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_BACKUP_KEY,
    existingCollections ?? serializedCollections,
  );
  window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, serializedCollections);
  window.localStorage.setItem(ACTIVE_REQUEST_STORAGE_KEY, state.activeRequestId);
}

function loadLocalHistory(): RequestHistoryEntry[] {
  if (!hasWindowStorage()) {
    return [];
  }

  const direct = window.localStorage.getItem(HISTORY_STORAGE_KEY);
  const backup = window.localStorage.getItem(HISTORY_STORAGE_BACKUP_KEY);
  return (
    (direct ? tryParseStoredValue(direct, isRequestHistoryArray) : null) ??
    (backup ? tryParseStoredValue(backup, isRequestHistoryArray) : null) ??
    []
  );
}

function saveLocalHistory(history: RequestHistoryEntry[]) {
  if (!hasWindowStorage()) {
    return;
  }

  const serialized = JSON.stringify(history);
  const existingHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
  window.localStorage.setItem(HISTORY_STORAGE_BACKUP_KEY, existingHistory ?? serialized);
  window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
}

async function persistNativeWorkspaceState(
  state: RequestWorkspaceState,
  existingEntries?: WorkspaceSnapshotEntries,
) {
  const currentEntries =
    existingEntries ??
    (await loadPersistentEntries([REQUESTS_STORAGE_KEY, COLLECTIONS_STORAGE_KEY]));

  const serializedRequests = JSON.stringify(state.requests);
  const serializedCollections = JSON.stringify(state.collections);

  await savePersistentEntries([
    {
      key: REQUESTS_STORAGE_BACKUP_KEY,
      value: currentEntries[REQUESTS_STORAGE_KEY] ?? serializedRequests,
    },
    {
      key: REQUESTS_STORAGE_KEY,
      value: serializedRequests,
    },
    {
      key: COLLECTIONS_STORAGE_BACKUP_KEY,
      value: currentEntries[COLLECTIONS_STORAGE_KEY] ?? serializedCollections,
    },
    {
      key: COLLECTIONS_STORAGE_KEY,
      value: serializedCollections,
    },
    {
      key: ACTIVE_REQUEST_STORAGE_KEY,
      value: state.activeRequestId,
    },
  ]);
}

async function loadNativeRequestWorkspaceState(): Promise<StorageLoadResult<RequestWorkspaceState>> {
  const keys = [
    REQUESTS_STORAGE_KEY,
    REQUESTS_STORAGE_BACKUP_KEY,
    ACTIVE_REQUEST_STORAGE_KEY,
    COLLECTIONS_STORAGE_KEY,
    COLLECTIONS_STORAGE_BACKUP_KEY,
  ];
  const entries = await loadPersistentEntries(keys);
  const hasNativeSnapshot = keys.some((key) => typeof entries[key] === "string");

  if (!hasNativeSnapshot) {
    const fallback = createDefaultWorkspaceState();
    await persistNativeWorkspaceState(fallback, {});
    return { value: fallback };
  }

  const fallbackWorkspace = createDefaultWorkspaceState();
  const parsedCollections = entries[COLLECTIONS_STORAGE_KEY]
    ? tryParseStoredValue(entries[COLLECTIONS_STORAGE_KEY], isRequestCollectionArray)
    : null;
  const parsedCollectionsBackup = entries[COLLECTIONS_STORAGE_BACKUP_KEY]
    ? tryParseStoredValue(entries[COLLECTIONS_STORAGE_BACKUP_KEY], isRequestCollectionArray)
    : null;

  let collections = parsedCollections;
  let collectionsNotice: string | undefined;
  let collectionsTone: StorageNoticeTone | undefined;

  if (!collections) {
    if (parsedCollectionsBackup) {
      collections = parsedCollectionsBackup;
      collectionsNotice = "Collections restored from install-directory backup";
      collectionsTone = "info";
    } else {
      collections = fallbackWorkspace.collections;
      collectionsNotice = "Collections were corrupted and reset to defaults";
      collectionsTone = "error";
    }
  }

  const fallbackCollectionId = collections[0]?.id ?? fallbackWorkspace.collections[0].id;
  const parsedRequests = entries[REQUESTS_STORAGE_KEY]
    ? tryParseStoredValue(entries[REQUESTS_STORAGE_KEY], isRequestDocumentArray)
    : null;
  const parsedRequestsBackup = entries[REQUESTS_STORAGE_BACKUP_KEY]
    ? tryParseStoredValue(entries[REQUESTS_STORAGE_BACKUP_KEY], isRequestDocumentArray)
    : null;

  let requests = parsedRequests;
  let requestsNotice: string | undefined;
  let requestsTone: StorageNoticeTone | undefined;

  if (!requests) {
    if (parsedRequestsBackup) {
      requests = parsedRequestsBackup;
      requestsNotice = "Requests restored from install-directory backup";
      requestsTone = "info";
    } else {
      requests = [createRequestDocument({ collectionId: fallbackCollectionId })];
      requestsNotice = "Requests were corrupted and reset to defaults";
      requestsTone = "error";
    }
  }

  const requestIds = new Set(requests.map((request) => request.id));
  const storedActiveId = entries[ACTIVE_REQUEST_STORAGE_KEY];
  const activeRequestId =
    storedActiveId && requestIds.has(storedActiveId)
      ? storedActiveId
      : requests[0]?.id ?? fallbackWorkspace.activeRequestId;

  const workspaceState = {
    requests,
    collections,
    activeRequestId,
  };

  if (!parsedCollections || !parsedRequests || (storedActiveId && !requestIds.has(storedActiveId))) {
    await persistNativeWorkspaceState(workspaceState, entries);
  }

  const notices = [collectionsNotice, requestsNotice].filter(
    (message): message is string => Boolean(message),
  );

  return {
    value: workspaceState,
    notice: notices.length > 0 ? notices.join("; ") : undefined,
    tone:
      collectionsTone === "error" || requestsTone === "error"
        ? "error"
        : notices.length > 0
          ? "info"
          : undefined,
  };
}

export async function loadRequestWorkspaceState(): Promise<StorageLoadResult<RequestWorkspaceState>> {
  if (!canUseNativePersistence()) {
    return loadLocalRequestWorkspaceState();
  }

  return loadNativeRequestWorkspaceState();
}

export async function saveRequestWorkspaceState(state: RequestWorkspaceState) {
  if (!canUseNativePersistence()) {
    saveLocalRequestWorkspaceState(state);
    return;
  }

  await persistNativeWorkspaceState(state);
}

export async function loadRequestHistory() {
  if (!canUseNativePersistence()) {
    return loadLocalHistory();
  }

  const entries = await loadPersistentEntries([HISTORY_STORAGE_KEY, HISTORY_STORAGE_BACKUP_KEY]);
  const parsed =
    (entries[HISTORY_STORAGE_KEY]
      ? tryParseStoredValue(entries[HISTORY_STORAGE_KEY], isRequestHistoryArray)
      : null) ??
    (entries[HISTORY_STORAGE_BACKUP_KEY]
      ? tryParseStoredValue(entries[HISTORY_STORAGE_BACKUP_KEY], isRequestHistoryArray)
      : null);

  return parsed ?? [];
}

export async function saveRequestHistory(history: RequestHistoryEntry[]) {
  if (!canUseNativePersistence()) {
    saveLocalHistory(history);
    return;
  }

  const serialized = JSON.stringify(history);
  const existingEntries = await loadPersistentEntries([HISTORY_STORAGE_KEY]);
  await savePersistentEntries([
    {
      key: HISTORY_STORAGE_BACKUP_KEY,
      value: existingEntries[HISTORY_STORAGE_KEY] ?? serialized,
    },
    {
      key: HISTORY_STORAGE_KEY,
      value: serialized,
    },
  ]);
}
