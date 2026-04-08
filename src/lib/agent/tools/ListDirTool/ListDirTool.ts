import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const ListDirTool: Tool<any, any> = {
  name: "list_dir",
  description:
    "List files and directories with metadata (size, type). Uses native Rust for fast traversal. Supports recursive listing, depth limit, and extension filtering.",
  inputSchema: z.object({
    path: z.string().describe("Directory path to list"),
    recursive: z.boolean().optional().describe("Recurse into subdirectories (default: false)"),
    max_depth: z.number().optional().describe("Maximum recursion depth (default: 10)"),
    file_extensions: z.array(z.string()).optional().describe("Filter by extensions (e.g., ['java', 'xml'])"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path to list" },
      recursive: { type: "boolean", description: "Recurse into subdirectories" },
      max_depth: { type: "number", description: "Maximum recursion depth" },
      file_extensions: { type: "array", items: { type: "string" }, description: "Filter by extensions" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 30000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "list_dir");
    context.log(`[ListDir/Rust] ${resolvedPath} (recursive: ${params.recursive || false})`);

    try {
      const response: any = await invoke("invoke_agent_list_dir", {
        request: {
          path: resolvedPath,
          recursive: params.recursive || false,
          max_depth: params.max_depth || null,
          file_extensions: params.file_extensions || null,
        },
      });

      if (response.entries.length === 0) {
        return `Directory is empty or no matching files found: ${resolvedPath}`;
      }

      const lines = response.entries.map((entry: any) => {
        if (entry.is_dir) {
          return `[DIR] ${entry.name}/`;
        }
        const sizeStr =
          entry.size > 1048576 ? `${(entry.size / 1048576).toFixed(1)}MB` : entry.size > 1024 ? `${(entry.size / 1024).toFixed(0)}KB` : `${entry.size}B`;
        return `   ${entry.name} (${sizeStr})`;
      });

      return `[${resolvedPath}] ${response.total_count} entries:\n\n${lines.join("\n")}`;
    } catch (e) {
      throw new Error(`List dir error: ${e}`);
    }
  },
};

