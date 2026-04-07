import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import type { Tool, ToolContext } from "../types";

/**
 * ShellTool: High-performance shell executor via Rust/Tokio
 * Used for: file operations, grep/find searches, general CLI tasks
 */
export const ShellTool: Tool<any, any> = {
  name: "shell",
  description: "Execute shell commands in the host system. Use for file operations, search, and general CLI workflows. IMPORTANT: Returns actual stdout/stderr output.",
  inputSchema: z.object({
    cmd: z.string().describe("The command to execute (e.g., 'grep', 'find', 'cat')"),
    args: z.array(z.string()).optional().describe("Arguments for the command"),
    cwd: z.string().optional().describe("Working directory for the command"),
    timeout_ms: z.number().optional().describe("Optional timeout in milliseconds (default: 30000)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "The command to execute (e.g., 'grep', 'find', 'cat')" },
      args: { type: "array", items: { type: "string" }, description: "Arguments for the command" },
      cwd: { type: "string", description: "Working directory for the command" },
      timeout_ms: { type: "number", description: "Optional timeout in milliseconds (default: 30000)" }
    },
    required: ["cmd"]
  },

  isReadOnly: false,
  maxOutputChars: 30000,
  call: async (params, context: ToolContext) => {
    let cmd = params.cmd;
    let args = [...(params.args || [])];

    // Windows guardrail: `cmd` without `/c` can block in interactive mode.
    if (cmd.toLowerCase() === "cmd" && (args[0] || "").toLowerCase() !== "/c") {
      args = ["/c", ...args];
      context.log(`[Shell] auto-fix: prepended "/c" for cmd`);
    }

    const timeoutMs = params.timeout_ms || 30000;
    const workingDirForCommand = params.cwd || context.workingDir || null;
    const deleteTargetRaw = detectDeleteTargetFromShell(cmd, args);
    const deleteTargetPath = deleteTargetRaw
      ? resolveWorkspacePath(deleteTargetRaw, {
          ...context,
          workingDir: workingDirForCommand || context.workingDir,
        })
      : null;
    const deletedFileBefore = deleteTargetPath
      ? await readFileTextForPreview(deleteTargetPath)
      : null;

    context.log(`[Shell] ${cmd} ${args.join(" ")}`);

    try {
      const response: any = await invoke("invoke_agent_task_execution", {
        request: {
          cmd,
          args,
          cwd: workingDirForCommand,
          timeout_ms: timeoutMs
        }
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
  }
};

/**
 * FileReadTool: Read local files and configs
 * Read-only tool, safe for concurrent execution
 */
export const FileReadTool: Tool<any, any> = {
  name: "file_read",
  description: "Read contents of a local file. Supports reading specific line ranges to handle large files efficiently.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the file to read"),
    start_line: z.number().optional().describe("Start line number (1-indexed). Omit to read from beginning."),
    end_line: z.number().optional().describe("End line number (1-indexed, inclusive). Omit to read to end.")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file to read" },
      start_line: { type: "number", description: "Start line number (1-indexed). Omit to read from beginning." },
      end_line: { type: "number", description: "End line number (1-indexed, inclusive). Omit to read to end." }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 50000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    const lineRange = params.start_line ? ` (lines ${params.start_line}-${params.end_line || 'end'})` : '';
    context.log(`[FileRead] ${resolvedPath}${lineRange}`);

    try {
      const response: any = await invoke("invoke_agent_read_file", {
        request: {
          path: resolvedPath,
          start_line: params.start_line || null,
          end_line: params.end_line || null
        }
      });

      if (!response.success) {
        return `File read error: ${response.error}`;
      }

      return `[File: ${resolvedPath} | Total lines: ${response.total_lines}${lineRange}]\n${response.content}`;
    } catch (e) {
      throw new Error(`File read error: ${e}`);
    }
  }
};

function isAbsolutePathLike(path: string): boolean {
  const value = path.trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("\\\\")) return true;
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function normalizeRuntimePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function resolveWorkspacePath(path: string, context: ToolContext): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (isAbsolutePathLike(trimmed)) {
    return normalizeRuntimePath(trimmed);
  }
  const workspace = (context.workingDir || "").trim();
  if (!workspace) {
    return normalizeRuntimePath(trimmed);
  }
  const base = normalizeRuntimePath(workspace).replace(/\/+$/, "");
  const rel = normalizeRuntimePath(trimmed).replace(/^\.\/+/, "").replace(/^\/+/, "");
  return `${base}/${rel}`;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

async function readFileTextForPreview(path: string): Promise<string | null> {
  try {
    const response: any = await invoke("invoke_agent_read_file", {
      request: {
        path,
        start_line: null,
        end_line: null,
      },
    });
    if (!response?.success) return null;
    return String(response.content ?? "");
  } catch {
    return null;
  }
}

function buildLineDiffPreview(
  previousContent: string,
  nextContent: string,
  maxLines = 120,
): { lines: string[]; added: number; removed: number; truncated: boolean } {
  const before = splitLines(previousContent);
  const after = splitLines(nextContent);
  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  const pushLine = (line: string) => {
    if (lines.length < maxLines) {
      lines.push(line);
    }
  };

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (i + 1 < before.length && before[i + 1] === after[j]) {
      removed += 1;
      pushLine(`-${before[i]}`);
      i += 1;
      continue;
    }

    if (j + 1 < after.length && before[i] === after[j + 1]) {
      added += 1;
      pushLine(`+${after[j]}`);
      j += 1;
      continue;
    }

    removed += 1;
    added += 1;
    pushLine(`-${before[i]}`);
    pushLine(`+${after[j]}`);
    i += 1;
    j += 1;
  }

  while (i < before.length) {
    removed += 1;
    pushLine(`-${before[i]}`);
    i += 1;
  }

  while (j < after.length) {
    added += 1;
    pushLine(`+${after[j]}`);
    j += 1;
  }

  const truncated = lines.length < added + removed;
  return { lines, added, removed, truncated };
}

function tokenizeShellScript(script: string): string[] {
  return script.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) ?? [];
}

