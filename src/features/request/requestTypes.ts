export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

export type RequestAuthType = "none" | "bearer" | "basic" | "apikey";
export type RequestBodyType = "none" | "json" | "form" | "form-data" | "raw";
export type RequestEditorTab =
  | "query"
  | "body"
  | "headers"
  | "auth"
  | "cookies"
  | "vars"
  | "script"
  | "tests";
export type ScriptTab = "pre" | "post";
export type ResponseTab = "body" | "headers" | "cookies" | "tests" | "timeline";
export type ResponseEncoding = "utf-8" | "gbk" | "gb2312" | "iso-8859-1" | "base64";
export type ResponseBodyView = "pretty" | "raw";
export type CookieBatchMode = "key-value" | "raw-json" | "description";

export type KeyValueRow = {
  key: string;
  value: string;
  description: string;
  enabled: boolean;
};

export type RequestAuthConfig = {
  type: RequestAuthType;
  token: string;
  username: string;
  password: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: "header" | "query";
};

export type FormDataField = {
  key: string;
  value: string;
  type: "text" | "file";
  description: string;
  enabled: boolean;
  fileName?: string;
  mimeType?: string;
};

export type RequestDocument = {
  id: string;
  name: string;
  collectionId?: string;
  method: HttpMethod;
  url: string;
  headers: KeyValueRow[];
  params: KeyValueRow[];
  cookies: KeyValueRow[];
  vars: KeyValueRow[];
  bodyType: RequestBodyType;
  body: string;
  formDataFields: FormDataField[];
  auth: RequestAuthConfig;
  preRequestScript: string;
  postRequestScript: string;
  tests: string;
  createdAt: number;
  updatedAt: number;
};

export type RequestCollection = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type RequestHistoryEntry = {
  id: string;
  requestId?: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  createdAt: number;
  success: boolean;
  status?: number;
  statusText?: string;
  duration?: number;
  snapshot: RequestDocument;
};

export type TestAssertionResult = {
  name: string;
  passed: boolean;
  error?: string;
};

export type ResponseCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  sameSite?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

export type RequestTimeline = {
  requestLine: string;
  requestHeaders: string;
  requestBody: string;
  responseLine: string;
  responseHeaders: string;
  startedAt: number | null;
  duration: number | null;
  size: number | null;
};

export type RequestResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  rawBodyBase64: string;
  time: number;
  size: number;
  setCookies: string[];
  testResults: TestAssertionResult[];
};

export type RequestErrorState = {
  message: string;
  detail?: string;
};

export type RequestResponseState = {
  response: RequestResponse | null;
  error: RequestErrorState | null;
  loading: boolean;
  imageUrl: string | null;
  decodedBody: string;
  timeline: RequestTimeline | null;
};

export const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

export const RESPONSE_ENCODINGS: Array<{ label: string; value: ResponseEncoding }> = [
  { label: "UTF-8", value: "utf-8" },
  { label: "GBK", value: "gbk" },
  { label: "GB2312", value: "gb2312" },
  { label: "ISO-8859-1", value: "iso-8859-1" },
  { label: "Base64", value: "base64" },
];

export const REQUEST_BODY_TYPES: Array<{ label: string; value: RequestBodyType }> = [
  { label: "无请求体", value: "none" },
  { label: "JSON", value: "json" },
  { label: "表单 URL 编码", value: "form" },
  { label: "表单数据", value: "form-data" },
  { label: "原始文本", value: "raw" },
];

export const REQUEST_AUTH_TYPES: Array<{ label: string; value: RequestAuthType }> = [
  { label: "无需认证", value: "none" },
  { label: "Bearer Token", value: "bearer" },
  { label: "Basic Auth", value: "basic" },
  { label: "API Key", value: "apikey" },
];

export function createKeyValueRow(): KeyValueRow {
  return {
    key: "",
    value: "",
    description: "",
    enabled: true,
  };
}

export function createRequestAuthConfig(): RequestAuthConfig {
  return {
    type: "none",
    token: "",
    username: "",
    password: "",
    apiKeyName: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  };
}

export function createFormDataField(): FormDataField {
  return {
    key: "",
    value: "",
    type: "text",
    description: "",
    enabled: true,
  };
}

export function createRequestDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
  const now = Date.now();

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2, 10)}`,
    name: "新建请求",
    method: "GET",
    url: "",
    headers: [createKeyValueRow()],
    params: [createKeyValueRow()],
    cookies: [createKeyValueRow()],
    vars: [createKeyValueRow()],
    bodyType: "none",
    body: "",
    formDataFields: [createFormDataField()],
    auth: createRequestAuthConfig(),
    preRequestScript: "",
    postRequestScript: "",
    tests: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function cloneRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.map((row) => ({ ...row }));
}

export function cloneRequestDocument(document: RequestDocument): RequestDocument {
  return {
    ...document,
    headers: cloneRows(document.headers),
    params: cloneRows(document.params),
    cookies: cloneRows(document.cookies),
    vars: cloneRows(document.vars),
    formDataFields: document.formDataFields.map((field) => ({ ...field })),
    auth: { ...document.auth },
  };
}

export function getMethodTone(method: HttpMethod) {
  switch (method) {
    case "GET":
      return "is-get";
    case "POST":
      return "is-post";
    case "PUT":
      return "is-put";
    case "DELETE":
      return "is-delete";
    case "PATCH":
      return "is-patch";
    default:
      return "is-neutral";
  }
}
