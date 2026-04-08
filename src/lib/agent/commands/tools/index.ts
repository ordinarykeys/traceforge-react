import type { SlashCommand } from "../types";

const toolsCommand: SlashCommand = {
  name: "tools",
  category: "tools",
  descriptionKey: "agent.command.tools.description",
  usageKey: "agent.command.tools.usage",
  execute: async (context) => {
    const tools = context.getToolNames();
    return {
      message: [
        context.t("agent.command.tools.title", { count: tools.length }),
        ...(tools.length > 0 ? tools.map((name) => `- ${name}`) : [context.t("agent.command.tools.empty")]),
      ].join("\n"),
    };
  },
};

export default toolsCommand;