function normalizeShellToken(token: string): string {
  const trimmed = token.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function detectDeleteTargetFromTokens(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const command = tokens[0].toLowerCase();
  const deleteCommands = new Set(["rm", "del", "erase", "remove-item", "ri", "rmdir", "rd"]);
  const optionNeedsValue = new Set(["-path", "-literalpath"]);
  if (!deleteCommands.has(command)) {
    return null;
  }

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (optionNeedsValue.has(lower)) {
      const next = tokens[i + 1];
      if (next) {
        return normalizeShellToken(next);
      }
      continue;
    }

    if (token.startsWith("-") || token.startsWith("/")) {
      continue;
    }

    return normalizeShellToken(token);
  }

  return null;
}

function detectDeleteTargetFromShell(cmd: string, args: string[]): string | null {
  const lowerCmd = cmd.trim().toLowerCase();
  const normalizedArgs = args.map((arg) => arg.trim()).filter(Boolean);

  if (
    lowerCmd === "rm" ||
    lowerCmd === "del" ||
    lowerCmd === "erase" ||
    lowerCmd === "remove-item" ||
    lowerCmd === "ri" ||
    lowerCmd === "rmdir" ||
    lowerCmd === "rd"
  ) {
    return detectDeleteTargetFromTokens([lowerCmd, ...normalizedArgs]);
  }

  if (lowerCmd === "cmd" && normalizedArgs.length >= 2 && normalizedArgs[0].toLowerCase() === "/c") {
    const commandPart = normalizedArgs.slice(1);
    const tokens = commandPart.length === 1 ? tokenizeShellScript(commandPart[0]) : commandPart;
    return detectDeleteTargetFromTokens(tokens);
  }

  if (lowerCmd === "powershell" || lowerCmd === "pwsh") {
    const commandIndex = normalizedArgs.findIndex((arg) => {
      const normalized = arg.toLowerCase();
      return normalized === "-command" || normalized === "-c";
    });
    if (commandIndex >= 0 && normalizedArgs[commandIndex + 1]) {
      const script = normalizedArgs.slice(commandIndex + 1).join(" ");
      const fromScript = detectDeleteTargetFromTokens(tokenizeShellScript(script));
      if (fromScript) {
        return fromScript;
      }
    }
    return detectDeleteTargetFromTokens(normalizedArgs);
  }

  return null;
}

/**
 * MemoryTool: Persistent analysis findings storage
 * Used for: saving/loading reusable task discoveries across sessions
 */
