import type { PermissionRule } from "../permissions/toolPermissions";
import type { AgentTaskManager } from "../tasks/TaskManager";
import type { AgentMessage, QueuePriority, UsageSnapshot } from "../QueryEngine";
import type { QueryStreamEvent } from "../query/events";
import type { AppLocale, TranslationKey } from "@/lib/i18n";

export type ToolPermissionMode = "default" | "full_access";
export type CommandCategory = "core" | "tools" | "permissions" | "tasks";

export interface ParsedSlashCommand {
  raw: string;
  name: string;
  args: string[];
  rawArgs: string;
}

export interface CommandResult {
  message: string;
  error?: boolean;
}

export interface CommandContext {
  parsed: ParsedSlashCommand;
  workingDir?: string;
  threadId?: string;
  currentModel?: string;
  locale: AppLocale;
  queueCount: number;
  queueLimit: number;
  queueByPriority: Readonly<Record<QueuePriority, number>>;
  permissionMode: ToolPermissionMode;
  permissionRules: PermissionRule[];
  addPermissionRules: (rules: PermissionRule[]) => void;
  clearPermissionRules: () => void;
  getToolNames: () => string[];
  getCommandDescriptors: () => SlashCommandDescriptor[];
  getMessages: () => AgentMessage[];
  getUsageSnapshot: () => UsageSnapshot;
  resetUsageSnapshot: () => void;
  getRecentQueryEvents: (limit?: number) => QueryStreamEvent[];
  clearQueryEvents: () => void;
  submitFollowupQuery: (
    query: string,
    options?: {
      model?: string;
      permissionMode?: ToolPermissionMode;
      priority?: QueuePriority;
    },
  ) => {
    accepted: boolean;
    reason?: "empty" | "queue_full";
    queueCount: number;
    queueLimit: number;
    queuedId?: string;
    started?: boolean;
    commandId?: string;
  };
  taskManager: AgentTaskManager;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export interface SlashCommandDescriptor {
  name: string;
  aliases: string[];
  category: CommandCategory;
  description: string;
  usage: string;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  category: CommandCategory;
  descriptionKey: TranslationKey;
  usageKey: TranslationKey;
  execute: (context: CommandContext) => Promise<CommandResult>;
}
