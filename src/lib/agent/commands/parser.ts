import type { ParsedSlashCommand } from "./types";

export function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of raw) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const raw = input.trim();
  if (!raw.startsWith("/")) {
    return null;
  }
  const body = raw.slice(1).trim();
  if (body.length === 0) {
    return {
      raw,
      name: "help",
      args: [],
      rawArgs: "",
    };
  }

  const tokens = tokenizeArgs(body);
  if (tokens.length === 0) {
    return {
      raw,
      name: "help",
      args: [],
      rawArgs: "",
    };
  }

  const name = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const rawArgs = body.slice(tokens[0].length).trimStart();
  return {
    raw,
    name,
    args,
    rawArgs,
  };
}
