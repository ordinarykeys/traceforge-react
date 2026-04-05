import type { Tool } from "../types";

export type ToolPermissionMode = "default" | "full_access";
export type PermissionBehavior = "allow" | "ask" | "deny";

export type PermissionMatcher =
  | { type: "tool_only" }
  | { type: "exact_command"; value: string }
  | { type: "command_prefix"; value: string }
  | { type: "path_prefix"; value: string };

export interface PermissionRule {
  id: string;
  tool: string;
  behavior: Exclude<PermissionBehavior, "ask">;
  mode?: ToolPermissionMode | "any";
  matcher: PermissionMatcher;
  description?: string;
}

export interface PermissionRuleDraft {
  tool: string;
  behavior: Exclude<PermissionBehavior, "ask">;
  mode?: ToolPermissionMode | "any";
  matcher: PermissionMatcher;
  description?: string;
}

export interface PermissionSuggestion {
  type: "allow_command_prefix" | "allow_path_prefix" | "allow_tool";
  summary: string;
  draft: PermissionRuleDraft;
}

export interface PermissionDecision {
  behavior: PermissionBehavior;
  reason: string;
  matchedRuleId?: string;
  suggestions?: PermissionSuggestion[];
}

interface PermissionCheckInput {
  tool: Tool;
  input: unknown;
  mode: ToolPermissionMode;
  rules: PermissionRule[];
  workingDir?: string;
  additionalWorkingDirectories?: string[];
}

const ALWAYS_ALLOWED_MUTATING_TOOLS = new Set(["memory"]);
const SAFE_WRAPPER_COMMANDS = new Set(["env", "command", "timeout", "nohup", "nice", "stdbuf"]);
const READ_ONLY_COMMANDS = new Set([
  "cat",
  "type",
  "ls",
  "dir",
  "pwd",
  "echo",
  "grep",
  "rg",
  "find",
  "findstr",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "which",
  "where",
  "whoami",
  "date",
  "tree",
]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show", "branch", "rev-parse"]);
const HARD_BLOCK_SHELL_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\b/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdd\b[^\n]*\bof=/i,
  /\bshutdown\b/i,
  /\breg\s+delete\b/i,
  /\bremove-item\b[^\n]*-recurse\b/i,
  /\bfsutil\b/i,
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").trim().toLowerCase();
}

