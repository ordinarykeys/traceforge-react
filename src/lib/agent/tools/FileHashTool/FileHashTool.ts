import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";
import { ensureWorkspacePath } from "../runtime";

export const FileHashTool: Tool<any, any> = {
  name: "file_hash",
  description: "Compute MD5 and SHA256 hashes of a file using native Rust. Useful for file integrity checks and version comparisons.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file to hash"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to hash" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  maxOutputChars: 500,
  call: async (params, context: ToolContext) => {
    const resolvedPath = ensureWorkspacePath(params.path, context, "file_hash");
    context.log(`[Hash/Rust] Computing hashes for ${resolvedPath}`);

    try {
      const response: any = await invoke("invoke_agent_file_hash", {
        request: { path: resolvedPath },
      });

      const sizeHuman =
        response.file_size > 1048576 ? `${(response.file_size / 1048576).toFixed(2)} MB` : `${(response.file_size / 1024).toFixed(1)} KB`;

      return `File: ${resolvedPath}\nSize: ${sizeHuman} (${response.file_size} bytes)\nMD5:    ${response.md5}\nSHA256: ${response.sha256}`;
    } catch (e) {
      throw new Error(`File hash error: ${e}`);
    }
  },
};

