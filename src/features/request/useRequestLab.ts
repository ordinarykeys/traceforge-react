import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppLocale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { sendHttpRequest } from "@/lib/requestHost";

import { parseResponseCookies } from "./requestCookies";
import { parseCurlCommand } from "./requestCurl";
import {
  appendQueryParams,
  buildAuthUrlAndHeaders,
  buildCurlCommand,
  buildTimeline,
  countEnabledRows,
  createInitialWorkspace,
  decodeBase64ToBytes,
  decodeBytes,
  deriveRequestTitle as deriveRequestTitleRaw,
  formatBytes,
  hasHeader,
  isRequestPristine,
  normalizeRequest,
  normalizeRequests,
  prettyJson,
  revokeImageUrl,
  rowsToRecord,
} from "./requestLab.helpers";
import {
  executePostRequestAndTests,
  executePreRequestScript,
  interpolateHeaders,
  interpolateString,
  type SandboxRequestContext,
} from "./requestSandbox";
import {
  loadRequestHistory,
  loadRequestWorkspaceState,
  saveRequestHistory,
  saveRequestWorkspaceState,
} from "./requestStorage";
import {
  createKeyValueRow,
  createRequestDocument,
  cloneRequestDocument,
  HTTP_METHODS,
  REQUEST_AUTH_TYPES,
  REQUEST_BODY_TYPES,
  type KeyValueRow,
  type RequestCollection,
  type RequestDocument,
  type RequestEditorTab,
  type RequestHistoryEntry,
  type RequestResponse,
  type RequestResponseState,
  type ResponseBodyView,
  type ResponseTab,
  type ScriptTab,
} from "./requestTypes";

const REQUEST_EDITOR_TABS: RequestEditorTab[] = [
  "query",
  "headers",
  "body",
  "auth",
  "cookies",
  "vars",
  "script",
  "tests",
];

const RESPONSE_TABS: ResponseTab[] = ["body", "headers", "cookies", "tests", "timeline"];

type RequestRowSection = "params" | "headers" | "cookies" | "vars";

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

function ensureRows(rows: KeyValueRow[]) {
  return rows.length > 0 ? rows : [createKeyValueRow()];
}

