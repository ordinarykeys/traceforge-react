import { useEffect, useMemo, useState } from "react";
import { useThemeStore } from "@/hooks/useThemeStore";
import {
  Activity,
  ArrowUp,
  ChevronDown,
  Coins,
  CornerUpLeft,
  Square,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QueuePriority, QueuedQueryItem, ToolPermissionMode } from "@/lib/agent/QueryEngine";
import type { SlashCommandDescriptor } from "@/lib/agent/commands/types";

interface ModelInfo {
  id: string;
  label: string;
}

interface ComposerPanelProps {
  input: string;
  isThinking: boolean;
  isEngineReady: boolean;
  currentModel: string;
  availableModels: ModelInfo[];
  onInputChange: (value: string, target: HTMLTextAreaElement) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onClear: () => void;
  onModelChange: (modelId: string) => void;
  onStop: () => void;
  onSend: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  toolNames: string[];
  slashCommands: SlashCommandDescriptor[];
  queuedItems: readonly QueuedQueryItem[];
  onRemoveQueuedItem: (queueId: string) => void;
  onEditQueuedItem: (queueId: string) => void;
  onChangeQueuedItemPriority: (queueId: string, priority: QueuePriority) => void;
  queuedCount: number;
  queueLimit: number;
  queueByPriority: Readonly<Record<QueuePriority, number>>;
  permissionMode: ToolPermissionMode;
  permissionLabel: string;
  permissionRuleCount: number;
  onPermissionChange: (mode: ToolPermissionMode) => void;
  onClearPermissionRules: () => void;
  onAllowWorkspaceWrite: () => void;
  canAllowWorkspaceWrite: boolean;
  showUserPopover: boolean;
  onUserPopoverChange: (open: boolean) => void;
  userInfo: any;
  onRequestUserInfoRefresh: () => void;
}

const permissionModes: ToolPermissionMode[] = ["default", "full_access"];
const categoryOrder: SlashCommandDescriptor["category"][] = [
  "core",
  "tools",
  "permissions",
  "tasks",
];

function toFiniteAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return 0;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function ComposerPanel({
  input,
  isThinking,
  isEngineReady,
  currentModel,
  availableModels,
  onInputChange,
  onKeyDown,
  onClear,
  onModelChange,
  onStop,
  onSend,
  inputRef,
  toolNames,
  slashCommands,
  queuedItems,
  onRemoveQueuedItem,
  onEditQueuedItem,
  onChangeQueuedItemPriority,
  queuedCount,
  queueLimit,
  queueByPriority,
  permissionMode,
  permissionLabel,
  permissionRuleCount,
  onPermissionChange,
  onClearPermissionRules,
  onAllowWorkspaceWrite,
  canAllowWorkspaceWrite,
  showUserPopover,
  onUserPopoverChange,
  userInfo,
  onRequestUserInfoRefresh,
}: ComposerPanelProps) {
  const { isTranslucent, isDark } = useThemeStore();
  const { locale } = useLocaleStore();
  const toolCount = toolNames.length;
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);

  const getSlashCategoryLabel = (category: SlashCommandDescriptor["category"]) => {
    switch (category) {
      case "core":
        return translate(locale, "agent.slashCategory.core");
      case "tools":
        return translate(locale, "agent.slashCategory.tools");
      case "permissions":
        return translate(locale, "agent.slashCategory.permissions");
      case "tasks":
        return translate(locale, "agent.slashCategory.tasks");
      default:
        return category;
    }
  };

  const slashSuggestions = useMemo(() => {
    const raw = input.trimStart();
    if (!raw.startsWith("/")) {
      return null;
    }

    const body = raw.slice(1);
    if (/\s/.test(body)) {
      return null;
    }

    const query = body.trim().toLowerCase();
    const items = slashCommands
      .filter((command) => {
        if (!query) return true;
        if (command.name.toLowerCase().includes(query)) return true;
        return command.aliases.some((alias) => alias.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const left = categoryOrder.indexOf(a.category);
        const right = categoryOrder.indexOf(b.category);
        if (left !== right) {
          return left - right;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);

    const groups = categoryOrder
      .map((category) => {
        const groupItems = items.filter((item) => item.category === category);
        return { category, items: groupItems };
      })
      .filter((group) => group.items.length > 0);

    return { query, items, groups };
  }, [input, slashCommands]);

  const visibleQueuedItems = useMemo(() => queuedItems.slice(0, 3), [queuedItems]);
  const queuedOverflowCount = Math.max(0, queuedItems.length - visibleQueuedItems.length);
  const [queueNow, setQueueNow] = useState(() => Date.now());
  const [isQueuePreviewExpanded, setIsQueuePreviewExpanded] = useState(false);

  useEffect(() => {
    if (queuedItems.length === 0) {
      setQueueNow(Date.now());
      return;
    }
    const timer = window.setInterval(() => {
      setQueueNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [queuedItems.length]);

  useEffect(() => {
    if (queuedItems.length === 0) {
      setIsQueuePreviewExpanded(false);
    }
  }, [queuedItems.length]);

  const formatQueuedAge = (queuedAt: number) => {
    const seconds = Math.max(0, Math.floor((queueNow - queuedAt) / 1000));
    return translate(locale, "agent.queue.waiting", { seconds });
  };
  const formatQueuePriority = (priority: QueuePriority) => {
    return translate(locale, `agent.queue.priority.${priority}`);
  };
  const cycleQueuePriority = (priority: QueuePriority): QueuePriority => {
    if (priority === "now") return "next";
    if (priority === "next") return "later";
    return "now";
  };
  const queuePrioritySummary = useMemo(() => {
    const order: QueuePriority[] = ["now", "next", "later"];
    const parts: string[] = [];
    for (const priority of order) {
      const count = queueByPriority[priority] ?? 0;
      if (count <= 0) continue;
      parts.push(`${translate(locale, `agent.queue.priority.${priority}`)} ${count}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "";
  }, [locale, queueByPriority]);

  useEffect(() => {
    setActiveCommandIndex(0);
  }, [slashSuggestions?.query, slashSuggestions?.items.length]);

  const applyCommandSuggestion = (command: SlashCommandDescriptor) => {
    const target = inputRef.current;
    if (!target) return;

    const next = `/${command.name} `;
    onInputChange(next, target);
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(next.length, next.length);
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashSuggestions && slashSuggestions.items.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCommandIndex((prev) => (prev + 1) % slashSuggestions.items.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCommandIndex((prev) =>
          prev === 0 ? slashSuggestions.items.length - 1 : prev - 1,
        );
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        const selected =
          slashSuggestions.items[activeCommandIndex] ?? slashSuggestions.items[0];
        if (selected) {
          applyCommandSuggestion(selected);
        }
        return;
      }
    }

    onKeyDown(event);
  };

  const totalBalance = useMemo(() => toFiniteAmount(userInfo?.totalBalance), [userInfo]);
  const chargeBalance = useMemo(() => toFiniteAmount(userInfo?.chargeBalance), [userInfo]);
  const freezeBalance = useMemo(() => toFiniteAmount(userInfo?.freezeBalance), [userInfo]);
  const accountName = useMemo(() => {
    const raw = typeof userInfo?.name === "string" ? userInfo.name.trim() : "";
    return raw || translate(locale, "agent.defaultAccountName");
  }, [locale, userInfo]);
  const accountId = useMemo(() => {
    const raw = typeof userInfo?.id === "string" ? userInfo.id.trim() : "";
    return raw || "--";
  }, [userInfo]);
  const accountStatusLabel = useMemo(() => {
    const status = typeof userInfo?.status === "string" ? userInfo.status.trim().toLowerCase() : "";
    if (status === "normal") return translate(locale, "agent.statusNormal");
    if (!status) return translate(locale, "agent.statusUnknown");
    return status;
  }, [locale, userInfo]);
  const accountStatusClass =
    typeof userInfo?.status === "string" && userInfo.status.trim().toLowerCase() === "normal"
      ? "text-green-500/70"
      : "text-yellow-500/70";
  const balancePercent = useMemo(() => {
    if (totalBalance <= 0) return 0;
    return Math.min(100, (chargeBalance / totalBalance) * 100);
  }, [chargeBalance, totalBalance]);

  return (
    <div className="pb-6 flex flex-col items-center gap-4 shrink-0">
      {queuedItems.length > 0 && (
        <div className="max-w-3xl w-full px-2">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-background/40"
              onClick={() => setIsQueuePreviewExpanded((prev) => !prev)}
              title={translate(locale, "agent.queue.previewTitle", { count: queuedItems.length })}
            >
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {translate(locale, "agent.queue.previewTitle", { count: queuedItems.length })}
                </div>
                {queuePrioritySummary && (
                  <div className="text-[10px] text-muted-foreground/70">{queuePrioritySummary}</div>
                )}
              </div>
              <ChevronDown
                size={13}
                className={cn(
                  "ml-2 shrink-0 text-muted-foreground/75 transition-transform",
                  isQueuePreviewExpanded && "rotate-180",
                )}
              />
            </button>
            {isQueuePreviewExpanded && (
              <>
                <div className="mt-1 space-y-1">
                  {visibleQueuedItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/70 px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1 text-[12px] text-foreground/85">
                        <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                          <span className="font-mono">#{index + 1}</span>
                          <span>{formatQueuedAge(item.queuedAt)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 rounded border border-border/50 px-1.5 text-[9px] leading-none text-muted-foreground/85 hover:bg-muted/60"
                            onClick={() =>
                              onChangeQueuedItemPriority(item.id, cycleQueuePriority(item.priority))
                            }
                            title={translate(locale, "agent.metricQueuePriority")}
                          >
                            {formatQueuePriority(item.priority)}
                          </Button>
                        </div>
                        <span className="block truncate">{item.query}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground/80 hover:bg-muted/50"
                          onClick={() => onEditQueuedItem(item.id)}
                          title={translate(locale, "agent.queue.action.edit")}
                        >
                          <CornerUpLeft size={11} className="mr-1" />
                          {translate(locale, "agent.queue.action.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onRemoveQueuedItem(item.id)}
                          title={translate(locale, "agent.queue.action.remove")}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {queuedOverflowCount > 0 && (
                  <div className="mt-1 px-1 text-[10px] text-muted-foreground/70">
                    {translate(locale, "agent.queue.previewOverflow", { count: queuedOverflowCount })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-3xl w-full relative px-2">
        <div
          className={cn(
            "relative flex flex-col p-2.5 rounded-2xl border border-border/60 transition-all",
            isTranslucent ? "bg-card/85 backdrop-blur-xl" : "bg-card shadow-sm",
          )}
        >
          <Textarea
            ref={inputRef}
            className="min-h-[42px] max-h-[400px] w-full px-4 border-none bg-transparent focus-visible:ring-0 text-[14px] text-foreground/90 placeholder:text-muted-foreground/50 font-normal resize-none shadow-none focus:ring-0 py-3 scrollbar-none"
            placeholder={translate(locale, "agent.placeholder")}
            value={input}
            onChange={(e) => onInputChange(e.target.value, e.target)}
            onKeyDown={handleInputKeyDown}
            disabled={false}
          />

          {slashSuggestions && (
            <div className="mx-2 mb-1 rounded-xl border border-border/50 bg-card/95 p-2 backdrop-blur-md">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                {translate(locale, "agent.slashSuggestionsTitle")}
              </div>
              {slashSuggestions.items.length === 0 ? (
                <div className="px-1 py-1 text-[12px] text-muted-foreground/70">
                  {translate(locale, "agent.slashSuggestionsEmpty")}
                </div>
              ) : (
                <div className="space-y-1">
                  {slashSuggestions.groups.map((group) => (
                    <div key={group.category} className="space-y-1">
                      <div className="px-1 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground/55">
                        {getSlashCategoryLabel(group.category)}
                      </div>
                      {group.items.map((command) => {
                        const index = slashSuggestions.items.findIndex(
                          (item) => item.name === command.name,
                        );
                        return (
                          <button
                            key={command.name}
                            onClick={() => applyCommandSuggestion(command)}
                            className={cn(
                              "w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
                              index === activeCommandIndex
                                ? "border-primary/20 bg-primary/10"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] font-semibold text-foreground">
                                /{command.name}
                              </span>
                              {command.aliases.length > 0 && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  {command.aliases.map((alias) => `/${alias}`).join(" ")}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground/80">
                              {command.description}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/60">
                              {command.usage}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between px-3 pt-1 pb-1">
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={onClear}
                title={translate(locale, "agent.clearConversation")}
              >
                <Trash2 size={15} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-medium hover:bg-muted flex items-center gap-1 max-w-[180px]"
                  >
                    <span className="truncate">{currentModel}</span>
                    <ChevronDown size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[260px] max-h-[300px] overflow-y-auto bg-card/95 backdrop-blur-md border-border/50"
                >
                  {availableModels.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      className={cn(
                        "text-[12px] font-medium cursor-pointer",
                        currentModel === model.id && "text-primary font-bold",
                      )}
                      onClick={() => onModelChange(model.id)}
                    >
                      {model.label}
                      {currentModel === model.id && <span className="ml-auto">{"\u2713"}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              {isThinking && (
                <Button
                  onClick={onStop}
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-full transition-all flex items-center justify-center shadow-sm border border-background/10 group/stop",
                    isDark
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-black/90",
                  )}
                  title={translate(locale, "agent.stopTask")}
                >
                  <Square size={10} className="fill-current" strokeWidth={0} />
                </Button>
              )}

              <Button
                onClick={onSend}
                size="icon"
                disabled={!input.trim() || !isEngineReady}
                className={cn(
                  "h-8 w-8 transition-all duration-300 rounded-full shadow-sm flex items-center justify-center",
                  isThinking
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : isDark
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-black/90",
                )}
                title={
                  !isEngineReady
                    ? translate(locale, "agent.engineNotReady")
                    : isThinking
                      ? translate(locale, "agent.joinQueue")
                      : translate(locale, "agent.sendInstruction")
                }
              >
                <ArrowUp size={18} strokeWidth={2} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl w-full flex items-center gap-3 px-4 pr-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground/50 hover:bg-muted flex items-center gap-2 px-2 rounded-lg bg-muted/20 shrink-0"
              title={`${translate(locale, "agent.engineReady")}: ${toolCount} · ${translate(locale, "agent.queue")}: ${
                queueLimit > 0 ? `${queuedCount}/${queueLimit}` : queuedCount
              }`}
            >
              <Activity size={12} className="opacity-70" /> {permissionLabel}
              <span className="rounded border border-border/40 px-1 font-mono text-[9px] opacity-70">
                {translate(locale, "permission.ruleCount")} {permissionRuleCount}
              </span>
              <ChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px] bg-card/95 border-border/50">
            {permissionModes.map((option) => (
              <DropdownMenuItem
                key={option}
                className="text-[11px] flex justify-between items-center"
                onClick={() => onPermissionChange(option)}
              >
                {option === "full_access"
                  ? translate(locale, "permission.fullAccess")
                  : translate(locale, "permission.default")}
                {permissionMode === option && "\u2713"}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[11px]"
              disabled={!canAllowWorkspaceWrite}
              onClick={onAllowWorkspaceWrite}
            >
              {translate(locale, "permission.allowWorkspaceWrite")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[11px] text-destructive focus:text-destructive"
              disabled={permissionRuleCount === 0}
              onClick={onClearPermissionRules}
            >
              {translate(locale, "permission.clearRules")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto">
          <div
            className="relative group/user"
            onMouseEnter={() => onUserPopoverChange(true)}
            onMouseLeave={() => onUserPopoverChange(false)}
          >
            <button
              onClick={() => {
                onRequestUserInfoRefresh();
                onUserPopoverChange(true);
              }}
              className="h-6 w-6 rounded-lg bg-muted/20 border border-border/20 flex items-center justify-center hover:bg-muted/40 transition-all cursor-pointer"
            >
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  userInfo?.status === "normal" ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30",
                )}
              />
            </button>

            {showUserPopover && userInfo && (
              <div className="absolute bottom-full right-0 mb-3 w-[220px] p-4 rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                <header className="mb-3 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                  {translate(locale, "agent.accountInfo")}
                </header>
                <div className="space-y-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-foreground/85">
                        {accountName}
                      </span>
                      <span className="truncate text-[9px] font-mono text-muted-foreground/60">
                        {translate(locale, "agent.accountId")}: {accountId}
                      </span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="text-[18px] font-bold tracking-tight text-primary">
                        CNY {totalBalance.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground/60 font-medium">
                      <span>{translate(locale, "agent.availableBalance")}</span>
                      <span className={cn("text-[9px]", accountStatusClass)}>
                        {translate(locale, "agent.status")}: {accountStatusLabel}
                      </span>
                    </div>
                  </div>

                  <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${balancePercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="flex flex-col border-l border-border/20 pl-2">
                      <span className="text-[9px] text-muted-foreground/40 uppercase">
                        {translate(locale, "agent.recharge")}
                      </span>
                      <span className="text-[11px] font-mono">CNY {chargeBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col border-l border-border/20 pl-2">
                      <span className="text-[9px] text-muted-foreground/40 uppercase">
                        {translate(locale, "agent.freezeBalance")}
                      </span>
                      <span className="text-[11px] font-mono">
                        CNY {freezeBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <footer className="mt-4 pt-3 border-t border-border/10 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/30 italic">
                    {translate(locale, "agent.poweredBy")}
                  </span>
                  <Coins size={10} className="text-primary/20" />
                </footer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
