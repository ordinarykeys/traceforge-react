import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const HexDumpTool: Tool<any, any> = {
  name: "hexdump",
  description:
    "View binary file contents as hex dump. Use for analyzing DEX headers, ELF .so files, encrypted data blobs, or any binary structure. Reads directly in Rust -zero shell overhead.",
  inputSchema: z.object({
    path: z.string().describe("Path to binary file"),
    offset: z.number().optional().describe("Start offset in bytes (default: 0)"),
    length: z.number().optional().describe("Number of bytes to read (default: 256, max: 4096)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to binary file" },
      offset: { type: "number", description: "Start offset in bytes (default: 0)" },
      length: { type: "number", description: "Bytes to read (default: 256, max: 4096)" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 20000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "hexdump");
    context.log(`[HexDump/Rust] ${resolvedPath} @ offset ${params.offset || 0}`);

    try {
      const response: any = await invoke("invoke_agent_hex_dump", {
        request: {
          path: resolvedPath,
          offset: params.offset || null,
          length: params.length || null,
        },
      });

      return `[Hex Dump: ${resolvedPath} | Size: ${response.file_size} bytes]\n\n${response.hex_dump}`;
    } catch (e) {
      throw new Error(`Hex dump error: ${e}`);
    }
  },
};