export function useRequestLab(locale: AppLocale) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const deriveRequestTitle = useCallback(
    (request: RequestDocument) =>
      deriveRequestTitleRaw(request, t("requestlab.defaultRequestTitle")),
    [t],
  );

  const [collections, setCollections] = useState<RequestCollection[]>([]);
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [requestSearch, setRequestSearch] = useState("");

  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [activeEditorTab, setActiveEditorTab] = useState<RequestEditorTab>("query");
  const [activeScriptTab, setActiveScriptTab] = useState<ScriptTab>("pre");
  const [activeResponseTab, setActiveResponseTab] = useState<ResponseTab>("body");
  const [responseBodyView, setResponseBodyView] = useState<ResponseBodyView>("pretty");

  const [curlImportOpen, setCurlImportOpen] = useState(false);
  const [curlImportText, setCurlImportText] = useState("");
  const [curlImportWarnings, setCurlImportWarnings] = useState<string[]>([]);

  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>([]);
  const [responseStates, setResponseStates] = useState<Record<string, RequestResponseState>>({});
  const [storageHydrated, setStorageHydrated] = useState(false);

  const activeRequest = useMemo(() => {
    if (requests.length === 0) return null;
    return requests.find((request) => request.id === activeRequestId) ?? requests[0];
  }, [activeRequestId, requests]);

  const activeResponseState = useMemo(() => {
    if (!activeRequest) return createEmptyResponseState();
    return responseStates[activeRequest.id] ?? createEmptyResponseState();
  }, [activeRequest, responseStates]);

  const filteredRequests = useMemo(() => {
    const keyword = requestSearch.trim().toLowerCase();
    if (!keyword) return requests;
    return requests.filter((request) => {
      const text = `${deriveRequestTitle(request)} ${request.url}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [deriveRequestTitle, requestSearch, requests]);

  const groupedRequests = useMemo(
    () =>
      collections.map((collection) => ({
        ...collection,
        requests: filteredRequests.filter((request) => request.collectionId === collection.id),
      })),
    [collections, filteredRequests],
  );

  const requestEditorTabs = useMemo(() => {
    if (!activeRequest) return REQUEST_EDITOR_TABS.map((key) => ({ key, count: 0 }));
    return REQUEST_EDITOR_TABS.map((key) => ({
      key,
      count:
        key === "query"
          ? countEnabledRows(activeRequest.params)
          : key === "headers"
            ? countEnabledRows(activeRequest.headers)
            : key === "cookies"
              ? countEnabledRows(activeRequest.cookies)
              : key === "vars"
                ? countEnabledRows(activeRequest.vars)
                : 0,
    }));
  }, [activeRequest]);

  const responseTabs = RESPONSE_TABS;
  const responseContentType = activeResponseState.response?.headers["content-type"] || "";

  const formattedResponseBody = useMemo(() => {
    const response = activeResponseState.response;
    if (!response) return "";
    if (responseBodyView === "raw") return activeResponseState.decodedBody;
    if (responseContentType.includes("json")) return prettyJson(activeResponseState.decodedBody);
    return activeResponseState.decodedBody;
  }, [activeResponseState, responseBodyView, responseContentType]);

  const responseSummary = useMemo(() => {
    const response = activeResponseState.response;
    if (!response) return null;
    return {
      status: `${response.status} ${response.statusText}`.trim(),
      time: `${response.time} ms`,
      size: formatBytes(response.size),
    };
  }, [activeResponseState.response]);

  const responseCookies = useMemo(
    () => parseResponseCookies(activeResponseState.response?.setCookies ?? []),
    [activeResponseState.response],
  );

  useEffect(() => {
    let canceled = false;

    const hydrate = async () => {
      try {
        const loaded = await loadRequestWorkspaceState();
        const fallbackCollectionId =
          loaded.value.collections[0]?.id ??
          createInitialWorkspace({
            collectionName: t("requestlab.initialWorkspaceName"),
            requestName: t("requestlab.initialRequestName"),
          }).collections[0].id;
        const normalized = normalizeRequests(loaded.value.requests, fallbackCollectionId);
        if (canceled) return;
        setCollections(loaded.value.collections);
        setRequests(normalized);
        setActiveRequestId(loaded.value.activeRequestId || normalized[0]?.id || "");

        const history = await loadRequestHistory();
        if (!canceled) setRequestHistory(history);
      } catch {
        if (canceled) return;
        const fallback = createInitialWorkspace({
          collectionName: t("requestlab.initialWorkspaceName"),
          requestName: t("requestlab.initialRequestName"),
        });
        setCollections(fallback.collections);
        setRequests(fallback.requests);
        setActiveRequestId(fallback.activeRequestId);
      } finally {
        if (!canceled) setStorageHydrated(true);
      }
    };

    void hydrate();
    return () => {
      canceled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!storageHydrated) return;
    const timer = window.setTimeout(() => {
      void saveRequestWorkspaceState({
        collections,
        requests,
        activeRequestId: activeRequestId || requests[0]?.id || "",
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [storageHydrated, collections, requests, activeRequestId]);

  useEffect(() => {
    if (!storageHydrated) return;
    const timer = window.setTimeout(() => {
      void saveRequestHistory(requestHistory);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [storageHydrated, requestHistory]);

  useEffect(() => {
    setResponseStates((prev) => {
      const validIds = new Set(requests.map((request) => request.id));
      const next: Record<string, RequestResponseState> = {};
      requests.forEach((request) => {
        next[request.id] = prev[request.id] ?? createEmptyResponseState();
      });
      Object.entries(prev).forEach(([requestId, state]) => {
        if (!validIds.has(requestId)) revokeImageUrl(state.imageUrl);
      });
      return next;
    });
  }, [requests]);

  const mutateActiveRequest = useCallback(
    (updater: (request: RequestDocument) => RequestDocument) => {
      if (!activeRequest) return;
      const requestId = activeRequest.id;
      setRequests((prev) =>
        prev.map((request) =>
          request.id === requestId ? { ...updater(cloneRequestDocument(request)), updatedAt: Date.now() } : request,
        ),
      );
    },
    [activeRequest],
  );

  const setMethod = useCallback(
    (method: RequestDocument["method"]) => mutateActiveRequest((request) => ({ ...request, method })),
    [mutateActiveRequest],
  );

  const setUrl = useCallback(
    (url: string) => mutateActiveRequest((request) => ({ ...request, url })),
    [mutateActiveRequest],
  );

  const setName = useCallback(
    (name: string) => mutateActiveRequest((request) => ({ ...request, name })),
    [mutateActiveRequest],
  );

  const setBodyType = useCallback(
    (bodyType: RequestDocument["bodyType"]) => mutateActiveRequest((request) => ({ ...request, bodyType })),
    [mutateActiveRequest],
  );

  const setBody = useCallback(
    (body: string) => mutateActiveRequest((request) => ({ ...request, body })),
    [mutateActiveRequest],
  );

  const setAuthType = useCallback(
    (type: RequestDocument["auth"]["type"]) => mutateActiveRequest((request) => ({ ...request, auth: { ...request.auth, type } })),
    [mutateActiveRequest],
  );

  const setAuthField = useCallback(
    <K extends keyof RequestDocument["auth"]>(key: K, value: RequestDocument["auth"][K]) =>
      mutateActiveRequest((request) => ({ ...request, auth: { ...request.auth, [key]: value } })),
    [mutateActiveRequest],
  );

  const setScriptField = useCallback(
    (field: "preRequestScript" | "postRequestScript" | "tests", value: string) =>
      mutateActiveRequest((request) => ({ ...request, [field]: value })),
    [mutateActiveRequest],
  );

  const setRowField = useCallback(
    <K extends keyof KeyValueRow>(section: RequestRowSection, index: number, key: K, value: KeyValueRow[K]) =>
      mutateActiveRequest((request) => {
        const rows = [...request[section]];
        if (!rows[index]) return request;
        rows[index] = { ...rows[index], [key]: value };
        return { ...request, [section]: rows };
      }),
    [mutateActiveRequest],
  );

  const addRow = useCallback(
    (section: RequestRowSection) => mutateActiveRequest((request) => ({ ...request, [section]: [...request[section], createKeyValueRow()] })),
    [mutateActiveRequest],
  );

  const removeRow = useCallback(
    (section: RequestRowSection, index: number) =>
      mutateActiveRequest((request) => ({ ...request, [section]: ensureRows(request[section].filter((_, i) => i !== index)) })),
    [mutateActiveRequest],
  );

  const selectRequestTab = useCallback((requestId: string) => {
    setActiveRequestId(requestId);
    setActiveResponseTab("body");
  }, []);

  const createCollection = useCallback(
    (name?: string) => {
      const now = Date.now();
      const collection: RequestCollection = {
        id: globalThis.crypto?.randomUUID?.() ?? `${now}-collection`,
        name:
          name?.trim() ||
          t("requestlab.defaultCollectionName", { index: collections.length + 1 }),
        createdAt: now,
        updatedAt: now,
      };
      setCollections((prev) => [...prev, collection]);
      return collection;
    },
    [collections.length, t],
  );

  const addRequestTab = useCallback(
    (collectionId?: string) => {
      const targetCollectionId =
        collectionId || activeRequest?.collectionId || collections[0]?.id || createCollection().id;
        const request = normalizeRequest(
          createRequestDocument({
            collectionId: targetCollectionId,
            name: t("requestlab.defaultRequestName"),
          }),
          targetCollectionId,
        );
      setRequests((prev) => [...prev, request]);
      setActiveRequestId(request.id);
      return request.id;
    },
    [activeRequest?.collectionId, collections, createCollection, t],
  );

  const duplicateRequestTab = useCallback(
    (requestId?: string) => {
      const targetId = requestId || activeRequest?.id;
      if (!targetId) return null;
      const source = requests.find((request) => request.id === targetId);
      if (!source) return null;

      const now = Date.now();
      const cloned = cloneRequestDocument(source);
      cloned.id = globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2, 10)}`;
      cloned.name = `${deriveRequestTitle(source)} ${t("requestlab.copySuffix")}`.trim();
      cloned.createdAt = now;
      cloned.updatedAt = now;

      setRequests((prev) => [...prev, cloned]);
      setActiveRequestId(cloned.id);
      return cloned.id;
    },
    [activeRequest?.id, deriveRequestTitle, requests, t],
  );

  const closeRequestTab = useCallback(
    (requestId: string) => {
      const index = requests.findIndex((request) => request.id === requestId);
      if (index < 0) return;

      if (requests.length === 1) {
        const fallbackCollectionId = requests[0]?.collectionId || collections[0]?.id || createCollection().id;
        const fallback = normalizeRequest(
          createRequestDocument({
            collectionId: fallbackCollectionId,
            name: t("requestlab.defaultRequestName"),
          }),
          fallbackCollectionId,
        );
        setRequests([fallback]);
        setActiveRequestId(fallback.id);
      } else {
        const next = requests.filter((request) => request.id !== requestId);
        setRequests(next);
        if (activeRequestId === requestId) {
          const nextIndex = Math.max(0, index - 1);
          setActiveRequestId(next[nextIndex]?.id || next[0].id);
        }
      }

      setResponseStates((prev) => {
        const state = prev[requestId];
        revokeImageUrl(state?.imageUrl);
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    },
    [activeRequestId, collections, createCollection, requests, t],
  );

  const deleteRequestTab = closeRequestTab;

  const applyImportedRequest = useCallback(
    (imported: RequestDocument) => {
      const fallbackCollectionId =
        imported.collectionId || activeRequest?.collectionId || collections[0]?.id || createCollection().id;
      const normalized = normalizeRequest(
        {
          ...imported,
          collectionId: fallbackCollectionId,
          updatedAt: Date.now(),
        },
        fallbackCollectionId,
      );

      if (activeRequest && isRequestPristine(activeRequest)) {
        setRequests((prev) =>
          prev.map((request) =>
            request.id === activeRequest.id
              ? {
                  ...normalized,
                  id: activeRequest.id,
                  createdAt: activeRequest.createdAt,
                }
              : request,
          ),
        );
        setActiveRequestId(activeRequest.id);
        return "replace" as const;
      }

      setRequests((prev) => [normalized, ...prev]);
      setActiveRequestId(normalized.id);
      return "create" as const;
    },
    [activeRequest, collections, createCollection],
  );

  const applyCurlImport = useCallback(() => {
    const command = curlImportText.trim();
    if (!command) throw new Error(t("requestlab.error.pasteCurlFirst"));

    const { request, warnings } = parseCurlCommand(command, {
      collectionId: activeRequest?.collectionId || collections[0]?.id,
    });

    const mode = applyImportedRequest(request);
    setCurlImportWarnings(warnings);
    setCurlImportOpen(false);
    return { mode, warnings };
  }, [activeRequest?.collectionId, applyImportedRequest, collections, curlImportText, t]);

  const recordHistory = useCallback((entry: RequestHistoryEntry) => {
    setRequestHistory((prev) => [entry, ...prev].slice(0, 120));
  }, []);

  const removeHistoryEntry = useCallback((entryId: string) => {
    setRequestHistory((prev) => prev.filter((entry) => entry.id !== entryId));
  }, []);

  const clearRequestHistory = useCallback(() => {
    setRequestHistory([]);
  }, []);

  const restoreHistoryEntry = useCallback(
    (entryId: string) => {
      const entry = requestHistory.find((item) => item.id === entryId);
      if (!entry) return null;

      const now = Date.now();
      const restored = cloneRequestDocument(entry.snapshot);
      restored.id = globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2, 10)}`;
      restored.createdAt = now;
      restored.updatedAt = now;
      restored.collectionId =
        restored.collectionId || activeRequest?.collectionId || collections[0]?.id || createCollection().id;

      setRequests((prev) => [restored, ...prev]);
      setActiveRequestId(restored.id);
      return restored.id;
    },
    [activeRequest?.collectionId, collections, createCollection, requestHistory],
  );

  const sendRequest = useCallback(async () => {
    if (!activeRequest) throw new Error(t("requestlab.error.noActiveRequest"));
    if (!activeRequest.url.trim()) throw new Error(t("requestlab.error.urlRequired"));

    const request = cloneRequestDocument(activeRequest);
    const requestId = request.id;
    setActiveResponseTab("body");

    setResponseStates((prev) => {
      const current = prev[requestId] ?? createEmptyResponseState();
      revokeImageUrl(current.imageUrl);
      return {
        ...prev,
        [requestId]: {
          ...createEmptyResponseState(),
          loading: true,
        },
      };
    });

    try {
      const headers = rowsToRecord(request.headers);
      const cookieText = request.cookies
        .filter((row) => row.enabled && row.key.trim())
        .map((row) => `${row.key.trim()}=${row.value}`)
        .join("; ");
      if (cookieText) headers.Cookie = cookieText;

      let rawUrl = appendQueryParams(request.url.trim(), request.params);
      rawUrl = buildAuthUrlAndHeaders(request, headers, rawUrl);

      const preResult = executePreRequestScript(
        request.preRequestScript,
        {
          url: rawUrl,
          method: request.method,
          headers,
          body: request.body,
        },
        request.vars,
      );

      request.vars = ensureRows(preResult.vars);
      const finalUrl = interpolateString(preResult.url, request.vars);
      const finalHeaders = interpolateHeaders(preResult.headers, request.vars);
      const finalBody = interpolateString(preResult.body, request.vars);

      if (request.bodyType === "json" && !hasHeader(finalHeaders, "content-type")) {
        finalHeaders["Content-Type"] = "application/json";
      }
      if (request.bodyType === "form" && !hasHeader(finalHeaders, "content-type")) {
        finalHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const payloadBody =
        request.bodyType === "none" || ["GET", "HEAD"].includes(request.method)
          ? undefined
          : finalBody;

      const startedAt = performance.now();
      const result = await sendHttpRequest({
        method: request.method,
        url: finalUrl,
        headers: finalHeaders,
        body: payloadBody,
        bodyKind: payloadBody ? "text" : "none",
        timeoutMs: 30000,
      });

      if (!result.success) {
        throw new Error(result.error || t("requestlab.error.requestFailed"));
      }

      const duration = Math.round(performance.now() - startedAt);
      const bytes = decodeBase64ToBytes(result.body);
      const decodedBody = decodeBytes(bytes, "utf-8");

      const sandboxRequest: SandboxRequestContext = {
        url: finalUrl,
        method: request.method,
        headers: { ...finalHeaders },
        body: finalBody,
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

      const testResult = executePostRequestAndTests(
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

      const nextVars = ensureRows(testResult.vars.length > 0 ? testResult.vars : request.vars);

      const response: RequestResponse = {
        status: result.status,
        statusText: result.statusText || "",
        headers: result.headers,
        body: decodedBody,
        rawBodyBase64: result.body,
        time: duration,
        size: bytes.byteLength,
        setCookies: result.setCookies || [],
        testResults: testResult.testResults,
      };

      setRequests((prev) =>
        prev.map((item) =>
          item.id === requestId
            ? {
                ...item,
                vars: nextVars,
                updatedAt: Date.now(),
              }
            : item,
        ),
      );

      setResponseStates((prev) => ({
        ...prev,
        [requestId]: {
          response,
          error: null,
          loading: false,
          imageUrl: null,
          decodedBody,
          timeline: buildTimeline(
            request.method,
            finalUrl,
            finalHeaders,
            request.bodyType === "none" ? "" : finalBody,
            response,
          ),
        },
      }));

      recordHistory({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-history`,
        requestId,
        requestName: deriveRequestTitle(request),
        method: request.method,
        url: finalUrl,
        createdAt: Date.now(),
        success: true,
        status: response.status,
        statusText: response.statusText,
        duration: response.time,
        snapshot: cloneRequestDocument({
          ...request,
          vars: nextVars,
        }),
      });

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResponseStates((prev) => ({
        ...prev,
        [requestId]: {
          ...createEmptyResponseState(),
          error: {
            message,
            detail: request.url,
          },
        },
      }));

      recordHistory({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-history`,
        requestId,
        requestName: deriveRequestTitle(request),
        method: request.method,
        url: request.url,
        createdAt: Date.now(),
        success: false,
        snapshot: cloneRequestDocument(request),
      });

      throw error;
    }
  }, [activeRequest, deriveRequestTitle, recordHistory, t]);

  const copyAsCurl = useCallback(() => {
    if (!activeRequest) throw new Error(t("requestlab.error.noActiveRequest"));
    const text = buildCurlCommand(activeRequest);
    if (!text) throw new Error(t("requestlab.error.noUrlToExport"));
    return text;
  }, [activeRequest, t]);

  const copyResponse = useCallback(() => {
    if (!activeResponseState.response) throw new Error(t("requestlab.error.noResponseToCopy"));
    return formattedResponseBody;
  }, [activeResponseState.response, formattedResponseBody, t]);

  return {
    HTTP_METHODS,
    REQUEST_AUTH_TYPES,
    REQUEST_BODY_TYPES,
    collections,
    requests,
    groupedRequests,
    activeRequest,
    activeRequestId,
    requestSearch,
    requestHistory,
    workspaceVisible,
    historyVisible,
    activeEditorTab,
    activeScriptTab,
    activeResponseTab,
    responseBodyView,
    requestEditorTabs,
    responseTabs,
    activeResponseState,
    responseSummary,
    responseCookies,
    responseContentType,
    formattedResponseBody,
    curlImportOpen,
    curlImportText,
    curlImportWarnings,

    setRequestSearch,
    setWorkspaceVisible,
    setHistoryVisible,
    setActiveEditorTab,
    setActiveScriptTab,
    setActiveResponseTab,
    setResponseBodyView,
    setCurlImportOpen,
    setCurlImportText,

    setMethod,
    setUrl,
    setName,
    setBodyType,
    setBody,
    setAuthType,
    setAuthField,
    setScriptField,
    setRowField,
    addRow,
    removeRow,

    selectRequestTab,
    createCollection,
    addRequestTab,
    duplicateRequestTab,
    closeRequestTab,
    deleteRequestTab,

    applyCurlImport,
    sendRequest,
    copyAsCurl,
    copyResponse,
    removeHistoryEntry,
    clearRequestHistory,
    restoreHistoryEntry,
    deriveRequestTitle,
  };
}
