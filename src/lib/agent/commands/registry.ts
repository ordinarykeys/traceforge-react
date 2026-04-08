import { translate, type AppLocale } from "@/lib/i18n";
import type {
  CommandContext,
  CommandResult,
  ParsedSlashCommand,
  SlashCommand,
  SlashCommandDescriptor,
} from "./types";
import budgetCommand from "./budget";
import doctorCommand from "./doctor";
import gitCommand from "./git";
import helpCommand from "./help";
import permissionsCommand from "./permissions";
import promptCommand from "./prompt";
import queueCommand from "./queue";
import recoverCommand from "./recover";
import rewindCommand from "./rewind";
import statusCommand from "./status";
import taskCommand from "./task";
import toolsCommand from "./tools";
import traceCommand from "./trace";
import usageCommand from "./usage";

export class CommandRegistry {
  private readonly byName = new Map<string, SlashCommand>();

  constructor(commands: SlashCommand[]) {
    for (const command of commands) {
      this.byName.set(command.name.toLowerCase(), command);
      for (const alias of command.aliases ?? []) {
        this.byName.set(alias.toLowerCase(), command);
      }
    }
  }

  public getCommands(): SlashCommand[] {
    const seen = new Set<string>();
    const result: SlashCommand[] = [];
    for (const command of this.byName.values()) {
      if (!seen.has(command.name)) {
        seen.add(command.name);
        result.push(command);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getDescriptors(locale: AppLocale): SlashCommandDescriptor[] {
    return this.getCommands().map((command) => ({
      name: command.name,
      aliases: [...(command.aliases ?? [])],
      category: command.category,
      description: translate(locale, command.descriptionKey),
      usage: translate(locale, command.usageKey),
    }));
  }

  public async execute(parsed: ParsedSlashCommand, context: Omit<CommandContext, "parsed">): Promise<CommandResult> {
    const command = this.byName.get(parsed.name);
    if (!command) {
      return {
        error: true,
        message: context.t("agent.command.unknownCommand", { command: `/${parsed.name}` }),
      };
    }

    return command.execute({
      ...context,
      parsed,
    });
  }
}

export function createDefaultCommandRegistry(): CommandRegistry {
  return new CommandRegistry([
    helpCommand,
    statusCommand,
    queueCommand,
    recoverCommand,
    budgetCommand,
    usageCommand,
    traceCommand,
    doctorCommand,
    gitCommand,
    rewindCommand,
    toolsCommand,
    permissionsCommand,
    taskCommand,
    promptCommand,
  ]);
}

