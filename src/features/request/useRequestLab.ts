import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useClipboard } from "@vueuse/core";
import { toast } from "vue-sonner";

import { sendHttpRequest } from "@/lib/requestHost";

import {
  executePostRequestAndTests,
  executePreRequestScript,
  interpolateHeaders,
  interpolateString,
  type SandboxRequestContext,
} from "./requestSandbox";
import {
  parseCookieBatchText,
  parseResponseCookies,
  serializeCookieRows,
} from "./requestCookies";
import { parseCurlCommand } from "./requestCurl";
import {
  cloneRequestDocument,
  createFormDataField,
  createKeyValueRow,
  createRequestDocument,
  type CookieBatchMode,
  HTTP_METHODS,
  REQUEST_AUTH_TYPES,
  REQUEST_BODY_TYPES,
  RESPONSE_ENCODINGS,
  type KeyValueRow,
  type RequestCollection,
  type RequestDocument,
  type RequestEditorTab,
  type RequestHistoryEntry,
  type ResponseCookie,
  type RequestResponse,
  type RequestResponseState,
  type RequestTimeline,
  type ResponseBodyView,
  type ResponseEncoding,
  type ResponseTab,
  type ScriptTab,
} from "./requestTypes";
import {
  loadRequestHistory,
  loadRequestWorkspaceState,
  saveRequestHistory,
  saveRequestWorkspaceState,
} from "./requestStorage";

type FlashTone = "info" | "success" | "error";

const REQUEST_EDITOR_TABS: Array<{ key: RequestEditorTab; label: string }> = [
  { key: "query", label: "Query" },
  { key: "body", label: "Body" },
  { key: "headers", label: "Header" },
  { key: "cookies", label: "Cookie" },
  { key: "auth", label: "璁よ瘉" },
  { key: "vars", label: "鍙橀噺" },
  { key: "script", label: "鑴氭湰" },
  { key: "tests", label: "娴嬭瘯" },
];

const RESPONSE_TABS: Array<{ key: ResponseTab; label: string }> = [
  { key: "body", label: "Response" },
  { key: "headers", label: "Headers" },
  { key: "cookies", label: "Cookies" },
  { key: "tests", label: "娴嬭瘯" },
  { key: "timeline", label: "Timeline" },
];

function createEmptyResponseState(): RequestResponseState {
  return {
    response: null,
    error: null,
    loading: false,
    imageUrl: null,
    decodedBody: "",
    timeline: null,
  };
}

function ensureRequestRows(rows: KeyValueRow[]) {
  return rows.length > 0 ? rows : [createKeyValueRow()];
}

function rowsToRecord(rows: KeyValueRow[]) {
  const record: Record<string, string> = {};
  rows
    .filter((row) => row.enabled && row.key.trim())
    .forEach((row) => {
      record[row.key.trim()] = row.value;
    });
  return record;
}

function appendQueryParams(url: string, rows: KeyValueRow[]) {
  const queryString = rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
    .join("&");

  if (!queryString) {
    return url;
  }

  return url.includes("?") ? `${url}&${queryString}` : `${url}?${queryString}`;
}

