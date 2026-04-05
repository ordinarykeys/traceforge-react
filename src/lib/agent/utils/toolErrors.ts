import type { ZodError } from "zod";

function formatValidationPath(path: PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.reduce((acc, segment, index) => {
    const piece = String(segment);
    if (typeof segment === "number") {
      return `${String(acc)}[${piece}]`;
    }
    return index === 0 ? piece : `${String(acc)}.${piece}`;
  }, "") as string;
}

export function formatToolValidationError(toolName: string, error: ZodError): string {
  const details = error.issues
    .map((issue) => `${formatValidationPath(issue.path)}: ${issue.message}`)
    .join("; ");
  return `Tool "${toolName}" parameters invalid: ${details || error.message}`;
}

export function formatToolExecutionError(toolName: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes("failed to spawn process")) {
    return `Tool "${toolName}" failed to start: executable not found. Ensure it is installed and available in PATH.`;
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return `Tool "${toolName}" timed out. The command may be hanging or waiting for interactive input.`;
  }
  if (lower.includes("permission denied")) {
    return `Tool "${toolName}" failed due to insufficient permissions.`;
  }
  if (lower.includes("aborted") || lower.includes("abort")) {
    return `Tool "${toolName}" was interrupted.`;
  }

  return `Tool "${toolName}" execution failed: ${msg}`;
}

export function truncateToolOutput(output: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (output.length <= maxChars) return output;
  const half = Math.floor(maxChars / 2);
  const truncatedCount = output.length - maxChars;
  return `${output.substring(0, half)}\n\n... [${truncatedCount} characters truncated] ...\n\n${output.substring(output.length - half)}`;
}
