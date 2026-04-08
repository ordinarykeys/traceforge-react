import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const GrepTool: Tool<any, any> = {
  name: "grep",
  description: "Ultra-fast regex search across files using a native Rust engine. Supports file extension filtering.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    search_path: z.string().describe("Root directory to search in"),
    file_extensions: z.array(z.string()).optional().describe("File extensions to include (e.g., ['ts', 'tsx', 'js'])"),
    case_insensitive: z.boolean().optional().describe("Case-insensitive search (default: false)"),
    max_results: z.number().optional().describe("Max matches to return (default: 200)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      search_path: { type: "string", description: "Root directory to search in" },
      file_extensions: {
        type: "array",
        items: { type: "string" },
        description: "File extensions to include (e.g., ['ts', 'tsx', 'js'])",
      },
      case_insensitive: { type: "boolean", description: "Case-insensitive search (default: false)" },
      max_results: { type: "number", description: "Max matches to return (default: 200)" },
    },
    required: ["pattern", "search_path"],
  },
  isReadOnly: true,
  maxOutputChars: 40000,
  call: async (params, context: ToolContext) => {
    const resolvedSearchPath = ensureWorkspacePath(params.search_path, context, "grep");
    context.log(`[Grep/Rust] Searching "${params.pattern}" in ${resolvedSearchPath}`);

    try {
      const response: any = await invoke("invoke_agent_grep_search", {
        request: {
          pattern: params.pattern,
          search_path: resolvedSearchPath,
          file_extensions: params.file_extensions || null,
          case_insensitive: params.case_insensitive || false,
          max_results: params.max_results || 200,
        },
      });

      if (response.matches.length === 0) {
        return `No matches found for "${params.pattern}" (scanned ${response.total_files_scanned} files)`;
      }

      const lines = response.matches.map((match: any) => `${match.file}:${match.line_number}: ${match.line_content}`);

      let result = `Found ${response.matches.length} matches across ${response.total_files_scanned} files:\n\n${lines.join("\n")}`;
      if (response.truncated) {
        result += `\n\n[Timeout] Results truncated. Narrow your search for more precise results.`;
      }
      return result;
    } catch (e) {
      throw new Error(`Grep search error: ${e}`);
    }
  },
};