function hasHeader(headers: Record<string, string>, headerName: string) {
  const lower = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBytes(bytes: Uint8Array, encoding: ResponseEncoding) {
  if (encoding === "base64") {
    return btoa(String.fromCharCode(...bytes));
  }

  try {
    return new TextDecoder(encoding === "iso-8859-1" ? "iso-8859-1" : encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function buildBasicAuth(username: string, password: string) {
  const raw = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  raw.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function quoteCurlValue(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function deriveRequestTitle(request: RequestDocument) {
  if (request.name.trim()) {
    return request.name.trim();
  }

  if (!request.url.trim()) {
    return "鏂板缓璇锋眰";
  }

  try {
    const parsed = new URL(request.url);
    return (parsed.pathname === "/" ? parsed.host : parsed.pathname).slice(0, 28);
  } catch {
    return request.url.trim().slice(0, 28);
  }
}

function buildTimeline(
  method: string,
  url: string,
  requestHeaders: Record<string, string>,
  requestBody: string,
  response: RequestResponse,
): RequestTimeline {
  return {
    requestLine: `${method} ${url}`,
    requestHeaders: Object.entries(requestHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n"),
    requestBody,
    responseLine: `HTTP ${response.status} ${response.statusText}`.trim(),
    responseHeaders: Object.entries(response.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n"),
    startedAt: Date.now() - response.time,
    duration: response.time,
    size: response.size,
  };
}

function normalizeRequests(requests: RequestDocument[], fallbackCollectionId: string) {
  return requests.map((request) => ({
    ...request,
    collectionId: request.collectionId || fallbackCollectionId,
    headers: ensureRequestRows(request.headers || []),
    params: ensureRequestRows(request.params || []),
    cookies: ensureRequestRows(request.cookies || []),
    vars: ensureRequestRows(request.vars || []),
    formDataFields:
      request.formDataFields && request.formDataFields.length > 0
        ? request.formDataFields.map((field) => ({ ...field }))
        : [createFormDataField()],
  }));
}

function createInitialCollection(): RequestCollection {
  const now = Date.now();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${now}-collection`,
    name: "Default Workspace",
    createdAt: now,
    updatedAt: now,
  };
}

function createInitialWorkspaceState() {
  const collection = createInitialCollection();
  const request = createRequestDocument({
    collectionId: collection.id,
  });

  return {
    collections: [collection],
    requests: [request],
    activeRequestId: request.id,
  };
}

function isBlankRow(row: KeyValueRow) {
  return !row.key.trim() && !row.value.trim() && !row.description.trim();
}

function isBlankFormField(field: RequestDocument["formDataFields"][number]) {
  return !field.key.trim() && !field.value.trim() && !field.description.trim();
}

function isRequestPristine(request: RequestDocument) {
  return (
    request.method === "GET" &&
    !request.url.trim() &&
    !request.body.trim() &&
    request.bodyType === "none" &&
    request.headers.every(isBlankRow) &&
    request.params.every(isBlankRow) &&
    request.cookies.every(isBlankRow) &&
    request.vars.every(isBlankRow) &&
    request.formDataFields.every(isBlankFormField) &&
    request.auth.type === "none" &&
    !request.preRequestScript.trim() &&
    !request.postRequestScript.trim() &&
    !request.tests.trim()
  );
}

export function useRequestLab() {
  const { copy } = useClipboard({ legacy: true });

  const initialWorkspaceState = createInitialWorkspaceState();
  const collections = ref<RequestCollection[]>(initialWorkspaceState.collections);
  const requests = ref<RequestDocument[]>(
    normalizeRequests(initialWorkspaceState.requests, initialWorkspaceState.collections[0].id),
  );
  const activeRequestId = ref(initialWorkspaceState.activeRequestId);
  const requestSearch = ref("");
  const workspaceVisible = ref(false);
  const historyVisible = ref(false);
  const saveDialogVisible = ref(false);
  const curlImportVisible = ref(false);
  const curlImportText = ref("");
  const curlImportWarnings = ref<string[]>([]);
  const saveDraftName = ref("");
  const saveDraftCollectionId = ref(initialWorkspaceState.collections[0]?.id ?? "");
  const showCookieBatchDialog = ref(false);
  const cookieBatchMode = ref<CookieBatchMode>("key-value");
  const cookieBatchText = ref("");
  const activeEditorTab = ref<RequestEditorTab>("query");
  const activeScriptTab = ref<ScriptTab>("pre");
  const activeResponseTab = ref<ResponseTab>("body");
  const responseEncoding = ref<ResponseEncoding>("utf-8");
  const responseBodyView = ref<ResponseBodyView>("pretty");
  const splitRatio = ref(0.5);
  const storageHydrated = ref(false);
  const requestHistory = ref<RequestHistoryEntry[]>([]);

  const responseStates = ref<Record<string, RequestResponseState>>({});
  const formDataFiles = ref<Record<string, Record<number, File>>>({});
  let workspacePersistTimer: number | null = null;

  function ensureResponseState(requestId: string) {
    if (!responseStates.value[requestId]) {
      responseStates.value[requestId] = createEmptyResponseState();
    }
    return responseStates.value[requestId];
  }

  function syncResponseStateKeys() {
    const requestIds = new Set(requests.value.map((request) => request.id));
    requests.value.forEach((request) => ensureResponseState(request.id));
    Object.keys(responseStates.value).forEach((id) => {
      if (!requestIds.has(id)) {
        const imageUrl = responseStates.value[id]?.imageUrl;
        if (imageUrl) {
          URL.revokeObjectURL(imageUrl);
        }
        delete responseStates.value[id];
      }
    });
  }

  function resetResponseState(requestId: string) {
    clearImageUrl(requestId);
    responseStates.value[requestId] = createEmptyResponseState();
  }

  function showFlash(text: string, tone: FlashTone = "info") {
    if (tone === "success") {
      toast.success(text, { duration: 1500 });
      return;
    }

    if (tone === "error") {
      toast.error(text, { duration: 1800 });
      return;
    }

    toast(text, { duration: 1500 });
  }

  async function persistHistory(entries = requestHistory.value) {
    try {
      await saveRequestHistory(entries);
    } catch (error) {
      console.warn("Failed to persist request history", error);
      showFlash("请求历史保存失败，请确认数据目录可写", "error");
    }
  }

  async function persistWorkspaceNow() {
    workspacePersistTimer = null;
    if (!storageHydrated.value) {
      return;
    }

    try {
      await saveRequestWorkspaceState({
        requests: normalizeRequests(requests.value, collections.value[0]?.id ?? ""),
        collections: collections.value,
        activeRequestId:
          activeRequestId.value || requests.value[0]?.id || initialWorkspaceState.activeRequestId,
      });
    } catch (error) {
      console.warn("Failed to persist request workspace", error);
      showFlash("请求工作区保存失败，请确认安装目录可写", "error");
    }
  }

  function scheduleWorkspacePersist() {
    if (typeof window === "undefined") {
      return;
    }

    if (workspacePersistTimer) {
      window.clearTimeout(workspacePersistTimer);
    }

    workspacePersistTimer = window.setTimeout(() => {
      void persistWorkspaceNow();
    }, 240);
  }

  async function hydrateWorkspace() {
    try {
      const loadState = await loadRequestWorkspaceState();
      const loadedHistory = await loadRequestHistory();
      collections.value = loadState.value.collections;
      requests.value = normalizeRequests(
        loadState.value.requests,
        loadState.value.collections[0]?.id ?? "",
      );
      requestHistory.value = loadedHistory;
      activeRequestId.value =
        loadState.value.activeRequestId || loadState.value.requests[0]?.id || activeRequestId.value;
      saveDraftCollectionId.value = loadState.value.collections[0]?.id ?? "";

      if (loadState.notice) {
        showFlash(loadState.notice, loadState.tone ?? "info");
      }
    } catch (error) {
      console.warn("Failed to hydrate request workspace", error);
      showFlash("请求工作区读取失败，已使用默认内容", "error");
    } finally {
      storageHydrated.value = true;
    }
  }

  const activeRequest = computed(() => {
    let target = requests.value.find((request) => request.id === activeRequestId.value);
    if (!target) {
      target = requests.value[0];
      if (target) {
        activeRequestId.value = target.id;
      }
    }
    return target;
  });

  const activeResponseState = computed(() => {
    const requestId = activeRequest.value?.id;
    return requestId ? ensureResponseState(requestId) : createEmptyResponseState();
  });

  const filteredRequests = computed(() => {
    const keyword = requestSearch.value.trim().toLowerCase();
    if (!keyword) {
      return requests.value;
    }

    return requests.value.filter((request) =>
      [request.name, request.url]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  });

  const groupedRequests = computed(() =>
    collections.value.map((collection) => ({
      ...collection,
      requests: filteredRequests.value.filter((request) => request.collectionId === collection.id),
    })),
  );

  const requestEditorTabs = computed(() =>
    REQUEST_EDITOR_TABS.map((tab) => ({
      ...tab,
      count:
        tab.key === "query"
          ? activeRequest.value?.params.filter((row) => row.enabled && row.key.trim()).length ?? 0
          : tab.key === "headers"
            ? activeRequest.value?.headers.filter((row) => row.enabled && row.key.trim()).length ?? 0
            : tab.key === "cookies"
              ? activeRequest.value?.cookies.filter((row) => row.enabled && row.key.trim()).length ?? 0
              : tab.key === "vars"
                ? activeRequest.value?.vars.filter((row) => row.enabled && row.key.trim()).length ?? 0
                : 0,
    })),
  );

  const responseTabs = RESPONSE_TABS;

  const formattedResponseBody = computed(() => {
    const state = activeResponseState.value;
    const response = state.response;
    if (!response) {
      return "";
    }

    if (responseBodyView.value === "raw") {
      return state.decodedBody;
    }

    if ((response.headers["content-type"] || "").includes("json")) {
      return formatJson(state.decodedBody);
    }

    return state.decodedBody;
  });

  const responseContentType = computed(
    () => activeResponseState.value.response?.headers["content-type"] || "",
  );

  const responseSummary = computed(() => {
    const response = activeResponseState.value.response;
    if (!response) {
      return null;
    }

    return {
      status: `${response.status} ${response.statusText}`.trim(),
      time: `${response.time} ms`,
      size: formatBytes(response.size),
    };
  });

  const responseCookies = computed<ResponseCookie[]>(() =>
    parseResponseCookies(activeResponseState.value.response?.setCookies ?? []),
  );

  watch(
    requests,
    () => {
      if (storageHydrated.value) {
        scheduleWorkspacePersist();
      }
    },
    { deep: true },
  );

  watch(
    collections,
    () => {
      if (storageHydrated.value) {
        scheduleWorkspacePersist();
      }
    },
    { deep: true },
  );

  watch(
    () => requests.value.map((request) => request.id).join("|"),
    () => {
      syncResponseStateKeys();
    },
    { immediate: true },
  );

  watch(activeRequestId, (value) => {
    if (value && storageHydrated.value) {
      scheduleWorkspacePersist();
    }
  });

  watch(responseEncoding, () => {
    redecodeActiveResponse();
  });

  watch(cookieBatchMode, () => {
    if (showCookieBatchDialog.value) {
      syncCookieBatchText();
    }
  });

  function touchRequest(request: RequestDocument) {
    request.updatedAt = Date.now();
  }

  function selectRequestTab(requestId: string) {
    activeRequestId.value = requestId;
  }

  function toggleWorkspace() {
    workspaceVisible.value = !workspaceVisible.value;
    if (workspaceVisible.value) {
      historyVisible.value = false;
    }
  }

  function toggleHistory() {
    historyVisible.value = !historyVisible.value;
    if (historyVisible.value) {
      workspaceVisible.value = false;
    }
  }

  function openCurlImportDialog() {
    curlImportVisible.value = true;
    curlImportWarnings.value = [];
    historyVisible.value = false;
    workspaceVisible.value = false;
  }

  function closeCurlImportDialog() {
    curlImportVisible.value = false;
  }

  function recordRequestHistory(entry: RequestHistoryEntry) {
    requestHistory.value = [entry, ...requestHistory.value.filter((item) => item.id !== entry.id)].slice(0, 40);
    void persistHistory();
  }

  function removeHistoryEntry(entryId: string) {
    requestHistory.value = requestHistory.value.filter((entry) => entry.id !== entryId);
    void persistHistory();
    showFlash("历史记录已删除", "info");
  }

  function clearRequestHistory() {
    requestHistory.value = [];
    void persistHistory();
    showFlash("请求历史已清空", "info");
  }

  function restoreHistoryEntry(entry: RequestHistoryEntry) {
    const collectionId =
      entry.snapshot.collectionId &&
      collections.value.some((collection) => collection.id === entry.snapshot.collectionId)
        ? entry.snapshot.collectionId
        : collections.value[0]?.id;
    const restored = createRequestDocument({
      ...cloneRequestDocument(entry.snapshot),
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-history`,
      collectionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    requests.value.unshift(restored);
    activeRequestId.value = restored.id;
    historyVisible.value = false;
    showFlash("已从历史记录恢复到新标签页", "success");
  }

  function addRequestTab() {
    const request = createRequestDocument({
      name: "鏂板缓璇锋眰",
      collectionId: collections.value[0]?.id,
    });
    requests.value.unshift(request);
    activeRequestId.value = request.id;
    activeEditorTab.value = "query";
    showFlash("Request tab created", "success");
  }

  function closeRequestTab(requestId: string) {
    const requestIndex = requests.value.findIndex((item) => item.id === requestId);
    const nextRequests = requests.value.filter((item) => item.id !== requestId);
    const imageUrl = responseStates.value[requestId]?.imageUrl;
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    if (nextRequests.length === 0) {
      const fallback = createRequestDocument({
        collectionId: collections.value[0]?.id,
      });
      requests.value = [fallback];
      activeRequestId.value = fallback.id;
    } else {
      requests.value = nextRequests;
      if (activeRequestId.value === requestId) {
        const fallbackIndex = Math.max(0, requestIndex - 1);
        activeRequestId.value = nextRequests[fallbackIndex]?.id ?? nextRequests[0].id;
      }
    }

    showFlash("Request tab closed", "info");
  }

  function duplicateRequestTab(request: RequestDocument) {
    const duplicated = createRequestDocument({
      ...cloneRequestDocument(request),
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-dup`,
      name: `${deriveRequestTitle(request)} 鍓湰`,
      collectionId: request.collectionId || collections.value[0]?.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    requests.value.unshift(duplicated);
    activeRequestId.value = duplicated.id;
    showFlash("Request duplicated", "success");
  }

  function deleteRequestTab(request: RequestDocument) {
    closeRequestTab(request.id);
  }

  function addRow(rows: KeyValueRow[]) {
    rows.push(createKeyValueRow());
    if (activeRequest.value) {
      touchRequest(activeRequest.value);
    }
  }

  function removeRow(rows: KeyValueRow[], index: number) {
    if (rows.length <= 1) {
      rows[0] = createKeyValueRow();
    } else {
      rows.splice(index, 1);
    }
    if (activeRequest.value) {
      touchRequest(activeRequest.value);
    }
  }

  function syncCookieBatchText() {
    if (!activeRequest.value) {
      cookieBatchText.value = "";
      return;
    }

    cookieBatchText.value = serializeCookieRows(activeRequest.value.cookies, cookieBatchMode.value);
  }

  function openCookieBatchDialog() {
    syncCookieBatchText();
    showCookieBatchDialog.value = true;
  }

  function applyCookieBatch() {
    if (!activeRequest.value) {
      return;
    }

    try {
      activeRequest.value.cookies = parseCookieBatchText(cookieBatchText.value, cookieBatchMode.value);
      touchRequest(activeRequest.value);
      showCookieBatchDialog.value = false;
      showFlash("Cookie batch applied", "success");
    } catch (error) {
      showFlash(error instanceof Error ? error.message : "Cookie 鎵归噺瑙ｆ瀽澶辫触", "error");
    }
  }

  async function copyCookieBatch() {
    try {
      await copy(cookieBatchText.value);
      showFlash("Cookie batch copied", "success");
    } catch {
      showFlash("澶嶅埗 Cookie 鎵归噺鍐呭澶辫触", "error");
    }
  }

  function addFormDataField() {
    if (!activeRequest.value) {
      return;
    }
    activeRequest.value.formDataFields.push(createFormDataField());
    touchRequest(activeRequest.value);
  }

  function removeFormDataField(index: number) {
    if (!activeRequest.value) {
      return;
    }

    if (activeRequest.value.formDataFields.length <= 1) {
      activeRequest.value.formDataFields[0] = createFormDataField();
      const fileMap = formDataFiles.value[activeRequest.value.id];
      if (fileMap) {
        delete fileMap[0];
      }
    } else {
      activeRequest.value.formDataFields.splice(index, 1);
      const fileMap = formDataFiles.value[activeRequest.value.id];
      if (fileMap) {
        delete fileMap[index];
      }
    }

    touchRequest(activeRequest.value);
  }

  function handleFileChange(index: number, event: Event) {
    const request = activeRequest.value;
    if (!request) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!formDataFiles.value[request.id]) {
      formDataFiles.value[request.id] = {};
    }
    formDataFiles.value[request.id][index] = file;
    request.formDataFields[index].value = file.name;
    request.formDataFields[index].fileName = file.name;
    request.formDataFields[index].mimeType = file.type || "application/octet-stream";
    touchRequest(request);
  }

  function openSaveDialog() {
    const request = activeRequest.value;
    if (!request) {
      return;
    }

    saveDraftName.value = request.name || deriveRequestTitle(request);
    saveDraftCollectionId.value = request.collectionId || collections.value[0]?.id || "";
    saveDialogVisible.value = true;
  }

  function saveCurrentRequest() {
    openSaveDialog();
  }

  function confirmSaveRequest() {
    const request = activeRequest.value;
    if (!request) {
      return;
    }

    request.name = saveDraftName.value.trim() || deriveRequestTitle(request);
    request.collectionId = saveDraftCollectionId.value || collections.value[0]?.id;
    touchRequest(request);
    saveDialogVisible.value = false;
    showFlash("Request saved", "success");
  }

  function createCollection(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      showFlash("Please enter a collection name", "error");
      return;
    }

    const duplicated = collections.value.some(
      (collection) => collection.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicated) {
      showFlash("Collection name already exists", "error");
      return;
    }

    const now = Date.now();
    const collection: RequestCollection = {
      id: globalThis.crypto?.randomUUID?.() ?? `${now}-collection`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    };
    collections.value.unshift(collection);

    if (saveDialogVisible.value) {
      saveDraftCollectionId.value = collection.id;
    } else if (activeRequest.value && !activeRequest.value.collectionId) {
      activeRequest.value.collectionId = collection.id;
    }

    showFlash("宸插垱寤哄伐浣滃尯", "success");
  }

  function applyImportedRequest(imported: RequestDocument) {
    const collectionId =
      imported.collectionId && collections.value.some((item) => item.id === imported.collectionId)
        ? imported.collectionId
        : collections.value[0]?.id;
    const normalizedImported = createRequestDocument({
      ...cloneRequestDocument(imported),
      collectionId,
      updatedAt: Date.now(),
    });
    const current = activeRequest.value;

    if (current && isRequestPristine(current)) {
      const preservedId = current.id;
      const preservedCreatedAt = current.createdAt;
      Object.assign(current, normalizedImported, {
        id: preservedId,
        createdAt: preservedCreatedAt,
        updatedAt: Date.now(),
      });
      resetResponseState(current.id);
      activeRequestId.value = current.id;
      return "replace" as const;
    }

    requests.value.unshift(normalizedImported);
    activeRequestId.value = normalizedImported.id;
    resetResponseState(normalizedImported.id);
    return "create" as const;
  }

  function applyCurlImport() {
    const rawCommand = curlImportText.value.trim();
    if (!rawCommand) {
      showFlash("请先粘贴 cURL 命令", "error");
      return;
    }

    try {
      const { request, warnings } = parseCurlCommand(rawCommand, {
        collectionId: activeRequest.value?.collectionId || collections.value[0]?.id,
      });

      const mode = applyImportedRequest(request);
      curlImportWarnings.value = warnings;
      curlImportVisible.value = false;

      if (warnings.length > 0) {
        showFlash(`cURL 已导入，忽略了 ${warnings.length} 项不支持的参数`, "info");
      } else {
        showFlash(mode === "replace" ? "cURL 已导入到当前标签页" : "cURL 已导入到新标签页", "success");
      }
    } catch (error) {
      curlImportWarnings.value = [];
      showFlash(error instanceof Error ? error.message : "cURL 导入失败", "error");
    }
  }

  function buildRequestHeaders(request: RequestDocument) {
    const headers = rowsToRecord(request.headers);
    const cookies = request.cookies
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => `${row.key}=${row.value}`)
      .join("; ");
    if (cookies) {
      headers.Cookie = cookies;
    }
    return headers;
  }

  function buildAuthHeaders(request: RequestDocument, headers: Record<string, string>, url: string) {
    let nextUrl = url;

    if (request.auth.type === "bearer" && request.auth.token.trim()) {
      headers.Authorization = `Bearer ${request.auth.token.trim()}`;
    } else if (request.auth.type === "basic" && request.auth.username.trim()) {
      headers.Authorization = `Basic ${buildBasicAuth(request.auth.username, request.auth.password)}`;
    } else if (
      request.auth.type === "apikey" &&
      request.auth.apiKeyName.trim() &&
      request.auth.apiKeyValue.trim()
    ) {
      if (request.auth.apiKeyIn === "header") {
        headers[request.auth.apiKeyName.trim()] = request.auth.apiKeyValue;
      } else {
        const pair = `${encodeURIComponent(request.auth.apiKeyName.trim())}=${encodeURIComponent(request.auth.apiKeyValue)}`;
        nextUrl += nextUrl.includes("?") ? `&${pair}` : `?${pair}`;
      }
    }

    return nextUrl;
  }

  function buildCurlCommand() {
    const request = activeRequest.value;
    if (!request || !request.url.trim()) {
      return "";
    }

    const headers = buildRequestHeaders(request);
    let finalUrl = appendQueryParams(request.url.trim(), request.params);
    finalUrl = buildAuthHeaders(request, headers, finalUrl);

    const segments = [`curl -X ${request.method}`, quoteCurlValue(finalUrl)];
    Object.entries(headers).forEach(([key, value]) => {
      segments.push(`-H ${quoteCurlValue(`${key}: ${value}`)}`);
    });

    if (request.bodyType === "form-data") {
      request.formDataFields
        .filter((field) => field.enabled && field.key.trim())
        .forEach((field) => {
          if (field.type === "file" && field.value) {
            segments.push(`-F ${quoteCurlValue(`${field.key}=@${field.value}`)}`);
          } else {
            segments.push(`-F ${quoteCurlValue(`${field.key}=${field.value}`)}`);
          }
        });
    } else if (!["GET", "HEAD"].includes(request.method) && request.bodyType !== "none" && request.body.trim()) {
      if (request.bodyType === "json" && !hasHeader(headers, "Content-Type")) {
        segments.push(`-H ${quoteCurlValue("Content-Type: application/json")}`);
      }
      if (request.bodyType === "form" && !hasHeader(headers, "Content-Type")) {
        segments.push(`-H ${quoteCurlValue("Content-Type: application/x-www-form-urlencoded")}`);
      }
      segments.push(`--data-raw ${quoteCurlValue(request.body)}`);
    }

    return segments.join(" \\\n  ");
  }

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("鏂囦欢璇诲彇澶辫触"));
          return;
        }
        const [, base64 = ""] = reader.result.split(",", 2);
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error ?? new Error("鏂囦欢璇诲彇澶辫触"));
      reader.readAsDataURL(file);
    });
  }

  async function buildSerializedFormData(request: RequestDocument) {
    const fileMap = formDataFiles.value[request.id] || {};
    const serialized: Array<{
      key: string;
      type: "text" | "file";
      value?: string;
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
    }> = [];

    for (const [index, field] of request.formDataFields.entries()) {
      if (!field.enabled || !field.key.trim()) {
        continue;
      }

      if (field.type === "file") {
        const file = fileMap[index];
        if (!file) {
          throw new Error(`瀛楁 ${field.key} 杩樻病鏈夐€夋嫨鏂囦欢`);
        }

        serialized.push({
          key: field.key,
          type: "file",
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64: await fileToBase64(file),
        });
      } else {
        serialized.push({
          key: field.key,
          type: "text",
          value: interpolateString(field.value, request.vars),
        });
      }
    }

    return serialized;
  }

  async function copyAsCurl() {
    const curl = buildCurlCommand();
    if (!curl) {
      showFlash("璇峰厛濉啓璇锋眰 URL", "error");
      return;
    }

    try {
      await copy(curl);
      showFlash("cURL copied", "success");
    } catch {
      showFlash("澶嶅埗 cURL 澶辫触", "error");
    }
  }

  function clearImageUrl(requestId: string) {
    const imageUrl = responseStates.value[requestId]?.imageUrl;
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      responseStates.value[requestId].imageUrl = null;
    }
  }

  function redecodeActiveResponse() {
    const request = activeRequest.value;
    if (!request) {
      return;
    }

    const state = ensureResponseState(request.id);
    const response = state.response;
    if (!response) {
      return;
    }

    const bytes = decodeBase64ToBytes(response.rawBodyBase64);
    const decodedBody = decodeBytes(bytes, responseEncoding.value);
    response.body = decodedBody;
    state.decodedBody = decodedBody;

    clearImageUrl(request.id);
    if ((response.headers["content-type"] || "").includes("image/")) {
      state.imageUrl = URL.createObjectURL(
        new Blob([bytes], { type: response.headers["content-type"] }),
      );
    }
  }

  async function copyResponse() {
    const response = activeResponseState.value.response;
    if (!response) {
      showFlash("No response available to copy", "info");
      return;
    }

    try {
      await copy(formattedResponseBody.value);
      showFlash("Response copied", "success");
    } catch {
      showFlash("澶嶅埗鍝嶅簲澶辫触", "error");
    }
  }

  function downloadResponse() {
    const response = activeResponseState.value.response;
    if (!response) {
      showFlash("No response available to download", "info");
      return;
    }

    const bytes = decodeBase64ToBytes(response.rawBodyBase64);
    const contentType = response.headers["content-type"] || "application/octet-stream";
    let extension = "txt";
    if (contentType.includes("json")) extension = "json";
    else if (contentType.includes("html")) extension = "html";
    else if (contentType.includes("xml")) extension = "xml";
    else if (contentType.includes("png")) extension = "png";
    else if (contentType.includes("jpeg")) extension = "jpg";
    else if (contentType.includes("gif")) extension = "gif";
    else if (contentType.includes("webp")) extension = "webp";

    const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `response.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    showFlash("Response downloaded", "success");
  }

  async function sendRequestAction() {
    const request = activeRequest.value;
    if (!request) {
      return;
    }

    if (!request.url.trim()) {
      showFlash("璇峰厛濉啓璇锋眰 URL", "error");
      return;
    }

    const state = ensureResponseState(request.id);
    state.loading = true;
    state.error = null;
    state.response = null;
    state.decodedBody = "";
    state.timeline = null;
    clearImageUrl(request.id);
    activeResponseTab.value = "body";

    const startedAt = Date.now();

    try {
      const rawHeaders = buildRequestHeaders(request);
      let rawUrl = appendQueryParams(request.url.trim(), request.params);
      rawUrl = buildAuthHeaders(request, rawHeaders, rawUrl);
      let rawBody = request.body;

      const preResult = executePreRequestScript(
        request.preRequestScript,
        {
          url: rawUrl,
          method: request.method,
          headers: rawHeaders,
          body: rawBody,
        },
        request.vars,
      );

      request.vars = ensureRequestRows(preResult.vars);
      const finalUrl = interpolateString(preResult.url, request.vars);
      const finalHeaders = interpolateHeaders(preResult.headers, request.vars);
      rawBody = interpolateString(preResult.body, request.vars);

      if (request.bodyType === "json" && !hasHeader(finalHeaders, "Content-Type")) {
        finalHeaders["Content-Type"] = "application/json";
      }
      if (request.bodyType === "form" && !hasHeader(finalHeaders, "Content-Type")) {
        finalHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const payloadBody =
        request.bodyType === "none" ||
        request.bodyType === "form-data" ||
        ["GET", "HEAD"].includes(request.method)
          ? undefined
          : rawBody;

      const payloadFormData =
        request.bodyType === "form-data" ? await buildSerializedFormData(request) : undefined;

      const result = await sendHttpRequest({
        method: request.method,
        url: finalUrl,
        headers: finalHeaders,
        body: payloadBody,
        bodyKind:
          request.bodyType === "form-data"
            ? "form-data"
            : payloadBody
              ? "text"
              : "none",
        formData: payloadFormData,
        timeoutMs: 30000,
      });

      if (!result.success) {
        throw new Error(result.error || "璇锋眰澶辫触");
      }

      const duration = Date.now() - startedAt;
      const bytes = decodeBase64ToBytes(result.body);
      const decodedBody = decodeBytes(bytes, responseEncoding.value);

      const sandboxRequest: SandboxRequestContext = {
        url: finalUrl,
        method: request.method,
        headers: { ...finalHeaders },
        body: rawBody,
        vars: Object.fromEntries(
          request.vars
            .filter((row) => row.enabled && row.key.trim())
            .map((row) => [row.key.trim(), row.value]),
        ),
        setHeader(key, value) {
          this.headers[key] = value;
        },
        getHeader(key) {
          return this.headers[key];
        },
        setBody(value) {
          this.body = value;
        },
        getBody() {
          return this.body;
        },
        setVar(key, value) {
          this.vars[key] = value;
        },
        getVar(key) {
          return this.vars[key];
        },
      };

      const testOutput = executePostRequestAndTests(
        request.postRequestScript,
        request.tests,
        sandboxRequest,
        {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: decodedBody,
          time: duration,
          size: bytes.byteLength,
        },
      );

      request.vars = ensureRequestRows(testOutput.vars);

      const response: RequestResponse = {
        status: result.status,
        statusText: result.statusText || "",
        headers: result.headers,
        body: decodedBody,
        rawBodyBase64: result.body,
        time: duration,
        size: bytes.byteLength,
        setCookies: result.setCookies.map((item) => item.trim()).filter(Boolean),
        testResults: testOutput.testResults,
      };

      state.response = response;
      state.decodedBody = decodedBody;
      state.timeline = buildTimeline(
        request.method,
        finalUrl,
        finalHeaders,
        request.bodyType === "none" ? "" : rawBody,
        response,
      );

      if ((response.headers["content-type"] || "").includes("image/")) {
        state.imageUrl = URL.createObjectURL(
          new Blob([bytes], { type: response.headers["content-type"] }),
        );
      }

      touchRequest(request);
      recordRequestHistory({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-history`,
        requestId: request.id,
        requestName: deriveRequestTitle(request),
        method: request.method,
        url: finalUrl,
        createdAt: Date.now(),
        success: true,
        status: response.status,
        statusText: response.statusText,
        duration,
        snapshot: cloneRequestDocument(request),
      });
      showFlash("Request completed", "success");
    } catch (error) {
      state.error = {
        message: error instanceof Error ? error.message : "鏈煡閿欒",
        detail: request.url,
      };
      recordRequestHistory({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-history`,
        requestId: request.id,
        requestName: deriveRequestTitle(request),
        method: request.method,
        url: request.url,
        createdAt: Date.now(),
        success: false,
        snapshot: cloneRequestDocument(request),
      });
      showFlash("璇锋眰澶辫触", "error");
    } finally {
      state.loading = false;
    }
  }

  onMounted(() => {
    void hydrateWorkspace();
  });

  onBeforeUnmount(() => {
    if (workspacePersistTimer) {
      window.clearTimeout(workspacePersistTimer);
      void persistWorkspaceNow();
    }

    Object.values(responseStates.value).forEach((state) => {
      if (state.imageUrl) {
        URL.revokeObjectURL(state.imageUrl);
      }
    });
  });

  return {
    HTTP_METHODS,
    REQUEST_AUTH_TYPES,
    REQUEST_BODY_TYPES,
    RESPONSE_ENCODINGS,
    collections,
    requests,
    requestSearch,
    groupedRequests,
    workspaceVisible,
    historyVisible,
    saveDialogVisible,
    curlImportVisible,
    curlImportText,
    curlImportWarnings,
    saveDraftName,
    saveDraftCollectionId,
    showCookieBatchDialog,
    cookieBatchMode,
    cookieBatchText,
    activeRequest,
    activeRequestId,
    activeEditorTab,
    activeScriptTab,
    activeResponseTab,
    responseEncoding,
    responseBodyView,
    splitRatio,
    requestHistory,
    requestEditorTabs,
    responseTabs,
    activeResponseState,
    responseSummary,
    responseCookies,
    responseContentType,
    formattedResponseBody,
    selectRequestTab,
    toggleWorkspace,
    toggleHistory,
    addRequestTab,
    closeRequestTab,
    deleteRequestTab,
    duplicateRequestTab,
    openCurlImportDialog,
    closeCurlImportDialog,
    applyCurlImport,
    restoreHistoryEntry,
    removeHistoryEntry,
    clearRequestHistory,
    openSaveDialog,
    saveCurrentRequest,
    confirmSaveRequest,
    createCollection,
    addRow,
    removeRow,
    openCookieBatchDialog,
    applyCookieBatch,
    copyCookieBatch,
    addFormDataField,
    removeFormDataField,
    handleFileChange,
    sendRequest: sendRequestAction,
    copyAsCurl,
    copyResponse,
    downloadResponse,
    redecodeActiveResponse,
    deriveRequestTitle,
  };
}






