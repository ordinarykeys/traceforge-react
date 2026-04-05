import { memo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AgentStep } from "@/components/agent/AgentStep";
import MarkdownBlock from "@/components/ui/MarkdownBlock";
import { useThemeStore } from "@/hooks/useThemeStore";
import type { AgentMessage } from "@/lib/agent/QueryEngine";

interface AgentMessageItemProps {
  message: AgentMessage;
  contentSnapshot: string;
  statusSnapshot: string;
  stepsSnapshot: string;
}

function AgentMessageItemImpl({ message }: AgentMessageItemProps) {
  const { uiFontSize } = useThemeStore();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-bold tracking-tight",
              message.role === "user" ? "text-muted-foreground/60" : "text-primary",
            )}
            style={{ fontSize: `${uiFontSize - 1}px` }}
          >
            {message.role === "user" ? "任务指令" : "分析助手"}
          </span>
          {message.role === "assistant" && (
            <span className="text-[10px] text-muted-foreground/30 font-mono tracking-tighter">
              Agent::Analytical
            </span>
          )}
          {message.status === "error" && (
            <Badge variant="destructive" className="h-4 text-[8px] px-1">
              执行异常
            </Badge>
          )}
        </div>

        {message.role === "assistant" && message.steps && message.steps.length > 0 && (
          <div className="flex flex-col -space-y-2 pb-2">
            {message.steps.map((step) => (
              <AgentStep key={step.id} title={step.title} status={step.status} logs={step.logs} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "font-sans transition-colors",
            message.role === "assistant"
              ? "text-foreground/90 font-medium"
              : "text-muted-foreground/90 pl-1 border-l border-border/50",
          )}
          style={{ fontSize: `${uiFontSize + 1.5}px` }}
        >
          <MarkdownBlock content={message.content} isStreaming={message.status === "running"} />
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
    prev.stepsSnapshot === next.stepsSnapshot,
);
