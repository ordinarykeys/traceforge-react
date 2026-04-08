import type { SlashCommandDescriptor } from "./types";

const CATEGORY_ORDER: SlashCommandDescriptor["category"][] = [
  "core",
  "tools",
  "permissions",
  "tasks",
];

export interface SlashCommandSuggestionItem {
  id: string;
  command: SlashCommandDescriptor;
  matchedAlias?: string;
  score: number;
}

export function isCommandInput(input: string): boolean {
  return input.startsWith("/");
}

export function hasCommandArgs(input: string): boolean {
  if (!isCommandInput(input)) return false;
  if (!input.includes(" ")) return false;
  if (input.endsWith(" ")) return false;
  return true;
}

function findMatchedAlias(query: string, aliases: string[]): string | undefined {
  if (!query) return undefined;
  return aliases.find((alias) => alias.toLowerCase().startsWith(query));
}

function scoreCommandMatch(query: string, command: SlashCommandDescriptor): number {
  const q = query.toLowerCase();
  const name = command.name.toLowerCase();
  const aliases = command.aliases.map((alias) => alias.toLowerCase());

  if (!q) return 50;
  if (name === q) return 0;
  if (aliases.includes(q)) return 1;
  if (name.startsWith(q)) return 2 + (name.length - q.length) / 100;

  const prefixAlias = aliases.find((alias) => alias.startsWith(q));
  if (prefixAlias) return 3 + (prefixAlias.length - q.length) / 100;
  if (name.includes(q)) return 4;
  if (aliases.some((alias) => alias.includes(q))) return 5;
  if (command.description.toLowerCase().includes(q)) return 6;
  if (command.usage.toLowerCase().includes(q)) return 7;

  return Number.POSITIVE_INFINITY;
}

export function generateSlashCommandSuggestions(
  input: string,
  commands: SlashCommandDescriptor[],
  options?: { limit?: number },
): {
  query: string;
  items: SlashCommandSuggestionItem[];
  groups: Array<{
    category: SlashCommandDescriptor["category"];
    items: SlashCommandSuggestionItem[];
  }>;
} | null {
  const raw = input.trimStart();
  if (!raw.startsWith("/")) {
    return null;
  }

  const body = raw.slice(1);
  if (/\s/.test(body)) {
    return null;
  }

  const query = body.trim().toLowerCase();
  const limit = options?.limit ?? 10;

  const scored: SlashCommandSuggestionItem[] = [];
  for (const command of commands) {
    const score = scoreCommandMatch(query, command);
    if (score === Number.POSITIVE_INFINITY) {
      continue;
    }
    scored.push({
      id: `${command.name}:${command.category}`,
      command,
      matchedAlias: findMatchedAlias(query, command.aliases),
      score,
    });
  }

  scored
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      const leftCategoryIndex = CATEGORY_ORDER.indexOf(left.command.category);
      const rightCategoryIndex = CATEGORY_ORDER.indexOf(right.command.category);
      if (leftCategoryIndex !== rightCategoryIndex) {
        return leftCategoryIndex - rightCategoryIndex;
      }
      return left.command.name.localeCompare(right.command.name);
    });
  if (scored.length > limit) {
    scored.length = limit;
  }

  const groups = CATEGORY_ORDER
    .map((category) => ({
      category,
      items: scored.filter((item) => item.command.category === category),
    }))
    .filter((group) => group.items.length > 0);

  return {
    query,
    items: scored,
    groups,
  };
}

export function formatSlashCommand(name: string): string {
  return `/${name} `;
}
