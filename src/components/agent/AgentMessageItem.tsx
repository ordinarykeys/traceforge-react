import { Suspense, lazy, memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AgentStep } from "@/components/agent/AgentStep";
import { useThemeStore } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import type { AgentMessage } from "@/lib/agent/QueryEngine";

const LazyMarkdownBlock = lazy(() => import("@/components/ui/MarkdownBlock"));
const RICH_MARKDOWN_HINT_RE =
  /```|`[^`\n]+`|(^|\n)\s*#{1,6}\s|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|(^|\n)\s*>\s|\[[^\]]+\]\([^)]+\)|(^|\n)\s*\|.+\|/m;
const STREAMING_MARKDOWN_PLAIN_THRESHOLD_CHARS = 1_600;

function shouldUseMarkdownRenderer(content: string): boolean {
  if (!content) {
    return false;
  }
  if (content.length > 1200) {
    return true;
  }
  return RICH_MARKDOWN_HINT_RE.test(content);
}

interface AgentMessageItemProps {
  message: AgentMessage;
  contentSnapshot: string;
  statusSnapshot: string;
  stepsSnapshot: string;
  previousCallArgsByTool?: Record<string, string>;
  previousArgsSnapshot?: string;
}

function AgentMessageItemImpl({ message, previousCallArgsByTool }: AgentMessageItemProps) {
  const { uiFontSize } = useThemeStore();
  const { locale } = useLocaleStore();
  const previousCallArgumentsByTool = useMemo(
    () => new Map<string, string>(Object.entries(previousCallArgsByTool ?? {})),
    [previousCallArgsByTool],
  );
  const isUser = message.role === "user";
  const messageFontSize = isUser ? uiFontSize + 1.5 : uiFontSize + 0.5;
  const useMarkdownRenderer = useMemo(
    () => shouldUseMarkdownRenderer(message.content),
    [message.content],
  );
  const isStreamingAssistant = !isUser && message.status === "running";
  const shouldUseMarkdownBlock = useMemo(() => {
    if (!useMarkdownRenderer) return false;
    if (!isStreamingAssistant) return true;
    return message.content.length <= STREAMING_MARKDOWN_PLAIN_THRESHOLD_CHARS;
  }, [useMarkdownRenderer, isStreamingAssistant, message.content.length]);
  const roleLabel = useMemo(
    () => (isUser ? translate(locale, "agent.taskInstruction") : translate(locale, "agent.assistant")),
    [isUser, locale],
  );

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-3 duration-500 flex",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div className="flex w-full max-w-[92%] flex-col space-y-3">
        <div className={cn("flex items-center gap-2", isUser ? "justify-end" : "justify-start")}>
          <span
            className={cn(
              "font-medium",
              isUser ? "text-muted-foreground/80" : "text-foreground/85",
            )}
            style={{ fontSize: `${uiFontSize - 1}px` }}
          >
            {roleLabel}
          </span>
          {message.status === "rejected" && (
            <Badge variant="outline" className="h-4 text-[8px] px-1 border-amber-500/40 text-amber-600">
              {translate(locale, "agent.rejected")}
            </Badge>
          )}
          {message.status === "error" && (
            <Badge variant="destructive" className="h-4 text-[8px] px-1">
              {translate(locale, "agent.error")}
            </Badge>
          )}
        </div>

        {!isUser && message.steps && message.steps.length > 0 && (
          <div className="flex flex-col -space-y-2 pb-2">
            {message.steps.map((step) => {
              const toolName = step.toolRender?.toolName;
              const previousCallArguments = toolName ? previousCallArgumentsByTool.get(toolName) : undefined;
              if (toolName && step.toolRender?.callArguments) {
                previousCallArgumentsByTool.set(toolName, step.toolRender.callArguments);
              }
              return (
                <AgentStep
                  key={step.id}
                  title={step.title}
                  status={step.status}
                  logs={step.logs}
                  toolRender={step.toolRender}
                  previousCallArguments={previousCallArguments}
                />
              );
            })}
          </div>
        )}

        <div
          className={cn(
            "font-sans transition-colors",
            !isUser
              ? "text-foreground/90 font-normal"
              : "ml-auto rounded-2xl border border-border/50 bg-muted/55 px-4 py-3 text-foreground/85 font-normal shadow-sm",
          )}
          style={{ fontSize: `${messageFontSize}px` }}
        >
          {shouldUseMarkdownBlock ? (
            <Suspense
              fallback={<div className="whitespace-pre-wrap break-words">{message.content}</div>}
            >
              <LazyMarkdownBlock
                content={message.content}
                isStreaming={message.status === "running"}
              />
            </Suspense>
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export const AgentMessageItem = memo(
  AgentMessageItemImpl,
  (prev, next) =>
    prev.contentSnapshot === next.contentSnapshot &&
    prev.statusSnapshot === next.statusSnapshot &&
    prev.stepsSnapshot === next.stepsSnapshot &&
    prev.previousArgsSnapshot === next.previousArgsSnapshot,
);
