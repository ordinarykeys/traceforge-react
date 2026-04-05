import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import type { Tool, ToolContext } from "../types";

/**
 * ShellTool: High-performance shell executor via Rust/Tokio
 * Used for: file operations, grep/find searches, general CLI tasks
 */
export const ShellTool: Tool<any, any> = {
  name: "shell",
  description: "Execute shell commands in the host system. Use for file operations, searching decompiled code with grep/find, running CLI tools. IMPORTANT: Returns actual stdout/stderr output.",
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

    const lowerArgs = args.map((a) => a.toLowerCase());
    const isJadxSearchMisuse =
      (cmd.toLowerCase().includes("jadx") || lowerArgs.some((a) => a.includes("jadx"))) &&
      lowerArgs.includes("--search");
    if (isJadxSearchMisuse) {
      return [
        `Shell command blocked: unsupported jadx usage "--search".`,
        `Use two-step flow instead:`,
        `1) decompile: jadx -d <out_dir> --no-res <apk>`,
        `2) search in output: grep/rg "api|sign|token|encrypt" <out_dir>`,
      ].join("\n");
    }

    const heavyTaskText = [cmd, ...args].join(" ").toLowerCase();
    const isHeavyReverseTask =
      heavyTaskText.includes("jadx") ||
      heavyTaskText.includes("frida") ||
      heavyTaskText.includes("apktool");
    const timeoutMs = params.timeout_ms || (isHeavyReverseTask ? 300000 : 30000);

    context.log(`[Shell] ${cmd} ${args.join(" ")}`);

    try {
      const response: any = await invoke("invoke_agent_task_execution", {
        request: {
          cmd,
          args,
          cwd: params.cwd || context.workingDir || null,
          timeout_ms: timeoutMs
        }
      });


      if (!response.success && !response.interrupted) {
        return `Command failed (exit code: ${response.exit_code})\nstderr: ${response.stderr}`;
      }
      
      let output = response.stdout || "(no output)";
      if (response.interrupted) {
        output += "\n\n[Timeout] Command was interrupted due to timeout.";
        if (isHeavyReverseTask) {
          output += "\nTip: set timeout_ms to a larger value (e.g., 600000) for large APK or heavy hook flows.";
        }
      }
      return output;

    } catch (e) {
      throw new Error(`Shell execution error: ${e}`);
    }
  }
};

/**
 * AdbTool: Expert-level Android Device Bridge wrapper
 * Used for: device management, file transfer, logcat, shell on device
 */
export const AdbTool: Tool<any, any> = {
  name: "adb",
  description: "Interact with Android devices via ADB. Actions: 'devices', 'shell', 'pull', 'push', 'logcat' (use -d for dump, or specify timeout_ms for streaming capture), 'install'.",


  inputSchema: z.object({
    action: z.enum(["devices", "shell", "pull", "push", "logcat", "install"]).describe("The ADB action"),
    args: z.array(z.string()).optional().describe("Additional arguments for the ADB command"),
    description: z.string().optional().describe("A concise description of the task being performed (e.g., 'Check device list', 'Dump app logs')"),
    timeout_ms: z.number().optional().describe("Optional timeout in milliseconds. For 'logcat', defaults to 20000ms.")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["devices", "shell", "pull", "push", "logcat", "install"], description: "The ADB action to perform" },
      args: { type: "array", items: { type: "string" }, description: "Additional arguments for the ADB command" },
      description: { type: "string", description: "Intent description for this execution" },
      timeout_ms: { type: "number", description: "Optional timeout in milliseconds" }
    },
    required: ["action"]
  },

  isReadOnly: false,
  maxOutputChars: 20000,
  call: async (params, context: ToolContext) => {
    let finalArgs = [params.action];
    if (params.args) finalArgs = [...finalArgs, ...params.args];

    context.log(`[ADB] adb ${finalArgs.join(" ")}`);

    try {
      // Set logcat specific timeout if not provided
      let timeoutMs = params.timeout_ms;
      if (params.action === "logcat" && !timeoutMs) {
        timeoutMs = 20000; // Increased to 20s to allow manual UI triggers
      }

      const response: any = await invoke("invoke_agent_task_execution", {
        request: {
          cmd: "adb",
          args: finalArgs,
          cwd: null,
          timeout_ms: timeoutMs || 30000
        }
      });

      if (!response.success && !response.interrupted) {
        return `ADB error (exit code: ${response.exit_code})\nstderr: ${response.stderr}`;
      }
      
      let output = response.stdout || "(no output)";
      if (response.interrupted) {
        output += "\n\n[Timeout] ADB command was interrupted (timed out). Tip: Use 'adb logcat -d' for a quick non-blocking dump.";
      }
      return output;

    } catch (e) {
      throw new Error(`ADB critical failure: ${e}`);
    }
  }
};

