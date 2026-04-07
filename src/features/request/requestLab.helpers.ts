import {
  createFormDataField,
  createKeyValueRow,
  createRequestDocument,
  type HttpMethod,
  type KeyValueRow,
  type RequestCollection,
  type RequestDocument,
  type RequestResponse,
  type RequestTimeline,
  type ResponseEncoding,
} from "./requestTypes";

export function ensureRows(rows?: KeyValueRow[]) {
  return rows && rows.length > 0 ? rows : [createKeyValueRow()];
}

export function ensureFormDataFields(fields?: RequestDocument["formDataFields"]) {
  return fields && fields.length > 0 ? fields : [createFormDataField()];
}

export function normalizeRequest(request: RequestDocument, fallbackCollectionId: string): RequestDocument {
  return {
    ...request,
    collectionId: request.collectionId || fallbackCollectionId,
    headers: ensureRows(request.headers),
    params: ensureRows(request.params),
    cookies: ensureRows(request.cookies),
    vars: ensureRows(request.vars),
    formDataFields: ensureFormDataFields(request.formDataFields),
  };
}

export function normalizeRequests(requests: RequestDocument[], fallbackCollectionId: string) {
  return requests.map((request) => normalizeRequest(request, fallbackCollectionId));
}

export function rowsToRecord(rows: KeyValueRow[]) {
  const record: Record<string, string> = {};
  rows
    .filter((row) => row.enabled && row.key.trim())
    .forEach((row) => {
      record[row.key.trim()] = row.value;
    });
  return record;
}

export function appendQueryParams(url: string, rows: KeyValueRow[]) {
  const query = rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${encodeURIComponent(row.key.trim())}=${encodeURIComponent(row.value)}`)
    .join("&");

  if (!query) return url;
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

export function hasHeader(headers: Record<string, string>, name: string) {
  const key = name.toLowerCase();
  return Object.keys(headers).some((item) => item.toLowerCase() === key);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function decodeBase64ToBytes(base64Text: string) {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeBytes(bytes: Uint8Array, encoding: ResponseEncoding) {
  if (encoding === "base64") {
    return btoa(String.fromCharCode(...bytes));
  }

  try {
    const codec = encoding === "gbk" || encoding === "gb2312" ? "gb18030" : encoding;
    return new TextDecoder(codec).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function encodeBasicAuth(username: string, password: string) {
  const raw = new TextEncoder().encode(`${username}:${password}`);
  let text = "";
  raw.forEach((value) => {
    text += String.fromCharCode(value);
  });
  return btoa(text);
}

export function quoteCurlValue(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function deriveRequestTitle(request: RequestDocument, untitledLabel = "Untitled") {
  if (request.name.trim()) return request.name.trim();
  if (!request.url.trim()) return untitledLabel;

  try {
    const parsed = new URL(request.url.trim());
    return (parsed.pathname === "/" ? parsed.host : parsed.pathname).slice(0, 40);
  } catch {
    return request.url.trim().slice(0, 40);
  }
}

export function buildTimeline(
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

interface InitialWorkspaceOptions {
  collectionName?: string;
  requestName?: string;
}

export function createInitialWorkspace(options: InitialWorkspaceOptions = {}) {
  const now = Date.now();
  const collection: RequestCollection = {
    id: globalThis.crypto?.randomUUID?.() ?? `${now}-collection`,
    name: options.collectionName || "Default Workspace",
    createdAt: now,
    updatedAt: now,
  };

  const request = createRequestDocument({
    collectionId: collection.id,
    name: options.requestName || "Get Example",
    method: "GET",
    url: "https://httpbin.org/get",
  });

  return {
    collections: [collection],
    requests: [request],
    activeRequestId: request.id,
  };
}

export function revokeImageUrl(imageUrl: string | null | undefined) {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
}

export function buildAuthUrlAndHeaders(
  request: RequestDocument,
  headers: Record<string, string>,
  url: string,
) {
  let nextUrl = url;

  if (request.auth.type === "bearer" && request.auth.token.trim()) {
    headers.Authorization = `Bearer ${request.auth.token.trim()}`;
  } else if (request.auth.type === "basic" && request.auth.username.trim()) {
    headers.Authorization = `Basic ${encodeBasicAuth(request.auth.username.trim(), request.auth.password)}`;
  } else if (
    request.auth.type === "apikey" &&
    request.auth.apiKeyName.trim() &&
    request.auth.apiKeyValue.trim()
  ) {
    if (request.auth.apiKeyIn === "header") {
      headers[request.auth.apiKeyName.trim()] = request.auth.apiKeyValue;
    } else {
      const pair = `${encodeURIComponent(request.auth.apiKeyName.trim())}=${encodeURIComponent(request.auth.apiKeyValue)}`;
      nextUrl = nextUrl.includes("?") ? `${nextUrl}&${pair}` : `${nextUrl}?${pair}`;
    }
  }

  return nextUrl;
}

export function countEnabledRows(rows: KeyValueRow[]) {
  return rows.filter((row) => row.enabled && (row.key.trim() || row.value.trim())).length;
}

export function isRequestPristine(request: RequestDocument) {
  return (
    request.method === "GET" &&
    !request.url.trim() &&
    !request.body.trim() &&
    request.headers.every((row) => !row.key.trim() && !row.value.trim()) &&
    request.params.every((row) => !row.key.trim() && !row.value.trim()) &&
    request.cookies.every((row) => !row.key.trim() && !row.value.trim()) &&
    request.vars.every((row) => !row.key.trim() && !row.value.trim())
  );
}

export function buildCurlCommand(request: RequestDocument) {
  if (!request.url.trim()) return "";

  const headers = rowsToRecord(request.headers);
  const cookieText = request.cookies
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${row.key.trim()}=${row.value}`)
    .join("; ");

  if (cookieText) {
    headers.Cookie = cookieText;
  }

  let finalUrl = appendQueryParams(request.url.trim(), request.params);
  finalUrl = buildAuthUrlAndHeaders(request, headers, finalUrl);

  const segments = [`curl -X ${request.method}`, quoteCurlValue(finalUrl)];
  Object.entries(headers).forEach(([key, value]) => {
    segments.push(`-H ${quoteCurlValue(`${key}: ${value}`)}`);
  });

  if (!(["GET", "HEAD"].includes(request.method) || request.bodyType === "none")) {
    if (request.bodyType === "form-data") {
      request.formDataFields
        .filter((field) => field.enabled && field.key.trim())
        .forEach((field) => {
          if (field.type === "file" && field.value.trim()) {
            segments.push(`-F ${quoteCurlValue(`${field.key}=@${field.value}`)}`);
          } else {
            segments.push(`-F ${quoteCurlValue(`${field.key}=${field.value}`)}`);
          }
        });
    } else {
      if (request.body.trim()) {
        segments.push(`--data-raw ${quoteCurlValue(request.body)}`);
      }
    }
  }

  return segments.join(" \\\n  ");
}

export function getMethodToneClass(method: HttpMethod) {
  switch (method) {
    case "GET":
      return "text-emerald-600";
    case "POST":
      return "text-blue-600";
    case "PUT":
      return "text-amber-600";
    case "PATCH":
      return "text-orange-600";
    case "DELETE":
      return "text-rose-600";
    default:
      return "text-muted-foreground";
  }
}