export const MemoryTool: Tool<any, any> = {
  name: "memory",
  description: "Save or load analysis findings. Use 'save' to persist key discoveries and 'load' to retrieve previous entries across turns or threads.",
  inputSchema: z.object({
    action: z.enum(["save", "load"]).describe("Memory action"),
    category: z.string().optional().describe("Category for grouping memory entries"),
    title: z.string().optional().describe("Short title for the memory entry (used as ID for 'save')"),
    content: z.string().optional().describe("Content to save (for 'save' action)"),
    limit: z.number().optional().describe("Max number of entries to load (default: 20)"),
    scope: z
      .enum(["current_thread", "all_threads"])
      .optional()
      .describe("Load scope: current_thread (default) or all_threads")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["save", "load"], description: "Memory action" },
      category: { type: "string", description: "Optional category for grouping memory entries" },
      title: { type: "string", description: "Short title for the memory entry" },
      content: { type: "string", description: "Content to save" },
      limit: { type: "number", description: "Max entries to load (default: 20)" },
      scope: {
        type: "string",
        enum: ["current_thread", "all_threads"],
        description: "Load scope: current_thread (default) or all_threads",
      }
    },
    required: ["action"]
  },
  isReadOnly: false,
  maxOutputChars: 10000,
  call: async (params, context: ToolContext) => {
    const currentThreadId = context.threadId || "default";

    if (params.action === "save") {
      if (!params.category || !params.title || !params.content) {
        return "Error: 'save' requires 'category', 'title', and 'content' parameters.";
      }

      const id = `${params.category}_${params.title.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      context.log(`[Memory] Saving: [${params.category}] ${params.title}`);

      try {
        await invoke("invoke_agent_save_memory", {
          request: {
            id,
            category: params.category,
            content: params.content,
            metadata: JSON.stringify({ title: params.title }),
            thread_id: currentThreadId,
          }
        });

        return `[OK]Memory saved: [${params.category}] ${params.title} (thread: ${currentThreadId})`;
      } catch (e) {
        throw new Error(`Memory save error: ${e}`);
      }
    } else if (params.action === "load") {
      const scope = params.scope ?? "current_thread";
      const threadIdFilter = scope === "all_threads" ? null : currentThreadId;
      context.log(
        `[Memory] Loading memories${params.category ? ` (category: ${params.category})` : ""} (scope: ${scope})`,
      );

      try {
        const entries: any[] = await invoke("invoke_agent_load_memories", {
          request: {
            category: params.category || null,
            thread_id: threadIdFilter,
            limit: params.limit || 20
          }
        });

        if (entries.length === 0) {
          return "No memories found" + (params.category ? ` for category: ${params.category}` : "") + ".";
        }

        return entries.map((e: any) => {
          const meta = e.metadata ? JSON.parse(e.metadata) : {};
          return `[${e.category}] ${meta.title || e.id}\n${e.content}\n---`;
        }).join("\n");
      } catch (e) {
        throw new Error(`Memory load error: ${e}`);
      }
    }

    return "Unknown memory action";
  }
};

/**
 * ============================================================
 * NATIVE RUST-POWERED TOOLS (Zero shell overhead)
 * ============================================================
 */

/**
 * GrepTool: Native regex search powered by Rust (ripgrep-grade speed)
 * 10-100x faster than spawning grep/findstr processes
 */
export const GrepTool: Tool<any, any> = {
  name: "grep",
  description: "Ultra-fast regex search across files using a native Rust engine. Supports file extension filtering.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    search_path: z.string().describe("Root directory to search in"),
    file_extensions: z.array(z.string()).optional().describe("File extensions to include (e.g., ['ts', 'tsx', 'js'])"),
    case_insensitive: z.boolean().optional().describe("Case-insensitive search (default: false)"),
    max_results: z.number().optional().describe("Max matches to return (default: 200)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      search_path: { type: "string", description: "Root directory to search in" },
      file_extensions: { type: "array", items: { type: "string" }, description: "File extensions to include (e.g., ['ts', 'tsx', 'js'])" },
      case_insensitive: { type: "boolean", description: "Case-insensitive search (default: false)" },
      max_results: { type: "number", description: "Max matches to return (default: 200)" }
    },
    required: ["pattern", "search_path"]
  },
  isReadOnly: true,
  maxOutputChars: 40000,
  call: async (params, context: ToolContext) => {
    const resolvedSearchPath = resolveWorkspacePath(params.search_path, context);
    context.log(`[Grep/Rust] Searching "${params.pattern}" in ${resolvedSearchPath}`);

    try {
      const response: any = await invoke("invoke_agent_grep_search", {
        request: {
          pattern: params.pattern,
          search_path: resolvedSearchPath,
          file_extensions: params.file_extensions || null,
          case_insensitive: params.case_insensitive || false,
          max_results: params.max_results || 200
        }
      });

      if (response.matches.length === 0) {
        return `No matches found for "${params.pattern}" (scanned ${response.total_files_scanned} files)`;
      }

      const lines = response.matches.map((m: any) =>
        `${m.file}:${m.line_number}: ${m.line_content}`
      );

      let result = `Found ${response.matches.length} matches across ${response.total_files_scanned} files:\n\n${lines.join("\n")}`;
      if (response.truncated) {
        result += `\n\n[Timeout] Results truncated. Narrow your search for more precise results.`;
      }
      return result;
    } catch (e) {
      throw new Error(`Grep search error: ${e}`);
    }
  }
};

/**
 * HexDumpTool: Native binary hex viewer powered by Rust
 * Essential for analyzing DEX/ELF/SO file headers and binary data
 */
export const HexDumpTool: Tool<any, any> = {
  name: "hexdump",
  description: "View binary file contents as hex dump. Use for analyzing DEX headers, ELF .so files, encrypted data blobs, or any binary structure. Reads directly in Rust -zero shell overhead.",
  inputSchema: z.object({
    path: z.string().describe("Path to binary file"),
    offset: z.number().optional().describe("Start offset in bytes (default: 0)"),
    length: z.number().optional().describe("Number of bytes to read (default: 256, max: 4096)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to binary file" },
      offset: { type: "number", description: "Start offset in bytes (default: 0)" },
      length: { type: "number", description: "Bytes to read (default: 256, max: 4096)" }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 20000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    context.log(`[HexDump/Rust] ${resolvedPath} @ offset ${params.offset || 0}`);

    try {
      const response: any = await invoke("invoke_agent_hex_dump", {
        request: {
          path: resolvedPath,
          offset: params.offset || null,
          length: params.length || null
        }
      });

      return `[Hex Dump: ${resolvedPath} | Size: ${response.file_size} bytes]\n\n${response.hex_dump}`;
    } catch (e) {
      throw new Error(`Hex dump error: ${e}`);
    }
  }
};

/**
 * FileHashTool: Native SHA256+MD5 hash computation
 * Uses streaming reads for constant memory usage on any file size
 */
export const FileHashTool: Tool<any, any> = {
  name: "file_hash",
  description: "Compute MD5 and SHA256 hashes of a file using native Rust. Useful for file integrity checks and version comparisons.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file to hash")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to hash" }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 500,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    context.log(`[Hash/Rust] Computing hashes for ${resolvedPath}`);

    try {
      const response: any = await invoke("invoke_agent_file_hash", {
        request: { path: resolvedPath }
      });

      const sizeHuman = response.file_size > 1048576
        ? `${(response.file_size / 1048576).toFixed(2)} MB`
        : `${(response.file_size / 1024).toFixed(1)} KB`;

      return `File: ${resolvedPath}\nSize: ${sizeHuman} (${response.file_size} bytes)\nMD5:    ${response.md5}\nSHA256: ${response.sha256}`;
    } catch (e) {
      throw new Error(`File hash error: ${e}`);
    }
  }
};

/**
 * ListDirTool: Native directory listing with metadata
 * Fast recursive traversal powered by Rust walkdir
 */
export const ListDirTool: Tool<any, any> = {
  name: "list_dir",
  description: "List files and directories with metadata (size, type). Uses native Rust for fast traversal. Supports recursive listing, depth limit, and extension filtering.",
  inputSchema: z.object({
    path: z.string().describe("Directory path to list"),
    recursive: z.boolean().optional().describe("Recurse into subdirectories (default: false)"),
    max_depth: z.number().optional().describe("Maximum recursion depth (default: 10)"),
    file_extensions: z.array(z.string()).optional().describe("Filter by extensions (e.g., ['java', 'xml'])")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path to list" },
      recursive: { type: "boolean", description: "Recurse into subdirectories" },
      max_depth: { type: "number", description: "Maximum recursion depth" },
      file_extensions: { type: "array", items: { type: "string" }, description: "Filter by extensions" }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 30000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    context.log(`[ListDir/Rust] ${resolvedPath} (recursive: ${params.recursive || false})`);

    try {
      const response: any = await invoke("invoke_agent_list_dir", {
        request: {
          path: resolvedPath,
          recursive: params.recursive || false,
          max_depth: params.max_depth || null,
          file_extensions: params.file_extensions || null
        }
      });

      if (response.entries.length === 0) {
        return `Directory is empty or no matching files found: ${resolvedPath}`;
      }

      const lines = response.entries.map((e: any) => {
        if (e.is_dir) {
          return `[DIR] ${e.name}/`;
        }
        const sizeStr = e.size > 1048576
          ? `${(e.size / 1048576).toFixed(1)}MB`
          : e.size > 1024
            ? `${(e.size / 1024).toFixed(0)}KB`
            : `${e.size}B`;
        return `   ${e.name} (${sizeStr})`;
      });

      return `[${resolvedPath}] ${response.total_count} entries:\n\n${lines.join("\n")}`;
    } catch (e) {
      throw new Error(`List dir error: ${e}`);
    }
  }
};

/**
 * BinaryInfoTool: Native file type identification
 * Parses magic bytes for common file signatures.
 */
export const BinaryInfoTool: Tool<any, any> = {
  name: "binary_info",
  description: "Identify file type by parsing magic bytes (ZIP, PNG, JPEG, ELF, and others). Also reports architecture for ELF files. Native Rust with instant results.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file to identify")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to identify" }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 2000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    context.log(`[BinaryInfo/Rust] Identifying ${resolvedPath}`);

    try {
      const response: any = await invoke("invoke_agent_binary_info", {
        request: { path: resolvedPath }
      });

      const detailLines = Object.entries(response.details)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");

      return `File: ${resolvedPath}\nType: ${response.file_type}\n\nDetails:\n${detailLines}`;
    } catch (e) {
      throw new Error(`Binary info error: ${e}`);
    }
  }
};

/**
 * StringsTool: Extract printable strings from binary files
 * Like Unix 'strings' command -critical for finding URLs, keys, debug messages in .so/.dex
 */
export const StringsTool: Tool<any, any> = {
  name: "strings",
  description: "Extract printable ASCII strings from binary files (like Unix 'strings'). Useful for finding hardcoded URLs, keys, debug messages, and identifiers. Native Rust handles large binaries efficiently.",
  inputSchema: z.object({
    path: z.string().describe("Path to binary file"),
    min_length: z.number().optional().describe("Minimum string length (default: 4)"),
    max_results: z.number().optional().describe("Maximum strings to return (default: 1000)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to binary file" },
      min_length: { type: "number", description: "Minimum string length (default: 4)" },
      max_results: { type: "number", description: "Maximum strings to return (default: 1000)" }
    },
    required: ["path"]
  },
  isReadOnly: true,
  maxOutputChars: 50000,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
    context.log(`[Strings/Rust] Extracting from ${resolvedPath} (min_len: ${params.min_length || 4})`);

    try {
      const response: any = await invoke("invoke_agent_extract_strings", {
        request: {
          path: resolvedPath,
          min_length: params.min_length || null,
          max_results: params.max_results || null
        }
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
  }
};

/**
 * FileWriteTool: Write content to files with automatic backup
 * Useful for applying edits, config changes, and saving analysis notes
 */
export const FileWriteTool: Tool<any, any> = {
  name: "file_write",
  description: "Write content to a file. Automatically creates a .bak backup before overwriting.",
  inputSchema: z.object({
    path: z.string().describe("Target file path"),
    content: z.string().describe("Content to write"),
    create_backup: z.boolean().optional().describe("Create .bak backup before overwriting (default: true)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target file path" },
      content: { type: "string", description: "Content to write" },
      create_backup: { type: "boolean", description: "Create .bak backup (default: true)" }
    },
    required: ["path", "content"]
  },
  isReadOnly: false,
  maxOutputChars: 500,
  call: async (params, context: ToolContext) => {
    const resolvedPath = resolveWorkspacePath(params.path, context);
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
        }
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
  }
};

/**
 * All available tools for the Agent, exported as an array.
 */
export const ALL_TOOLS: Tool<any, any>[] = [
  ShellTool,
  FileReadTool,
  MemoryTool,
  // Native Rust-powered high-performance tools
  GrepTool,
  HexDumpTool,
  FileHashTool,
  ListDirTool,
  BinaryInfoTool,
  StringsTool,
  FileWriteTool,
];


