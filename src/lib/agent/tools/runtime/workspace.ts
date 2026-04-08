import type { ToolContext } from "../../types";

export function isAbsolutePathLike(path: string): boolean {
  const value = path.trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("\\\\")) return true;
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function normalizeRuntimePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  if (normalized.startsWith("//")) {
    return `//${normalized.slice(2).replace(/\/+/g, "/")}`;
  }
  return normalized.replace(/\/+/g, "/");
}

function canonicalizeRuntimePath(path: string): string {
  const normalized = normalizeRuntimePath(path);
  if (!normalized) {
    return normalized;
  }

  const driveMatch = normalized.match(/^[a-zA-Z]:/);
  const hasUncPrefix = normalized.startsWith("//");
  const hasUnixRoot = !driveMatch && !hasUncPrefix && normalized.startsWith("/");

  let prefix = "";
  let remainder = normalized;
  if (driveMatch) {
    prefix = driveMatch[0].toLowerCase();
    remainder = normalized.slice(driveMatch[0].length);
  } else if (hasUncPrefix) {
    prefix = "//";
    remainder = normalized.slice(2);
  } else if (hasUnixRoot) {
    prefix = "/";
    remainder = normalized.slice(1);
  }

  const segments = remainder.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!prefix) {
        stack.push("..");
      }
      continue;
    }
    stack.push(segment);
  }

  const joined = stack.join("/");
  if (driveMatch) {
    return joined ? `${prefix}/${joined}` : `${prefix}/`;
  }
  if (hasUncPrefix) {
    return joined ? `//${joined}` : "//";
  }
  if (hasUnixRoot) {
    return joined ? `/${joined}` : "/";
  }
  return joined || ".";
}

function normalizePathForCompare(path: string): string {
  return canonicalizeRuntimePath(path).toLowerCase();
}

function dedupeRoots(paths: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const path of paths) {
    const normalized = normalizePathForCompare(path);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(canonicalizeRuntimePath(path));
  }
  return output;
}

export function getWorkspaceRoots(context: ToolContext): string[] {
  const appState = context.getAppState?.() ?? {};
  const additionalWorkingDirectories = Array.isArray(appState.additionalWorkingDirectories)
    ? appState.additionalWorkingDirectories.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const candidates = [
    context.workingDir,
    typeof appState.workingDir === "string" ? appState.workingDir : undefined,
    ...additionalWorkingDirectories,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map((value) => canonicalizeRuntimePath(value))
    .filter((value) => isAbsolutePathLike(value));
  return dedupeRoots(candidates);
}

function isPathWithinWorkspaceRoots(path: string, roots: string[]): boolean {
  if (roots.length === 0) {
    return false;
  }
  const normalizedPath = normalizePathForCompare(path);
  if (!isAbsolutePathLike(normalizedPath)) {
    return false;
  }
  return roots.some((root) => {
    const normalizedRoot = normalizePathForCompare(root).replace(/\/+$/, "");
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
  });
}

export function buildWorkspaceGuardError(operation: string, path: string, roots: string[]): string {
  if (roots.length === 0) {
    return `[WorkspaceGuard] Blocked ${operation}: no workspace is bound. Select a workspace first.`;
  }
  const rootLines = roots.map((root) => `- ${root}`).join("\n");
  return `[WorkspaceGuard] Blocked ${operation}: "${path}" is outside workspace boundaries.\nAllowed roots:\n${rootLines}`;
}

function resolveWorkspacePath(path: string, context: ToolContext): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (isAbsolutePathLike(trimmed)) {
    return canonicalizeRuntimePath(trimmed);
  }
  const workspace = canonicalizeRuntimePath((context.workingDir || "").trim());
  if (!workspace || workspace === ".") {
    return canonicalizeRuntimePath(trimmed);
  }
  const base = workspace.replace(/\/+$/, "");
  const rel = canonicalizeRuntimePath(trimmed).replace(/^\.\/+/, "").replace(/^\/+/, "");
  return canonicalizeRuntimePath(`${base}/${rel}`);
}

export function ensureWorkspacePath(path: string, context: ToolContext, operation: string): string {
  const resolved = resolveWorkspacePath(path, context);
  const roots = getWorkspaceRoots(context);
  if (!isPathWithinWorkspaceRoots(resolved, roots)) {
    throw new Error(buildWorkspaceGuardError(operation, resolved, roots));
  }
  return resolved;
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