/**
 * FileReadTool: Read local files (decompiled sources, configs, manifests)
 * Read-only tool -safe for concurrent execution
 */
export const FileReadTool: Tool<any, any> = {
  name: "file_read",
  description: "Read contents of a local file. Use this to read decompiled Java/Smali source code, AndroidManifest.xml, config files, or any text file. Supports reading specific line ranges to handle large files efficiently.",
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
    const lineRange = params.start_line ? ` (lines ${params.start_line}-${params.end_line || 'end'})` : '';
    context.log(`[FileRead] ${params.path}${lineRange}`);

    try {
      const response: any = await invoke("invoke_agent_read_file", {
        request: {
          path: params.path,
          start_line: params.start_line || null,
          end_line: params.end_line || null
        }
      });

      if (!response.success) {
        return `File read error: ${response.error}`;
      }

      return `[File: ${params.path} | Total lines: ${response.total_lines}${lineRange}]\n${response.content}`;
    } catch (e) {
      throw new Error(`File read error: ${e}`);
    }
  }
};

function withWindowsCmd(cmd: string, args: string[]): { cmd: string; args: string[] } {
  if (typeof process !== "undefined" && process.platform === "win32") {
    return { cmd: "cmd", args: ["/c", cmd, ...args] };
  }
  return { cmd, args };
}

/**
 * JadxTool: JADX decompiler for APK/DEX ->Java source conversion
 * Used for: static analysis, code structure understanding
 */
export const JadxTool: Tool<any, any> = {
  name: "jadx",
  description: "Use JADX to decompile APK or DEX files into readable Java source code. Actions: 'decompile' (full decompile to output directory), 'search' (search for class/method/string in decompiled output).",
  inputSchema: z.object({
    action: z.enum(["decompile", "search"]).describe("JADX action"),
    input_path: z.string().describe("Path to APK or DEX file"),
    output_dir: z.string().optional().describe("Output directory for decompiled sources (default: input_path + '_jadx')"),
    search_query: z.string().optional().describe("Search query for 'search' action"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["decompile", "search"], description: "JADX action to perform" },
      input_path: { type: "string", description: "Path to APK or DEX file" },
      output_dir: { type: "string", description: "Output directory for decompiled sources" },
      search_query: { type: "string", description: "Search query (class name, method name, or string literal)" }
    },
    required: ["action", "input_path"]
  },
  isReadOnly: false,
  maxOutputChars: 30000,
  call: async (params, context: ToolContext) => {
    if (params.action === "decompile") {
      const outputDir = params.output_dir || `${params.input_path}_jadx`;
      context.log(`[Jadx] Decompiling ${params.input_path} ->${outputDir}`);

      try {
        const jadxReq = withWindowsCmd("jadx", ["-d", outputDir, "--deobf", params.input_path]);
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: jadxReq.cmd,
            args: jadxReq.args,
            cwd: context.workingDir || null,
            timeout_ms: 300000 // 5 minutes for decompile
          }
        });

        if (response.interrupted) {
          return `[Timeout] Jadx decompilation was interrupted (timed out after 5 mins). Partial output may exist in ${outputDir}.`;
        }
        if (!response.success) {
          return `Jadx decompilation failed:\n${response.stderr}`;
        }
        return `Decompilation complete. Output directory: ${outputDir}\n${response.stdout}`;
      } catch (e) {
        throw new Error(`Jadx error: ${e}`);
      }
    } else if (params.action === "search") {
      const searchDir = params.output_dir || `${params.input_path}_jadx`;
      const query = params.search_query || "";
      context.log(`[Jadx] Searching "${query}" in ${searchDir}`);

      try {
        const grepReq = withWindowsCmd("grep", ["-rn", "--include=*.java", query, searchDir]);
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: grepReq.cmd,
            args: grepReq.args,
            cwd: null,
            timeout_ms: 60000 // 1 minute for search
          }
        });

        if (response.interrupted) {
          return `[Timeout] Jadx search was interrupted (timed out after 1 min). Results may be incomplete.`;
        }
        return response.stdout || "(no matches found)";

      } catch (e) {
        throw new Error(`Search error: ${e}`);
      }
    }

    return "Unknown jadx action";
  }
};

