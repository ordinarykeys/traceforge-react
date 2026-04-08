import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const FileReadTool: Tool<any, any> = {
  name: "file_read",
  description: "Read contents of a local file. Supports reading specific line ranges to handle large files efficiently.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the file to read"),
    start_line: z.number().optional().describe("Start line number (1-indexed). Omit to read from beginning."),
    end_line: z.number().optional().describe("End line number (1-indexed, inclusive). Omit to read to end."),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file to read" },
      start_line: { type: "number", description: "Start line number (1-indexed). Omit to read from beginning." },
      end_line: { type: "number", description: "End line number (1-indexed, inclusive). Omit to read to end." },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 50000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "file_read");
    const lineRange = params.start_line ? ` (lines ${params.start_line}-${params.end_line || "end"})` : "";
    context.log(`[FileRead] ${resolvedPath}${lineRange}`);

    try {
      const response: any = await invoke("invoke_agent_read_file", {
        request: {
          path: resolvedPath,
          start_line: params.start_line || null,
          end_line: params.end_line || null,
        },
      });

      if (!response.success) {
        return `File read error: ${response.error}`;
      }

      return `[File: ${resolvedPath} | Total lines: ${response.total_lines}${lineRange}]\n${response.content}`;
    } catch (e) {
      throw new Error(`File read error: ${e}`);
    }
  },
};

