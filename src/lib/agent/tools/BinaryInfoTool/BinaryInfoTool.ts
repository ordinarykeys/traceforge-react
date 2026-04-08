import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const BinaryInfoTool: Tool<any, any> = {
  name: "binary_info",
  description: "Identify file type by parsing magic bytes (ZIP, PNG, JPEG, ELF, and others). Also reports architecture for ELF files. Native Rust with instant results.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file to identify"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to identify" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 2000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "binary_info");
    context.log(`[BinaryInfo/Rust] Identifying ${resolvedPath}`);

    try {
      const response: any = await invoke("invoke_agent_binary_info", {
        request: { path: resolvedPath },
      });

      const detailLines = Object.entries(response.details)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");

      return `File: ${resolvedPath}\nType: ${response.file_type}\n\nDetails:\n${detailLines}`;
    } catch (e) {
      throw new Error(`Binary info error: ${e}`);
    }
  },
};

