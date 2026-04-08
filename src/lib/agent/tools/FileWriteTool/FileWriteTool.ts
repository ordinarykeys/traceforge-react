import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { buildLineDiffPreview, ensureWorkspacePath, readFileTextForPreview } from "../runtime";

export const FileWriteTool: Tool<any, any> = {
  name: "file_write",
  description: "Write content to a file. Automatically creates a .bak backup before overwriting.",
  inputSchema: z.object({
    path: z.string().describe("Target file path"),
    content: z.string().describe("Content to write"),
    create_backup: z.boolean().optional().describe("Create .bak backup before overwriting (default: true)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target file path" },
      content: { type: "string", description: "Content to write" },
      create_backup: { type: "boolean", description: "Create .bak backup (default: true)" },
    },
    required: ["path", "content"],
  },
  isReadOnly: false,
  maxOutputChars: 500,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "file_write");
    context.log(`[FileWrite/Rust] Writing to ${resolvedPath}`);
    const previousContent = await readFileTextForPreview(resolvedPath);

    try {
      const result: string = await invoke("invoke_agent_write_file", {
        request: {
          path: resolvedPath,
          content: params.content,
          create_backup: params.create_backup !== undefined ? params.create_backup : true,
          working_dir: context.workingDir ?? null,
          thread_id: context.threadId ?? null,
          turn_id: context.turnId ?? null,
        },
      });

      const diff = buildLineDiffPreview(previousContent ?? "", params.content, 120);
      context.log(`[Edit] ${resolvedPath} +${diff.added} -${diff.removed}`);
      if (diff.lines.length > 0) {
        for (const line of diff.lines) {
          context.log(line);
        }
      }
      if (diff.truncated) {
        context.log(`[Edit] ... diff truncated, only showing first ${diff.lines.length} lines`);
      }

      return result;
    } catch (e) {
      throw new Error(`File write error: ${e}`);
    }
  },
};

