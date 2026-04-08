import { isAbsolutePathLike } from "./workspace";

const SHELL_TIMEOUT_MIN_MS = 1_000;
const SHELL_TIMEOUT_DEFAULT_MS = 120_000;
const SHELL_TIMEOUT_LONG_TASK_MS = 600_000;
const SHELL_TIMEOUT_MAX_MS = 30 * 60_000;

function clampShellTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return SHELL_TIMEOUT_DEFAULT_MS;
  const rounded = Math.round(value);
  if (rounded < SHELL_TIMEOUT_MIN_MS) return SHELL_TIMEOUT_MIN_MS;
  if (rounded > SHELL_TIMEOUT_MAX_MS) return SHELL_TIMEOUT_MAX_MS;
  return rounded;
}

function inferShellTimeoutMs(cmd: string, args: string[]): number {
  const joined = `${cmd} ${args.join(" ")}`.toLowerCase();
  if (
    /\b(npm|pnpm|yarn|bun|cargo|rustc|go|dotnet|gradle|mvn|msbuild|pytest|jest|vitest|playwright|webpack|vite|tsc)\b/.test(
      joined,
    )
  ) {
    return SHELL_TIMEOUT_LONG_TASK_MS;
  }
  if (/\bgit\s+(clone|fetch|pull|gc|fsck|submodule)\b/.test(joined)) {
    return 300_000;
  }
  if (/\b(rg|ripgrep|grep|findstr)\b/.test(joined) && /(--glob|-g|-r|--recursive)/.test(joined)) {
    return 240_000;
  }
  return SHELL_TIMEOUT_DEFAULT_MS;
}

export function resolveShellTimeoutMs(rawTimeoutMs: unknown, cmd: string, args: string[]): number {
  if (typeof rawTimeoutMs === "number") {
    return clampShellTimeoutMs(rawTimeoutMs);
  }
  return clampShellTimeoutMs(inferShellTimeoutMs(cmd, args));
}

function tokenizeShellScript(script: string): string[] {
  return script.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) ?? [];
}

function normalizeShellToken(token: string): string {
  const trimmed = token.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function looksLikePathToken(token: string): boolean {
  const normalized = normalizeShellToken(token);
  if (!normalized) {
    return false;
  }
  if (/^\/[a-z?]{1,2}$/i.test(normalized)) {
    return false;
  }
  if (normalized.startsWith("-")) {
    return false;
  }
  if (isAbsolutePathLike(normalized)) {
    return true;
  }
  if (normalized === "." || normalized === "..") {
    return true;
  }
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    return true;
  }
  return normalized.includes("/") || normalized.includes("\\");
}

export function extractShellPathCandidates(cmd: string, args: string[]): string[] {
  const normalizedArgs = args.map((arg) => normalizeShellToken(arg)).filter(Boolean);
  const command = cmd.trim().toLowerCase();
  const candidates = new Set<string>();

  const collectFromTokens = (tokens: string[]) => {
    for (const token of tokens) {
      if (looksLikePathToken(token)) {
        candidates.add(normalizeShellToken(token));
      }
    }
  };

  const rootTokens =
    command === "cmd" && normalizedArgs.length > 0 && normalizedArgs[0]?.startsWith("/")
      ? normalizedArgs.slice(1)
      : normalizedArgs;
  collectFromTokens(rootTokens);

  if (command === "cmd" && normalizedArgs.length >= 2 && normalizedArgs[0].toLowerCase() === "/c") {
    collectFromTokens(tokenizeShellScript(normalizedArgs.slice(1).join(" ")));
  }
  if (command === "powershell" || command === "pwsh") {
    const scriptIndex = normalizedArgs.findIndex((arg) => {
      const normalized = arg.toLowerCase();
      return normalized === "-command" || normalized === "-c";
    });
    if (scriptIndex >= 0 && normalizedArgs[scriptIndex + 1]) {
      collectFromTokens(tokenizeShellScript(normalizedArgs.slice(scriptIndex + 1).join(" ")));
    }
  }

  return [...candidates];
}

function detectDeleteTargetFromTokens(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const command = tokens[0].toLowerCase();
  const deleteCommands = new Set(["rm", "del", "erase", "remove-item", "ri", "rmdir", "rd"]);
  const optionNeedsValue = new Set(["-path", "-literalpath"]);
  if (!deleteCommands.has(command)) {
    return null;
  }

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (optionNeedsValue.has(lower)) {
      const next = tokens[i + 1];
      if (next) {
        return normalizeShellToken(next);
      }
      continue;
    }

    if (token.startsWith("-") || token.startsWith("/")) {
      continue;
    }

    return normalizeShellToken(token);
  }

  return null;
}

export function detectDeleteTargetFromShell(cmd: string, args: string[]): string | null {
  const lowerCmd = cmd.trim().toLowerCase();
  const normalizedArgs = args.map((arg) => arg.trim()).filter(Boolean);

  if (
    lowerCmd === "rm" ||
    lowerCmd === "del" ||
    lowerCmd === "erase" ||
    lowerCmd === "remove-item" ||
    lowerCmd === "ri" ||
    lowerCmd === "rmdir" ||
    lowerCmd === "rd"
  ) {
    return detectDeleteTargetFromTokens([lowerCmd, ...normalizedArgs]);
  }

  if (lowerCmd === "cmd" && normalizedArgs.length >= 2 && normalizedArgs[0].toLowerCase() === "/c") {
    const commandPart = normalizedArgs.slice(1);
    const tokens = commandPart.length === 1 ? tokenizeShellScript(commandPart[0]) : commandPart;
    return detectDeleteTargetFromTokens(tokens);
  }

  if (lowerCmd === "powershell" || lowerCmd === "pwsh") {
    const commandIndex = normalizedArgs.findIndex((arg) => {
      const normalized = arg.toLowerCase();
      return normalized === "-command" || normalized === "-c";
    });
    if (commandIndex >= 0 && normalizedArgs[commandIndex + 1]) {
      const script = normalizedArgs.slice(commandIndex + 1).join(" ");
      const fromScript = detectDeleteTargetFromTokens(tokenizeShellScript(script));
      if (fromScript) {
        return fromScript;
      }
    }
    return detectDeleteTargetFromTokens(normalizedArgs);
  }

  return null;
}