/**
 * FridaTool: Frida dynamic instrumentation for runtime analysis
 * Used for: hooking functions, tracing calls, dumping memory
 */
export const FridaTool: Tool<any, any> = {
  name: "frida",
  description: `Use Frida for dynamic instrumentation on Android devices.
  ADVICE: If the app crashes with SIGSEGV or Fatal Signal 11, do NOT just keep restarting. 
  Instead: 
  1. Use Frida to hook System.loadLibrary code to see which lib fails.
  2. Hook System.exit to prevent the app from killing itself.
  3. Look at expert_scripts/ for templates.`,
  inputSchema: z.object({
    action: z.enum(["hook", "list_processes", "trace"]).describe("Frida action"),
    target: z.string().optional().describe("Target app package name or PID"),
    description: z.string().optional().describe("Clear intent for this instrumentation (e.g., 'Bypass startup crash', 'Tracing login methods')"),
    script: z.string().optional().describe("Frida JavaScript script content for 'hook' action"),
    functions: z.array(z.string()).optional().describe("Function patterns for 'trace' action (e.g., '*!open*')"),
    spawn: z.boolean().optional().describe("Whether to spawn the app (true) or attach to running process (false)"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["hook", "list_processes", "trace"], description: "Frida action to perform" },
      target: { type: "string", description: "Target app package name or PID" },
      description: { type: "string", description: "Description of what this hook/trace is achieving" },
      script: { type: "string", description: "Frida JavaScript script content for 'hook' action" },
      functions: { type: "array", items: { type: "string" }, description: "Function patterns for 'trace' action" },
      spawn: { type: "boolean", description: "Whether to spawn the app (true) or attach (false)" }
    },
    required: ["action"]
  },
  isReadOnly: false,
  maxOutputChars: 20000,
  call: async (params, context: ToolContext) => {
    if (params.action === "list_processes") {
      context.log(`[Frida] Listing processes on device`);

      try {
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: "frida-ps",
            args: ["-U"],
            cwd: null,
            timeout_ms: 30000
          }
        });
        
        if (response.interrupted) {
          return "[Timeout] Frida process list was interrupted (timed out).";
        }
        return response.stdout || response.stderr;

      } catch (e) {
        throw new Error(`Frida error: ${e}`);
      }
    } else if (params.action === "hook") {
      if (!params.target || !params.script) {
        return "Error: 'hook' action requires 'target' and 'script' parameters.";
      }

      context.log(`[Frida] Hooking ${params.target}`);

      // Write script to temp file, then execute
      const scriptPath = `${Date.now()}_hook.js`;
      const fridaArgs = ["-U"];
      
      if (params.spawn) {
        fridaArgs.push("-f", params.target);
      } else {
        fridaArgs.push("-n", params.target);
      }
      fridaArgs.push("-l", scriptPath, "--no-pause");

      try {
        // First, write the script file
        await invoke("invoke_agent_task_execution", {
          request: {
            cmd: "powershell",
            args: ["-Command", `Set-Content -Path '${scriptPath}' -Value '${params.script.replace(/'/g, "''")}'`],
            cwd: context.workingDir || null
          }
        });

        // Then execute frida with the script
        let response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: "frida",
            args: fridaArgs,
            cwd: context.workingDir || null,
            timeout_ms: 60000 // 1 minute default for hook
          }
        });
        const fridaErrText = String(response.stderr || "");
        if (!response.success && fridaErrText.includes("unrecognized arguments: --no-pause")) {
          const fallbackArgs = fridaArgs.filter((a) => a !== "--no-pause");
          context.log(`[Frida] retry without --no-pause for CLI compatibility`);
          response = await invoke("invoke_agent_task_execution", {
            request: {
              cmd: "frida",
              args: fallbackArgs,
              cwd: null,
              timeout_ms: 60000
            }
          });
        }

        let output = `${response.stdout}\n${response.stderr}`.trim();
        if (response.interrupted) {
          output += "\n\n[Timeout] Frida hook was interrupted (timed out after 1 min).";
        }
        return output || "(no output captured)";

      } catch (e) {
        throw new Error(`Frida hook error: ${e}`);
      }
    } else if (params.action === "trace") {
      if (!params.target || !params.functions?.length) {
        return "Error: 'trace' action requires 'target' and 'functions' parameters.";
      }

      context.log(`[Frida] Tracing ${params.functions.join(", ")} in ${params.target}`);

      const traceArgs = ["-U"];
      if (params.spawn) {
        traceArgs.push("-f", params.target);
      } else {
        traceArgs.push("-n", params.target);
      }
      for (const fn of params.functions) {
        traceArgs.push("-i", fn);
      }

      try {
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: "frida-trace",
            args: traceArgs,
            cwd: null,
            timeout_ms: 60000 // 1 minute default for trace
          }
        });

        let output = `${response.stdout}\n${response.stderr}`.trim();
        if (response.interrupted) {
          output += "\n\n[Timeout] Frida trace was interrupted (timed out after 1 min).";
        }
        return output || "(no output captured)";

      } catch (e) {
        throw new Error(`Frida trace error: ${e}`);
      }
    }

    return "Unknown frida action";
  }
};

