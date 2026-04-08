import type { QueryStreamEvent } from "./query/events";

export function deriveTraceListMessage(options: {
  visibleEvents: readonly QueryStreamEvent[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatEventTime: (at: number) => string;
  formatEventLine: (event: QueryStreamEvent) => string;
  filterLabel: string;
  warningLabel: string;
}): string {
  if (options.visibleEvents.length === 0) {
    return [
      options.t("agent.command.trace.title", { count: 0 }),
      options.t("agent.command.trace.empty"),
    ].join("\n");
  }

  const lines = options.visibleEvents.map((event) => {
    const at = options.formatEventTime(event.at);
    return `[${at}] ${options.formatEventLine(event)}`;
  });

  return [
    options.t("agent.command.trace.title", { count: options.visibleEvents.length }),
    options.t("agent.command.trace.appliedFilter", {
      filter: options.filterLabel,
      warnings: options.warningLabel,
    }),
    ...lines,
  ].join("\n");
}

