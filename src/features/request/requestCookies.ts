import {
  createKeyValueRow,
  type CookieBatchMode,
  type KeyValueRow,
  type ResponseCookie,
} from "./requestTypes";

export function serializeCookieRows(rows: KeyValueRow[], mode: CookieBatchMode) {
  const enabledRows = rows.filter((row) => row.enabled && row.key.trim());

  if (mode === "raw-json") {
    const cookieObject: Record<string, string> = {};
    enabledRows.forEach((row) => {
      cookieObject[row.key.trim()] = row.value;
    });
    return JSON.stringify(cookieObject, null, 2);
  }

  if (mode === "description") {
    return enabledRows.map((row) => `${row.key.trim()}: ${row.value}`).join("\n");
  }

  return enabledRows.map((row) => `${row.key.trim()}=${row.value}`).join("\n");
}

export function parseCookieBatchText(text: string, mode: CookieBatchMode) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [createKeyValueRow()];
  }

  if (mode === "raw-json") {
    let json: Record<string, unknown>;

    try {
      json = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new Error("Cookie JSON 格式不正确");
    }

    const rows = Object.entries(json).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
      description: "",
      enabled: true,
    }));

    return rows.length > 0 ? rows : [createKeyValueRow()];
  }

  const rows: KeyValueRow[] = [];
  trimmed.split(/\r?\n/).forEach((line) => {
    const rowText = line.trim();
    if (!rowText) {
      return;
    }

    const separatorIndex = mode === "description"
      ? rowText.indexOf(":")
      : rowText.indexOf("=");

    if (separatorIndex < 0) {
      return;
    }

    const key = rowText.slice(0, separatorIndex).trim();
    const value = rowText.slice(separatorIndex + 1).trim();

    if (!key) {
      return;
    }

    rows.push({
      key,
      value,
      description: "",
      enabled: true,
    });
  });

  return rows.length > 0 ? rows : [createKeyValueRow()];
}

function splitSetCookieHeader(headerValue: string) {
  const items: string[] = [];
  let current = "";
  let inExpires = false;

  for (let index = 0; index < headerValue.length; index += 1) {
    const nextChunk = headerValue.slice(index, index + 8).toLowerCase();
    const char = headerValue[index];

    if (nextChunk === "expires=") {
      inExpires = true;
    }

    if (char === ";") {
      inExpires = false;
    }

    if (char === "," && !inExpires) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseSingleSetCookie(cookieText: string): ResponseCookie {
  const parts = cookieText.trim().split(";");
  const [nameValue = "", ...attributes] = parts;
  const separatorIndex = nameValue.indexOf("=");
  const name = separatorIndex >= 0 ? nameValue.slice(0, separatorIndex).trim() : nameValue.trim();
  const value = separatorIndex >= 0 ? nameValue.slice(separatorIndex + 1).trim() : "";

  const cookie: ResponseCookie = {
    name,
    value,
  };

  attributes.forEach((attribute) => {
    const [rawKey, ...rest] = attribute.trim().split("=");
    const key = rawKey.toLowerCase();
    const attributeValue = rest.join("=").trim();

    if (key === "domain") {
      cookie.domain = attributeValue;
    } else if (key === "path") {
      cookie.path = attributeValue;
    } else if (key === "expires") {
      cookie.expires = attributeValue;
    } else if (key === "samesite") {
      cookie.sameSite = attributeValue;
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    }
  });

  return cookie;
}

export function parseResponseCookies(setCookies: string[]) {
  return setCookies
    .flatMap((item) => splitSetCookieHeader(item))
    .map((item) => parseSingleSetCookie(item))
    .filter((cookie) => cookie.name);
}
