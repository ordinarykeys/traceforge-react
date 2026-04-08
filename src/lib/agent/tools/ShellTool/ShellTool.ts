import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import {
  buildWorkspaceGuardError,
  detectDeleteTargetFromShell,
  ensureWorkspacePath,
  extractShellPathCandidates,
  getWorkspaceRoots,
  readFileTextForPreview,
  resolveShellTimeoutMs,
  splitLines,
} from "../runtime";

export const ShellTool: Tool<any, any> = {
  name: "shell",
  description:
    "Execute shell commands in the host system. Use for file operations, search, and general CLI workflows. IMPORTANT: Returns actual stdout/stderr output.",
  inputSchema: z.object({
    cmd: z.string().describe("The command to execute (e.g., 'grep', 'find', 'cat')"),
    args: z.array(z.string()).optional().describe("Arguments for the command"),
    cwd: z.string().optional().describe("Working directory for the command"),
    timeout_ms: z
      .number()
      .optional()
      .describe("Optional timeout in milliseconds (adaptive default: 120000, long tasks up to 600000)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "The command to execute (e.g., 'grep', 'find', 'cat')" },
      args: { type: "array", items: { type: "string" }, description: "Arguments for the command" },
      cwd: { type: "string", description: "Working directory for the command" },
      timeout_ms: {
        type: "number",
        description: "Optional timeout in milliseconds (adaptive default: 120000, long tasks up to 600000)",
      },
    },
    required: ["cmd"],
  },
  isReadOnly: false,
  maxOutputChars: 30000,
  call: async (params, context: ToolContext) => {
    let cmd = params.cmd;
    let args = [...(params.args || [])];

    if (cmd.toLowerCase() === "cmd" && (args[0] || "").toLowerCase() !== "/c") {
      args = ["/c", ...args];
      context.log(`[Shell] auto-fix: prepended "/c" for cmd`);
    }

    const timeoutMs = resolveShellTimeoutMs(params.timeout_ms, cmd, args);
    const cwdInput = params.cwd || context.workingDir || "";
    if (!cwdInput.trim()) {
      throw new Error(buildWorkspaceGuardError("shell", "(missing cwd)", getWorkspaceRoots(context)));
    }
    const workingDirForCommand = ensureWorkspacePath(cwdInput, context, "shell cwd");
    const scopedShellContext: ToolContext = {
      ...context,
      workingDir: workingDirForCommand,
    };

    const referencedPaths = extractShellPathCandidates(cmd, args);
    for (const referencedPath of referencedPaths) {
      ensureWorkspacePath(referencedPath, scopedShellContext, "shell path");
    }

    const deleteTargetRaw = detectDeleteTargetFromShell(cmd, args);
    const deleteTargetPath = deleteTargetRaw
      ? ensureWorkspacePath(deleteTargetRaw, scopedShellContext, "shell delete target")
      : null;
    const deletedFileBefore = deleteTargetPath ? await readFileTextForPreview(deleteTargetPath) : null;

    context.log(`[Shell] ${cmd} ${args.join(" ")}`);

    try {
      const response: any = await invoke("invoke_agent_task_execution", {
        request: {
          cmd,
          args,
          cwd: workingDirForCommand,
          timeout_ms: timeoutMs,
        },
      });

      if (!response.success && !response.interrupted) {
        return `Command failed (exit code: ${response.exit_code})\nstderr: ${response.stderr}`;
      }

      let output = response.stdout || "(no output)";
      if (response.interrupted) {
        output += "\n\n[Timeout] Command was interrupted due to timeout.";
      }

      if (response.success && deleteTargetPath && deletedFileBefore !== null) {
        const removedLines = splitLines(deletedFileBefore).filter((line) => line.length > 0);
        context.log(`[Delete] ${deleteTargetPath}`);
        const previewLines = removedLines.slice(0, 80);
        for (const line of previewLines) {
          context.log(`-${line}`);
        }
        if (removedLines.length > previewLines.length) {
          context.log(`[Delete] ... ${removedLines.length - previewLines.length} more lines omitted`);
        }
      }
      return output;
    } catch (e) {
      throw new Error(`Shell execution error: ${e}`);
    }
  },
};

