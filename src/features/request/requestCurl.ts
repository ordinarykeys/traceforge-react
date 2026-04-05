import {
  createFormDataField,
  createRequestAuthConfig,
  createRequestDocument,
  createKeyValueRow,
  type FormDataField,
  type HttpMethod,
  type KeyValueRow,
  type RequestDocument,
} from "./requestTypes";

type ParsedCurlResult = {
  request: RequestDocument;
  warnings: string[];
};

function tokenizeCurl(input: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function pushHeader(rows: KeyValueRow[], header: string) {
  const separatorIndex = header.indexOf(":");
  if (separatorIndex === -1) {
    return;
  }

  const key = header.slice(0, separatorIndex).trim();
  const value = header.slice(separatorIndex + 1).trim();
  if (!key) {
    return;
  }

  rows.push({
    key,
    value,
    description: "",
    enabled: true,
  });
}

function pushCookies(rows: KeyValueRow[], cookieHeader: string) {
  cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [key, ...rest] = part.split("=");
      if (!key || rest.length === 0) {
        return;
      }
      rows.push({
        key: key.trim(),
        value: rest.join("=").trim(),
        description: "",
        enabled: true,
      });
    });
}

function inferBodyType(body: string, headers: KeyValueRow[], hasFormData: boolean) {
  if (hasFormData) {
    return "form-data" as const;
  }

  const contentType = headers.find((row) => row.key.toLowerCase() === "content-type")?.value ?? "";
  if (contentType.includes("application/json")) {
    return "json" as const;
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return "form" as const;
  }
  if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
    return "json" as const;
  }
  return body ? ("raw" as const) : ("none" as const);
}

function normalizeRows(rows: KeyValueRow[]) {
  return rows.length > 0 ? rows : [createKeyValueRow()];
}

function normalizeFormData(fields: FormDataField[]) {
  return fields.length > 0 ? fields : [createFormDataField()];
}

export function parseCurlCommand(command: string, baseRequest?: Partial<RequestDocument>): ParsedCurlResult {
  const tokens = tokenizeCurl(command);
  if (tokens.length === 0 || tokens[0].toLowerCase() !== "curl") {
    throw new Error("Please paste a curl command that starts with curl");
  }

  let method: HttpMethod = "GET";
  let url = "";
  let body = "";
  const warnings: string[] = [];
  const headers: KeyValueRow[] = [];
  const cookies: KeyValueRow[] = [];
  const formDataFields: FormDataField[] = [];
  const auth = createRequestAuthConfig();

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];

    switch (token) {
      case "-X":
      case "--request":
        if (next) {
          method = next.toUpperCase() as HttpMethod;
          index += 1;
        }
        break;
      case "-H":
      case "--header":
        if (next) {
          if (next.toLowerCase().startsWith("cookie:")) {
            pushCookies(cookies, next.slice(7).trim());
          } else {
            pushHeader(headers, next);
          }
          index += 1;
        }
        break;
      case "-b":
      case "--cookie":
        if (next) {
          pushCookies(cookies, next);
          index += 1;
        }
        break;
      case "-u":
      case "--user":
        if (next) {
          const [username, password = ""] = next.split(":", 2);
          auth.type = "basic";
          auth.username = username;
          auth.password = password;
          index += 1;
        }
        break;
      case "-A":
      case "--user-agent":
        if (next) {
          headers.push({
            key: "User-Agent",
            value: next,
            description: "",
            enabled: true,
          });
          index += 1;
        }
        break;
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
      case "--data-urlencode":
        if (next) {
          body = next;
          if (method === "GET") {
            method = "POST";
          }
          index += 1;
        }
        break;
      case "-F":
      case "--form":
        if (next) {
          const [key, ...rest] = next.split("=");
          const rawValue = rest.join("=");
          const field = createFormDataField();
          field.key = key.trim();
          if (rawValue.startsWith("@")) {
            field.type = "file";
            field.value = rawValue.slice(1);
            field.fileName = rawValue.split(/[\\/]/).pop() ?? rawValue.slice(1);
            warnings.push(
              `File field ${field.key || "(unnamed)"} was imported as a placeholder path; please re-select the local file before sending.`,
            );
          } else {
            field.type = "text";
            field.value = rawValue;
          }
          formDataFields.push(field);
          if (method === "GET") {
            method = "POST";
          }
          index += 1;
        }
        break;
      case "--url":
        if (next) {
          url = next;
          index += 1;
        }
        break;
      case "--compressed":
      case "--insecure":
      case "-k":
      case "--location":
      case "-L":
      case "--silent":
      case "-s":
        break;
      default:
        if (!token.startsWith("-") && /^https?:\/\//i.test(token)) {
          url = token;
        } else if (token.startsWith("-")) {
          warnings.push(`Unsupported curl flag ignored: ${token}`);
          if (next && !next.startsWith("-")) {
            index += 1;
          }
        }
        break;
    }
  }

  const normalizedHeaders = normalizeRows(headers);
  const normalizedCookies = normalizeRows(cookies);
  const normalizedFormData = normalizeFormData(formDataFields);
  const bodyType = inferBodyType(body, headers, formDataFields.length > 0);

  const request = createRequestDocument({
    ...baseRequest,
    method,
    url,
    headers: normalizedHeaders,
    cookies: normalizedCookies,
    body,
    bodyType,
    formDataFields: normalizedFormData,
    auth,
    updatedAt: Date.now(),
  });

  return { request, warnings };
}