/**
 * ApkTool: APK unpacking/repacking tool
 * Used for: extracting AndroidManifest.xml, resources, smali code
 */
export const ApkTool: Tool<any, any> = {
  name: "apktool",
  description: "Use apktool to decode (unpack) or build (repack) APK files. Actions: 'decode' (unpack APK to directory), 'build' (repack directory to APK).",
  inputSchema: z.object({
    action: z.enum(["decode", "build"]).describe("apktool action"),
    input_path: z.string().describe("Path to APK file (for decode) or directory (for build)"),
    output_path: z.string().optional().describe("Output path"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["decode", "build"], description: "apktool action" },
      input_path: { type: "string", description: "Path to APK file (for decode) or directory (for build)" },
      output_path: { type: "string", description: "Output path" }
    },
    required: ["action", "input_path"]
  },
  isReadOnly: false,
  maxOutputChars: 15000,
  call: async (params, context: ToolContext) => {
    if (params.action === "decode") {
      const outputDir = params.output_path || `${params.input_path}_apktool`;
      context.log(`[ApkTool] Decoding ${params.input_path} ->${outputDir}`);

      try {
        const apktoolDecode = withWindowsCmd("apktool", ["d", "-f", "-o", outputDir, params.input_path]);
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: apktoolDecode.cmd,
            args: apktoolDecode.args,
            cwd: context.workingDir || null,
            timeout_ms: 120000 // 2 minutes for decode
          }
        });

        if (response.interrupted) {
          return `[Timeout] apktool decode was interrupted (timed out after 2 mins). Partial output may exist in ${outputDir}.`;
        }
        if (!response.success) {
          return `apktool decode failed:\n${response.stderr}`;
        }
        return `APK decoded successfully. Output: ${outputDir}\n${response.stdout}`;
      } catch (e) {
        throw new Error(`apktool error: ${e}`);
      }
    } else if (params.action === "build") {
      const outputApk = params.output_path || `${params.input_path}_rebuilt.apk`;
      context.log(`[ApkTool] Building ${params.input_path} ->${outputApk}`);

      try {
        const apktoolBuild = withWindowsCmd("apktool", ["b", "-o", outputApk, params.input_path]);
        const response: any = await invoke("invoke_agent_task_execution", {
          request: {
            cmd: apktoolBuild.cmd,
            args: apktoolBuild.args,
            cwd: null,
            timeout_ms: 120000 // 2 minutes for build
          }
        });

        if (response.interrupted) {
          return `[Timeout] apktool build was interrupted (timed out after 2 mins).`;
        }
        if (!response.success) {
          return `apktool build failed:\n${response.stderr}`;
        }
        return `APK rebuilt successfully: ${outputApk}\n${response.stdout}`;
      } catch (e) {
        throw new Error(`apktool error: ${e}`);
      }
    }

    return "Unknown apktool action";
  }
};

/**
 * MemoryTool: Persistent analysis findings storage
 * Used for: saving/loading reverse engineering discoveries across sessions
 */
