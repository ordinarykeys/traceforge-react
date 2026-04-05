import { invoke } from "@tauri-apps/api/core";

export type SendHttpRequestPayload = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyKind?: "none" | "text" | "form-data";
  formData?: Array<{
    key: string;
    type: "text" | "file";
    value?: string;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  }>;
  timeoutMs?: number;
};

export type SendHttpRequestResponse = {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
  setCookies: string[];
};

export function sendHttpRequest(payload: SendHttpRequestPayload) {
  return invoke<SendHttpRequestResponse>("send_http_request", {
    request: {
      method: payload.method,
      url: payload.url,
      headers: payload.headers,
      body: payload.body,
      body_kind: payload.bodyKind,
      form_data: payload.formData,
      timeout_ms: payload.timeoutMs,
    },
  });
}
