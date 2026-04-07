import type { Tool } from "../types";
import type {
  PermissionBlastRadiusLevel,
  PermissionReversibilityLevel,
  PermissionRiskClass,
} from "../query/events";

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
  riskClass?: PermissionRiskClass;
  matchedRuleId?: string;
  suggestions?: PermissionSuggestion[];
}

export interface PermissionRiskProfile {
  riskClass?: PermissionRiskClass;
  reversibility: PermissionReversibilityLevel;
  blastRadius: PermissionBlastRadiusLevel;
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
const INTERACTIVE_COMMANDS = new Set([
  "vim",
  "vi",
  "nano",
  "top",
  "htop",
  "less",
  "more",
  "watch",
  "powershell",
  "pwsh",
  "cmd",
]);
const CRITICAL_HARD_BLOCK_SHELL_PATTERNS: RegExp[] = [
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\bdd\b[^\n]*\bof=/i,
  /\breg\s+delete\b/i,
  /\bfsutil\b/i,
];
const HIGH_RISK_CONFIRM_SHELL_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bremove-item\b[^\n]*-recurse\b[^\n]*-force\b/i,
  /\brmdir\b[^\n]*\s\/s\b[^\n]*\s\/q\b/i,
  /\b(del|erase)\b[^\n]*\s\/f\b/i,
  /\bshutdown\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\b[^\n]*(--force-with-lease|--force|-f)\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bgit\s+branch\s+-D\b/i,
  /\bgit\s+clean\b[^\n]*\s-f\b/i,
  /\bgit\s+stash\s+(drop|clear)\b/i,
  /\bdrop\s+(database|table)\b/i,
  /\btruncate\s+table\b/i,
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").trim().toLowerCase();
}

function isAbsolutePathLike(path: string): boolean {
  const value = path.trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("\\\\")) return true;
  return /^[a-zA-Z]:[\\/]/.test(value);
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

function shellLooksCriticalHardDangerous(commandLine: string): boolean {
  return CRITICAL_HARD_BLOCK_SHELL_PATTERNS.some((p) => p.test(commandLine));
}

function shellLooksHighRiskMutation(commandLine: string): boolean {
  return HIGH_RISK_CONFIRM_SHELL_PATTERNS.some((pattern) => pattern.test(commandLine));
}

export function getPermissionRiskProfile(riskClass: PermissionRiskClass | undefined): PermissionRiskProfile {
  switch (riskClass) {
    case "critical":
    case "high_risk":
      return {
        riskClass,
        reversibility: "hard_to_reverse",
        blastRadius: "shared",
      };
    case "interactive":
      return {
        riskClass,
        reversibility: "mixed",
        blastRadius: "workspace",
      };
    case "path_outside":
      return {
        riskClass,
        reversibility: "mixed",
        blastRadius: "shared",
      };
    case "policy":
    default:
      return {
        riskClass,
        reversibility: "reversible",
        blastRadius: "local",
      };
  }
}

function shellLooksInteractive(commandLine: string): boolean {
  const segments = splitCompoundShell(commandLine);
  if (segments.length === 0) return false;

  return segments.some((segment) => {
    const tokens = unwrapShellWrappers(tokenizeCommandLine(segment));
    if (tokens.length === 0) return false;
    const command = stripQuotes(tokens[0]).toLowerCase();
    if (!INTERACTIVE_COMMANDS.has(command)) return false;

    if (command === "powershell" || command === "pwsh") {
      const hasNonInteractiveSwitch = tokens.some((token) =>
        ["-command", "-c", "-file", "-encodedcommand"].includes(stripQuotes(token).toLowerCase()),
      );
      return !hasNonInteractiveSwitch;
    }

    if (command === "cmd") {
      return !tokens.some((token) => ["/c", "/k"].includes(stripQuotes(token).toLowerCase()));
    }

    return true;
  });
}

