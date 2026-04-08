import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Tool, ToolContext } from "../../types";

export const MemoryTool: Tool<any, any> = {
  name: "memory",
  description:
    "Save or load analysis findings. Use 'save' to persist key discoveries and 'load' to retrieve previous entries across turns or threads.",
  inputSchema: z.object({
    action: z.enum(["save", "load"]).describe("Memory action"),
    category: z.string().optional().describe("Category for grouping memory entries"),
    title: z.string().optional().describe("Short title for the memory entry (used as ID for 'save')"),
    content: z.string().optional().describe("Content to save (for 'save' action)"),
    limit: z.number().optional().describe("Max number of entries to load (default: 20)"),
    scope: z.enum(["current_thread", "all_threads"]).optional().describe("Load scope: current_thread (default) or all_threads"),
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
      },
    },
    required: ["action"],
  },
  isReadOnly: false,
  maxOutputChars: 10000,
  call: async (params, context: ToolContext) => {
    const currentThreadId = context.threadId || "default";

    if (params.action === "save") {
      if (!params.category || !params.title || !params.content) {
        return "Error: 'save' requires 'category', 'title', and 'content' parameters.";
      }

      const id = `${params.category}_${params.title.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`;
      context.log(`[Memory] Saving: [${params.category}] ${params.title}`);

      try {
        await invoke("invoke_agent_save_memory", {
          request: {
            id,
            category: params.category,
            content: params.content,
            metadata: JSON.stringify({ title: params.title }),
            thread_id: currentThreadId,
          },
        });

        return `[OK]Memory saved: [${params.category}] ${params.title} (thread: ${currentThreadId})`;
      } catch (e) {
        throw new Error(`Memory save error: ${e}`);
      }
    }

    if (params.action === "load") {
      const scope = params.scope ?? "current_thread";
      const threadIdFilter = scope === "all_threads" ? null : currentThreadId;
      context.log(`[Memory] Loading memories${params.category ? ` (category: ${params.category})` : ""} (scope: ${scope})`);

      try {
        const entries: any[] = await invoke("invoke_agent_load_memories", {
          request: {
            category: params.category || null,
            thread_id: threadIdFilter,
            limit: params.limit || 20,
          },
        });

        if (entries.length === 0) {
          return "No memories found" + (params.category ? ` for category: ${params.category}` : "") + ".";
        }

        return entries
          .map((entry: any) => {
            const meta = entry.metadata ? JSON.parse(entry.metadata) : {};
            return `[${entry.category}] ${meta.title || entry.id}\n${entry.content}\n---`;
          })
          .join("\n");
      } catch (e) {
        throw new Error(`Memory load error: ${e}`);
      }
    }

    return "Unknown memory action";
  },
};