export const MemoryTool: Tool<any, any> = {
  name: "memory",
  description: "Save or load reverse engineering analysis findings. Use 'save' to persist important discoveries (crypto keys, hook points, class mappings). Use 'load' to retrieve previous findings. Categories: crypto, protocol, hook_point, class_map, key_finding.",
  inputSchema: z.object({
    action: z.enum(["save", "load"]).describe("Memory action"),
    category: z.string().optional().describe("Category: crypto, protocol, hook_point, class_map, key_finding"),
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
      category: { type: "string", description: "Category: crypto, protocol, hook_point, class_map, key_finding" },
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
  description: "Ultra-fast regex search across files using native Rust engine. Orders of magnitude faster than shell grep. Use this to search decompiled code for class names, strings, API calls, encryption patterns. Supports file extension filtering.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    search_path: z.string().describe("Root directory to search in"),
    file_extensions: z.array(z.string()).optional().describe("File extensions to include (e.g., ['java', 'smali', 'xml'])"),
    case_insensitive: z.boolean().optional().describe("Case-insensitive search (default: false)"),
    max_results: z.number().optional().describe("Max matches to return (default: 200)")
  }),
  jsonSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      search_path: { type: "string", description: "Root directory to search in" },
      file_extensions: { type: "array", items: { type: "string" }, description: "File extensions to include (e.g., ['java', 'smali', 'xml'])" },
      case_insensitive: { type: "boolean", description: "Case-insensitive search (default: false)" },
      max_results: { type: "number", description: "Max matches to return (default: 200)" }
    },
    required: ["pattern", "search_path"]
  },
  isReadOnly: true,
  maxOutputChars: 40000,
  call: async (params, context: ToolContext) => {
    context.log(`[Grep/Rust] Searching "${params.pattern}" in ${params.search_path}`);

    try {
      const response: any = await invoke("invoke_agent_grep_search", {
        request: {
          pattern: params.pattern,
          search_path: params.search_path,
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
    context.log(`[HexDump/Rust] ${params.path} @ offset ${params.offset || 0}`);

    try {
      const response: any = await invoke("invoke_agent_hex_dump", {
        request: {
          path: params.path,
          offset: params.offset || null,
          length: params.length || null
        }
      });

      return `[Hex Dump: ${params.path} | Size: ${response.file_size} bytes]\n\n${response.hex_dump}`;
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
  description: "Compute MD5 and SHA256 hashes of a file using native Rust. Use for verifying APK integrity, comparing file versions, or identifying known malware signatures.",
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
    context.log(`[Hash/Rust] Computing hashes for ${params.path}`);

    try {
      const response: any = await invoke("invoke_agent_file_hash", {
        request: { path: params.path }
      });

      const sizeHuman = response.file_size > 1048576
        ? `${(response.file_size / 1048576).toFixed(2)} MB`
        : `${(response.file_size / 1024).toFixed(1)} KB`;

      return `File: ${params.path}\nSize: ${sizeHuman} (${response.file_size} bytes)\nMD5:    ${response.md5}\nSHA256: ${response.sha256}`;
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
  description: "List files and directories with metadata (size, type). Uses native Rust for fast traversal. Supports recursive listing, depth limit, and extension filtering. Use to explore decompiled APK structure.",
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
    context.log(`[ListDir/Rust] ${params.path} (recursive: ${params.recursive || false})`);

    try {
      const response: any = await invoke("invoke_agent_list_dir", {
        request: {
          path: params.path,
          recursive: params.recursive || false,
          max_depth: params.max_depth || null,
          file_extensions: params.file_extensions || null
        }
      });

      if (response.entries.length === 0) {
        return `Directory is empty or no matching files found: ${params.path}`;
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

      return `[${params.path}] ${response.total_count} entries:\n\n${lines.join("\n")}`;
    } catch (e) {
      throw new Error(`List dir error: ${e}`);
    }
  }
};

/**
 * BinaryInfoTool: Native file type identification
 * Parses magic bytes to identify DEX, ELF, APK, PNG, JPEG, etc.
 */
export const BinaryInfoTool: Tool<any, any> = {
  name: "binary_info",
  description: "Identify file type by parsing magic bytes (DEX, ELF .so, APK, ZIP, PNG, JPEG, ARSC). Also reports architecture for ELF files (ARM, AArch64, x86). Native Rust -instant results.",
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
    context.log(`[BinaryInfo/Rust] Identifying ${params.path}`);

    try {
      const response: any = await invoke("invoke_agent_binary_info", {
        request: { path: params.path }
      });

      const detailLines = Object.entries(response.details)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");

      return `File: ${params.path}\nType: ${response.file_type}\n\nDetails:\n${detailLines}`;
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
  description: "Extract printable ASCII strings from binary files (like Unix 'strings'). Essential for finding hardcoded URLs, API keys, encryption keys, debug messages, class names in .so/.dex/.apk files. Native Rust -handles large binaries instantly.",
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
    context.log(`[Strings/Rust] Extracting from ${params.path} (min_len: ${params.min_length || 4})`);

    try {
      const response: any = await invoke("invoke_agent_extract_strings", {
        request: {
          path: params.path,
          min_length: params.min_length || null,
          max_results: params.max_results || null
        }
      });

      if (response.strings.length === 0) {
        return `No printable strings found in ${params.path} (min length: ${params.min_length || 4})`;
      }

      let result = `Extracted ${response.strings.length}/${response.total_found} strings from ${params.path}:\n\n`;
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
 * For modifying smali/config files during RE, or saving analysis reports
 */
export const FileWriteTool: Tool<any, any> = {
  name: "file_write",
  description: "Write content to a file. Automatically creates a .bak backup before overwriting. Use for modifying smali code, writing Frida scripts to disk, saving analysis notes, or patching config files.",
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
    context.log(`[FileWrite/Rust] Writing to ${params.path}`);

    try {
      const result: string = await invoke("invoke_agent_write_file", {
        request: {
          path: params.path,
          content: params.content,
          create_backup: params.create_backup !== undefined ? params.create_backup : true
        }
      });
      return result;
    } catch (e) {
      throw new Error(`File write error: ${e}`);
    }
  }
};

function uniqueLinesFromRegex(text: string, regex: RegExp, max = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const line = (match[1] || match[0] || "").trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

function buildAndroidAutoHookScript(): string {
  return `
setImmediate(function() {
  Java.perform(function() {
    function log(msg) {
      console.log(msg);
    }
    function asString(v) {
      try { return v ? v.toString() : ""; } catch (e) { return "<toString-error>"; }
    }
    try {
      var URL = Java.use("java.net.URL");
      URL.$init.overload("java.lang.String").implementation = function(s) {
        log("[HTTP] URL " + s);
        return this.$init(s);
      };
      log("[HOOK] java.net.URL");
    } catch (e1) {}

    try {
      var ReqBuilder = Java.use("okhttp3.Request$Builder");
      ReqBuilder.build.implementation = function() {
        var req = this.build();
        try {
          log("[HTTP] " + asString(req.method()) + " " + asString(req.url()));
          try {
            var body = req.body();
            if (body) {
              var Buffer = Java.use("okio.Buffer");
              var buf = Buffer.$new();
              body.writeTo(buf);
              log("[PARAM] " + asString(buf.readUtf8()));
            }
          } catch (eBody) {}
        } catch (eReq) {}
        return req;
      };
      log("[HOOK] okhttp3.Request$Builder.build");
    } catch (e2) {}

    try {
      var Cipher = Java.use("javax.crypto.Cipher");
      Cipher.getInstance.overload("java.lang.String").implementation = function(alg) {
        log("[CRYPTO] Cipher.getInstance " + alg);
        return this.getInstance(alg);
      };
      Cipher.doFinal.overload("[B").implementation = function(b) {
        log("[CRYPTO] Cipher.doFinal len=" + (b ? b.length : 0));
        return this.doFinal(b);
      };
      log("[HOOK] javax.crypto.Cipher");
    } catch (e3) {}

    try {
      var Mac = Java.use("javax.crypto.Mac");
      Mac.getInstance.overload("java.lang.String").implementation = function(alg) {
        log("[CRYPTO] Mac.getInstance " + alg);
        return this.getInstance(alg);
      };
      Mac.doFinal.overload("[B").implementation = function(b) {
        log("[CRYPTO] Mac.doFinal len=" + (b ? b.length : 0));
        return this.doFinal(b);
      };
      log("[HOOK] javax.crypto.Mac");
    } catch (e4) {}

    try {
      var MD = Java.use("java.security.MessageDigest");
      MD.getInstance.overload("java.lang.String").implementation = function(alg) {
        log("[CRYPTO] MessageDigest.getInstance " + alg);
        return this.getInstance(alg);
      };
      log("[HOOK] java.security.MessageDigest");
    } catch (e5) {}
  });
});
`.trim();
}

/**
 * AndroidAutoAnalysisTool:
 * One-call pipeline for "capture traffic + analyze params + locate crypto functions".
 */
export const AndroidAutoAnalysisTool: Tool<any, any> = {
  name: "android_auto_analysis",
  description:
    "Automatically run Android reverse pipeline: verify device, optional install APK, detect package, hook network+crypto with Frida, collect traces, and output interface/params/crypto candidates report.",
  inputSchema: z.object({
    apk_path: z.string().optional().describe("Absolute APK path, optional if package_name is provided"),
    package_name: z.string().optional().describe("Android package name, optional if apk_path can be parsed"),
    duration_sec: z.number().optional().describe("Capture duration in seconds (default: 45)"),
    attach: z.boolean().optional().describe("Attach to running process instead of spawn (default: false)"),
    output_dir: z.string().optional().describe("Output directory for traces and report"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      apk_path: { type: "string", description: "Absolute APK path" },
      package_name: { type: "string", description: "Android package name" },
      duration_sec: { type: "number", description: "Capture duration in seconds (default: 45)" },
      attach: { type: "boolean", description: "Attach mode (default: false means spawn)" },
      output_dir: { type: "string", description: "Output directory for traces and report" },
    },
    required: [],
  },
  isReadOnly: false,
  maxOutputChars: 40000,
  call: async (params, context: ToolContext) => {
    const durationSec = Math.min(Math.max(params.duration_sec || 45, 15), 180);
    const attach = params.attach === true;
    let packageName = (params.package_name || "").trim();
    const apkPath = params.apk_path?.trim() || "";
    const outputDir = params.output_dir || `C:\\traceforge\\android_auto\\${Date.now()}`;
    const hookScriptPath = `${outputDir}\\auto_hook.js`;
    const fridaLogPath = `${outputDir}\\frida.log`;
    const reportPath = `${outputDir}\\report.md`;

    if (!packageName && !apkPath) {
      return "android_auto_analysis requires at least one of: package_name or apk_path.";
    }

    context.log(`[AndroidAuto] init: package=${packageName || "(auto)"} apk=${apkPath || "(none)"}`);

    await invoke("invoke_agent_task_execution", {
      request: {
        cmd: "powershell",
        args: ["-Command", `New-Item -ItemType Directory -Force -Path '${outputDir}' | Out-Null`],
        cwd: null,
        timeout_ms: 15000,
      },
    });

    const adbDevices: any = await invoke("invoke_agent_task_execution", {
      request: { cmd: "adb", args: ["devices"], cwd: null, timeout_ms: 15000 },
    });
    if (!adbDevices.success || !String(adbDevices.stdout || "").includes("\tdevice")) {
      return `No Android device available via adb.\n${adbDevices.stdout || ""}\n${adbDevices.stderr || ""}`;
    }

    if (!packageName && apkPath) {
      const aaptResult: any = await invoke("invoke_agent_task_execution", {
        request: { cmd: "aapt", args: ["dump", "badging", apkPath], cwd: null, timeout_ms: 20000 },
      }).catch(() => null);
      const aaptText = `${aaptResult?.stdout || ""}\n${aaptResult?.stderr || ""}`;
      const m = aaptText.match(/package:\s+name='([^']+)'/);
      if (m?.[1]) packageName = m[1];
    }

    if (apkPath) {
      const installResult: any = await invoke("invoke_agent_task_execution", {
        request: { cmd: "adb", args: ["install", "-r", apkPath], cwd: null, timeout_ms: 120000 },
      });
      context.log(`[AndroidAuto] install: ${installResult.success ? "ok" : "fail"}`);
    }

    if (!packageName) {
      return "Failed to resolve package_name automatically. Please provide package_name explicitly.";
    }

    await invoke("invoke_agent_task_execution", {
      request: { cmd: "adb", args: ["logcat", "-c"], cwd: null, timeout_ms: 12000 },
    }).catch(() => null);

    const hookScript = buildAndroidAutoHookScript();
    await invoke("invoke_agent_write_file", {
      request: { path: hookScriptPath, content: hookScript, create_backup: false },
    });

    const fridaArgs = attach
      ? ["-U", "-n", packageName, "-l", hookScriptPath, "--no-pause"]
      : ["-U", "-f", packageName, "-l", hookScriptPath, "--no-pause"];
    let fridaCompatibilityFallback = false;

    let fridaRun: any = await invoke("invoke_agent_task_execution", {
      request: {
        cmd: "frida",
        args: fridaArgs,
        cwd: null,
        timeout_ms: durationSec * 1000,
      },
    });
    const fridaErrText = String(fridaRun.stderr || "");
    if (!fridaRun.success && fridaErrText.includes("unrecognized arguments: --no-pause")) {
      const fallbackArgs = fridaArgs.filter((a) => a !== "--no-pause");
      context.log(`[AndroidAuto] frida fallback: retry without --no-pause`);
      fridaCompatibilityFallback = true;
      fridaRun = await invoke("invoke_agent_task_execution", {
        request: {
          cmd: "frida",
          args: fallbackArgs,
          cwd: null,
          timeout_ms: durationSec * 1000,
        },
      });
    }

    const fridaOutput = `${fridaRun.stdout || ""}\n${fridaRun.stderr || ""}`;
    await invoke("invoke_agent_write_file", {
      request: { path: fridaLogPath, content: fridaOutput, create_backup: false },
    });

    const logcatDump: any = await invoke("invoke_agent_task_execution", {
      request: { cmd: "adb", args: ["logcat", "-d"], cwd: null, timeout_ms: 25000 },
    }).catch(() => ({ stdout: "", stderr: "", success: false }));

    const endpoints = uniqueLinesFromRegex(fridaOutput, /\[HTTP\]\s+([^\n]+)/gim, 60);
    const paramsFound = uniqueLinesFromRegex(fridaOutput, /\[PARAM\]\s+([^\n]+)/gim, 80);
    const cryptoFound = uniqueLinesFromRegex(fridaOutput, /\[CRYPTO\]\s+([^\n]+)/gim, 120);
    const hooksLoaded = uniqueLinesFromRegex(fridaOutput, /\[HOOK\]\s+([^\n]+)/gim, 30);

    const report = [
      "# Android Auto Analysis Report",
      "",
      `- package: \`${packageName}\``,
      `- apk: \`${apkPath || "(not provided)"}\``,
      `- duration_sec: \`${durationSec}\``,
      `- mode: \`${attach ? "attach" : "spawn"}\``,
      `- frida_cli_fallback: \`${fridaCompatibilityFallback ? "without --no-pause" : "not used"}\``,
      `- frida_log: \`${fridaLogPath}\``,
      "",
      "## Interface Capture",
      ...(endpoints.length ? endpoints.map((x) => `- ${x}`) : ["- No interface traces captured."]),
      "",
      "## Parameter Clues",
      ...(paramsFound.length ? paramsFound.slice(0, 40).map((x) => `- ${x}`) : ["- No request payload snippets captured."]),
      "",
      "## Crypto Function Candidates",
      ...(cryptoFound.length ? cryptoFound.slice(0, 60).map((x) => `- ${x}`) : ["- No crypto events captured."]),
      "",
      "## Hook Coverage",
      ...(hooksLoaded.length ? hooksLoaded.map((x) => `- ${x}`) : ["- No hook ready logs captured."]),
      "",
      "## Next Action",
      "- If endpoints are empty: manually operate app during capture window, then rerun.",
      "- If crypto is empty: app may use native layer; hook JNI exports / libssl / custom so.",
      "",
      "## logcat tail (for anti-debug / pinning hints)",
      "```text",
      String(logcatDump.stdout || "").slice(-3000),
      "```",
    ].join("\n");

    await invoke("invoke_agent_write_file", {
      request: { path: reportPath, content: report, create_backup: false },
    });

    return [
      `android_auto_analysis completed.`,
      `package: ${packageName}`,
      `report: ${reportPath}`,
      `frida_log: ${fridaLogPath}`,
      `endpoints: ${endpoints.length}`,
      `params: ${paramsFound.length}`,
      `crypto_candidates: ${cryptoFound.length}`,
      fridaRun.interrupted ? `note: frida capture timed out at ${durationSec}s (expected).` : "",
      "",
      report,
    ].filter(Boolean).join("\n");
  },
};


/**
 * All available tools for the Agent, exported as an array.
 */
export const ALL_TOOLS: Tool<any, any>[] = [
  ShellTool,
  AdbTool,
  FileReadTool,
  JadxTool,
  FridaTool,
  ApkTool,
  MemoryTool,
  AndroidAutoAnalysisTool,
  // Native Rust-powered high-performance tools
  GrepTool,
  HexDumpTool,
  FileHashTool,
  ListDirTool,
  BinaryInfoTool,
  StringsTool,
  FileWriteTool,
];