function stripQuotes(token: string): string {
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith("\"") && token.endsWith("\""))) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenizeCommandLine(command: string): string[] {
  const out: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of command) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === "\"" && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function splitCompoundShell(commandLine: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < commandLine.length; i++) {
    const ch = commandLine[i];
    const next = commandLine[i + 1];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === "\"" && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    const isOperator =
      !inSingle &&
      !inDouble &&
      (ch === ";" ||
        (ch === "|" && next === "|") ||
        (ch === "&" && next === "&") ||
        (ch === "|"));

    if (isOperator) {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      if ((ch === "|" && next === "|") || (ch === "&" && next === "&")) {
        i += 1;
      }
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function unwrapShellWrappers(tokens: string[]): string[] {
  const result = [...tokens];
  while (result.length > 1) {
    const first = stripQuotes(result[0]).toLowerCase();
    if (!SAFE_WRAPPER_COMMANDS.has(first)) break;
    result.shift();
  }
  return result;
}

function getShellCommandLine(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as { cmd?: unknown; args?: unknown };
  const cmd = typeof record.cmd === "string" ? record.cmd : "";
  const args = Array.isArray(record.args)
    ? record.args.filter((x): x is string => typeof x === "string")
    : [];
  return [cmd, ...args].join(" ").trim();
}

function shellLooksHardDangerous(commandLine: string): boolean {
  return HARD_BLOCK_SHELL_PATTERNS.some((p) => p.test(commandLine));
}

function shellSegmentIsReadOnly(segment: string): boolean {
  if (/[>]{1,2}/.test(segment)) return false;
  const rawTokens = tokenizeCommandLine(segment);
  const tokens = unwrapShellWrappers(rawTokens);
  if (tokens.length === 0) return true;

  const command = stripQuotes(tokens[0]).toLowerCase();
  if (READ_ONLY_COMMANDS.has(command)) return true;

  if (command === "git") {
    const sub = stripQuotes(tokens[1] ?? "").toLowerCase();
    return READ_ONLY_GIT_SUBCOMMANDS.has(sub);
  }

  if (command === "cmd") {
    const lower = segment.toLowerCase();
    return lower.includes("/c dir") || lower.includes("/c type") || lower.includes("/c echo");
  }

  if (command === "powershell" || command === "pwsh") {
    const lower = segment.toLowerCase();
    if (lower.includes("remove-item") || lower.includes("set-content") || lower.includes("new-item")) {
      return false;
    }
    return lower.includes("get-childitem") || lower.includes("select-string") || lower.includes("get-content");
  }

  return false;
}

function getPrimaryPath(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  if (toolName === "shell" && typeof record.cwd === "string") return record.cwd;
  if (typeof record.path === "string") return record.path;
  if (typeof record.search_path === "string") return record.search_path;
  if (typeof record.output_dir === "string") return record.output_dir;
  if (typeof record.input_path === "string") return record.input_path;

  return null;
}

function getAllowedRoots(params: PermissionCheckInput): string[] {
  const roots = [params.workingDir, ...(params.additionalWorkingDirectories ?? [])]
    .filter((x): x is string => Boolean(x))
    .map(normalizePath);
  return [...new Set(roots)];
}

function isPathWithinRoots(path: string, roots: string[]): boolean {
  if (roots.length === 0) return true;
  const current = normalizePath(path);
  return roots.some((root) => current === root || current.startsWith(`${root}/`));
}

function ruleModeMatches(ruleMode: PermissionRule["mode"], currentMode: ToolPermissionMode): boolean {
  return !ruleMode || ruleMode === "any" || ruleMode === currentMode;
}

function ruleToolMatches(ruleTool: string, toolName: string): boolean {
  return ruleTool === "*" || normalizeText(ruleTool) === normalizeText(toolName);
}

function ruleMatcherMatches(rule: PermissionRule, params: PermissionCheckInput): boolean {
  const matcher = rule.matcher;
  if (matcher.type === "tool_only") return true;

  if (matcher.type === "exact_command" || matcher.type === "command_prefix") {
    if (params.tool.name !== "shell") return false;
    const line = normalizeText(getShellCommandLine(params.input));
    const value = normalizeText(matcher.value);
    return matcher.type === "exact_command" ? line === value : line.startsWith(value);
  }

  if (matcher.type === "path_prefix") {
    const path = getPrimaryPath(params.tool.name, params.input);
    if (!path) return false;
    return normalizePath(path).startsWith(normalizePath(matcher.value));
  }

  return false;
}

function matchesRule(rule: PermissionRule, params: PermissionCheckInput): boolean {
  return (
    ruleToolMatches(rule.tool, params.tool.name) &&
    ruleModeMatches(rule.mode, params.mode) &&
    ruleMatcherMatches(rule, params)
  );
}

function buildShellSuggestions(params: PermissionCheckInput): PermissionSuggestion[] {
  const line = getShellCommandLine(params.input);
  const segments = splitCompoundShell(line);
  const first = segments[0] ?? line;
  const prefixTokens = tokenizeCommandLine(first).slice(0, 2).map(stripQuotes);
  const prefix = prefixTokens.join(" ").trim();

  if (!prefix) {
    return [];
  }

  return [
    {
      type: "allow_command_prefix",
      summary: `Allow future shell commands starting with "${prefix}" in default mode`,
      draft: {
        tool: "shell",
        behavior: "allow",
        mode: "default",
        matcher: { type: "command_prefix", value: prefix },
        description: `Allow shell prefix: ${prefix}`,
      },
    },
  ];
}

function buildPathSuggestion(params: PermissionCheckInput, path: string): PermissionSuggestion {
  return {
    type: "allow_path_prefix",
    summary: `Allow tool "${params.tool.name}" to access path prefix "${path}"`,
    draft: {
      tool: params.tool.name,
      behavior: "allow",
      mode: "default",
      matcher: { type: "path_prefix", value: path },
      description: `Allow ${params.tool.name} path prefix: ${path}`,
    },
  };
}

export function decideToolPermission(params: PermissionCheckInput): PermissionDecision {
  const denyRule = params.rules.find((rule) => rule.behavior === "deny" && matchesRule(rule, params));
  if (denyRule) {
    return {
      behavior: "deny",
      reason: `Permission denied by rule "${denyRule.id}".`,
      matchedRuleId: denyRule.id,
    };
  }

  if (params.mode === "full_access") {
    return {
      behavior: "allow",
      reason: "Full access mode enabled.",
    };
  }

  const allowRule = params.rules.find((rule) => rule.behavior === "allow" && matchesRule(rule, params));
  if (allowRule) {
    return {
      behavior: "allow",
      reason: `Permission allowed by rule "${allowRule.id}".`,
      matchedRuleId: allowRule.id,
    };
  }

  if (ALWAYS_ALLOWED_MUTATING_TOOLS.has(params.tool.name)) {
    return {
      behavior: "allow",
      reason: `Tool "${params.tool.name}" is always allowed in default mode.`,
    };
  }

  const primaryPath = getPrimaryPath(params.tool.name, params.input);
  if (primaryPath) {
    const roots = getAllowedRoots(params);
    if (!isPathWithinRoots(primaryPath, roots)) {
      return {
        behavior: "ask",
        reason: `Path "${primaryPath}" is outside current workspace boundaries.`,
        suggestions: [buildPathSuggestion(params, primaryPath)],
      };
    }
  }

  if (params.tool.name === "shell") {
    const line = getShellCommandLine(params.input);
    if (shellLooksHardDangerous(line)) {
      return {
        behavior: "deny",
        reason: "Hard-blocked dangerous shell command.",
      };
    }

    const segments = splitCompoundShell(line);
    const allReadOnly = segments.length > 0 && segments.every(shellSegmentIsReadOnly);
    if (allReadOnly) {
      return {
        behavior: "allow",
        reason: "Read-only shell command sequence.",
      };
    }

    return {
      behavior: "ask",
      reason: "Shell command may modify system state. Approval rule required in default mode.",
      suggestions: buildShellSuggestions(params),
    };
  }

  if (params.tool.isReadOnly) {
    return {
      behavior: "allow",
      reason: `Read-only tool "${params.tool.name}" allowed.`,
    };
  }

  return {
    behavior: "ask",
    reason: `Tool "${params.tool.name}" requires explicit allow rule or full access mode.`,
    suggestions: [
      {
        type: "allow_tool",
        summary: `Allow tool "${params.tool.name}" in default mode`,
        draft: {
          tool: params.tool.name,
          behavior: "allow",
          mode: "default",
          matcher: { type: "tool_only" },
          description: `Allow tool: ${params.tool.name}`,
        },
      },
    ],
  };
}

