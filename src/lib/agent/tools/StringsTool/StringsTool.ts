import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const StringsTool: Tool<any, any> = {
  name: "strings",
  description:
    "Extract printable ASCII strings from binary files (like Unix 'strings'). Useful for finding hardcoded URLs, keys, debug messages, and identifiers. Native Rust handles large binaries efficiently.",
  inputSchema: z.object({
    path: z.string().describe("Path to binary file"),
    min_length: z.number().optional().describe("Minimum string length (default: 4)"),
    max_results: z.number().optional().describe("Maximum strings to return (default: 1000)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to binary file" },
      min_length: { type: "number", description: "Minimum string length (default: 4)" },
      max_results: { type: "number", description: "Maximum strings to return (default: 1000)" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 50000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "strings");
    context.log(`[Strings/Rust] Extracting from ${resolvedPath} (min_len: ${params.min_length || 4})`);

    try {
      const response: any = await invoke("invoke_agent_extract_strings", {
        request: {
          path: resolvedPath,
          min_length: params.min_length || null,
          max_results: params.max_results || null,
        },
      });

      if (response.strings.length === 0) {
        return `No printable strings found in ${resolvedPath} (min length: ${params.min_length || 4})`;
      }

      let result = `Extracted ${response.strings.length}/${response.total_found} strings from ${resolvedPath}:\n\n`;
      result += response.strings.join("\n");
      if (response.truncated) {
        result += `\n\n[Timeout] Truncated. Total strings found: ${response.total_found}. Increase min_length or decrease max_results.`;
      }
      return result;
    } catch (e) {
      throw new Error(`Strings extraction error: ${e}`);
    }
  },
};