function shellReferencesParentTraversal(commandLine: string): boolean {
  return /(^|[\s"'`])\.\.(?:[\\/]|$)/.test(commandLine);
}

function extractShellPathCandidates(commandLine: string): string[] {
  const tokens = tokenizeCommandLine(commandLine).map(stripQuotes);
  const out = new Set<string>();

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed || trimmed.startsWith("-")) continue;
    if (/[|;&><]/.test(trimmed)) continue;
    if (!/[\\/]/.test(trimmed) && !/^[a-zA-Z]:/.test(trimmed)) continue;
    out.add(trimmed);
  }

  return [...out];
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
  if (!isAbsolutePathLike(path)) {
    // Relative paths are treated as workspace-relative.
    return true;
  }
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
  const linePreview = line.length > 96 ? `${line.slice(0, 96)}...` : line;

  if (!prefix) {
    return [];
  }

  return [
    {
      type: "allow_command_prefix",
      summary: `Allow this exact shell command in default mode: "${linePreview}"`,
      draft: {
        tool: "shell",
        behavior: "allow",
        mode: "default",
        matcher: { type: "exact_command", value: line },
        description: `Allow exact shell command: ${line}`,
      },
    },
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

function buildToolSuggestion(
  params: PermissionCheckInput,
  summary?: string,
  description?: string,
): PermissionSuggestion {
  return {
    type: "allow_tool",
    summary: summary ?? `Allow tool "${params.tool.name}" in default mode`,
    draft: {
      tool: params.tool.name,
      behavior: "allow",
      mode: "default",
      matcher: { type: "tool_only" },
      description: description ?? `Allow tool: ${params.tool.name}`,
    },
  };
}

export function decideToolPermission(params: PermissionCheckInput): PermissionDecision {
  const denyRule = params.rules.find((rule) => rule.behavior === "deny" && matchesRule(rule, params));
  if (denyRule) {
    return {
      behavior: "deny",
      reason: `Permission denied by rule "${denyRule.id}".`,
      riskClass: "policy",
      matchedRuleId: denyRule.id,
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

  if (params.tool.name === "shell") {
    const line = getShellCommandLine(params.input);
    if (shellLooksInteractive(line)) {
      return {
        behavior: "ask",
        reason: "Interactive shell command detected. Explicit confirmation required to avoid hanging UI sessions.",
        riskClass: "interactive",
        suggestions: buildShellSuggestions(params),
      };
    }
  }

  if (params.mode === "full_access") {
    return {
      behavior: "allow",
      reason: "Full access mode enabled.",
    };
  }

  if (ALWAYS_ALLOWED_MUTATING_TOOLS.has(params.tool.name)) {
    return {
      behavior: "allow",
      reason: `Tool "${params.tool.name}" is always allowed in default mode.`,
    };
  }

  const roots = getAllowedRoots(params);
  if (roots.length === 0) {
    return {
      behavior: "ask",
      reason: "No workspace is currently bound. Confirm this action before running tools outside a scoped project.",
      riskClass: "path_outside",
      suggestions: [
        buildToolSuggestion(
          params,
          `Allow tool "${params.tool.name}" when no workspace is bound`,
          `Allow ${params.tool.name} without workspace scope`,
        ),
      ],
    };
  }

  const primaryPath = getPrimaryPath(params.tool.name, params.input);
  if (primaryPath) {
    if (!isPathWithinRoots(primaryPath, roots)) {
      return {
        behavior: "ask",
        reason: `Path "${primaryPath}" is outside current workspace boundaries.`,
        riskClass: "path_outside",
        suggestions: [buildPathSuggestion(params, primaryPath)],
      };
    }
  }

  if (params.tool.name === "shell") {
    const line = getShellCommandLine(params.input);
    const pathCandidates = extractShellPathCandidates(line);
    const outsidePath = pathCandidates.find((candidate) => !isPathWithinRoots(candidate, roots));
    if (outsidePath) {
      return {
        behavior: "ask",
        reason: `Shell command references path outside workspace boundaries: "${outsidePath}".`,
        riskClass: "path_outside",
        suggestions: [...buildShellSuggestions(params), buildPathSuggestion(params, outsidePath)],
      };
    }
    if (shellReferencesParentTraversal(line)) {
      return {
        behavior: "ask",
        reason:
          "Shell command includes parent-directory traversal ('..'). Confirm before continuing to avoid escaping workspace boundaries.",
        riskClass: "path_outside",
        suggestions: buildShellSuggestions(params),
      };
    }

    if (shellLooksCriticalHardDangerous(line)) {
      return {
        behavior: "deny",
        reason:
          "Hard-blocked critical shell command detected (format / diskpart / mkfs / dd of= / reg delete / fsutil).",
        riskClass: "critical",
      };
    }

    if (shellLooksHighRiskMutation(line)) {
      return {
        behavior: "ask",
        reason:
          "High-risk shell mutation detected. Explicit confirmation required (rm -rf / recursive force delete / destructive git mutation / DB drop or truncate).",
        riskClass: "high_risk",
        suggestions: buildShellSuggestions(params),
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
      riskClass: "policy",
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
    riskClass: "policy",
    suggestions: [buildToolSuggestion(params)],
  };
}
