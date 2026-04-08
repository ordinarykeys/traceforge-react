import type { SlashCommand } from "../types";

const helpCommand: SlashCommand = {
  name: "help",
  aliases: ["h", "?"],
  category: "core",
  descriptionKey: "agent.command.help.description",
  usageKey: "agent.command.help.usage",
  execute: async (context) => {
    const descriptors = context.getCommandDescriptors();
    if (descriptors.length === 0) {
      return { message: `${context.t("agent.command.help.title")}\n${context.t("agent.command.help.empty")}` };
    }

    const lines = descriptors.map((descriptor) => {
      const aliasPart =
        descriptor.aliases.length > 0
          ? ` ${context.t("agent.command.help.aliases", {
              aliases: descriptor.aliases.map((alias) => `/${alias}`).join(" "),
            })}`
          : "";
      return `/${descriptor.name}${aliasPart} -> ${descriptor.usage} :: ${descriptor.description}`;
    });

    return {
      message: [context.t("agent.command.help.title"), ...lines].join("\n"),
    };
  },
};

export default helpCommand;
