import * as React from "react";
import { ChevronDown, Terminal, CheckCircle2, CircleDashed, AlertCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStepProps {
  title: string;
  status: "pending" | "running" | "completed" | "error";
  logs?: string[];
  isExpanded?: boolean;
  children?: React.ReactNode;
}

export function AgentStep({ title, status, logs = [], isExpanded: initialExpanded, children }: AgentStepProps) {
  const [userToggled, setUserToggled] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded ?? false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = React.useRef(true);
  const prevStatusRef = React.useRef(status);
  const [duration, setDuration] = React.useState<number>(0);
  const startTimeRef = React.useRef<number | null>(null);

  // Auto-expand when running, auto-collapse when completed (unless user manually toggled)
  React.useEffect(() => {
    if (userToggled) return;

    if (status === "running") {
      setIsExpanded(true);
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
    } else if (prevStatusRef.current === "running" && (status === "completed" || status === "error")) {
      // Auto-collapse after a brief delay so user can see the final output
      const timer = setTimeout(() => {
        if (!userToggled) {
          setIsExpanded(false);
        }
      }, 800);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = status;
  }, [status, userToggled]);

  // Duration timer
  React.useEffect(() => {
    if (status === "running") {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (status === "completed" || status === "error") {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }
  }, [status]);

  // Smart Auto-scroll: Only scroll if user is near the bottom
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (isExpanded && status === "running" && container && isUserAtBottomRef.current) {
      // scroll to bottom without affecting window/parent
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [logs.length, isExpanded, status]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isUserAtBottomRef.current = distanceFromBottom < 30; // 30px threshold
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      isUserAtBottomRef.current = false; // scrolling up pauses auto-scroll
    }
  };

  const diffStats = React.useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const log of logs) {
      // Remove any [source] prefix from the log if it exists to accurately match diff strings
      const trimmed = log.replace(/^\[.*?\]\s*/, "");
      if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) additions++;
      else if (trimmed.startsWith("-") && !trimmed.startsWith("---")) deletions++;
    }
    return { additions, deletions };
  }, [logs]);

  const handleToggle = () => {
    setUserToggled(true);
    setIsExpanded(!isExpanded);
  };

  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground/40" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "running": return "border-primary/40";
      case "completed": return "border-green-500/20";
      case "error": return "border-destructive/30";
      default: return "border-border/40";
    }
  };

  const formatDuration = (secs: number) => {
    if (secs < 1) return "";
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m${secs % 60}s`;
  };

  return (
    <div className={cn(
      "group/step my-3 flex flex-col border-l-2 pl-4 transition-all duration-300",
      getStatusColor(),
      status === "running" && "border-l-primary/60"
    )}>
      {/* Step header — clickable */}
      <div 
        className="flex cursor-pointer items-center gap-3 py-1.5 transition-opacity hover:opacity-80 select-none"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-center shrink-0">
          {getStatusIcon()}
        </div>
        
        <span className={cn(
          "text-[12px] font-medium tracking-tight transition-colors font-sans flex-1 min-w-0",
          status === "running" ? "text-primary" : "text-muted-foreground group-hover/step:text-foreground/80"
        )}>
          <span className="truncate block">{title}</span>
        </span>

        {/* Duration badge */}
        {duration > 0 && (
          <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/40 shrink-0">
            <Clock size={9} />
            {formatDuration(duration)}
          </div>
        )}

        {/* Log count badge */}
        {logs.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-0.5 text-[9px] font-mono text-muted-foreground/60 transition-colors group-hover/step:bg-muted group-hover/step:text-muted-foreground shrink-0">
            <Terminal size={10} />
            {logs.length}
          </div>
        )}

        {/* Diff stats badge */}
        {(diffStats.additions > 0 || diffStats.deletions > 0) && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-tight shrink-0 border border-border/30 px-1.5 py-[1px] rounded bg-muted/20">
            {diffStats.additions > 0 && <span className="text-emerald-500/80">+{diffStats.additions}</span>}
            {(diffStats.additions > 0 && diffStats.deletions > 0) && <span className="text-muted-foreground/20 w-[1px] h-3 bg-border" />}
            {diffStats.deletions > 0 && <span className="text-rose-500/80">-{diffStats.deletions}</span>}
          </div>
        )}

        <ChevronDown 
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground/30 transition-transform duration-300 shrink-0",
            isExpanded && "rotate-180"
          )} 
        />
      </div>

      {/* Collapsible log panel */}
      <div className={cn(
        "grid transition-all duration-300 ease-in-out",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden">
          <div className={cn(
            "rounded-lg border bg-muted/10 mt-1 mb-2 transition-all duration-300",
            status === "running" ? "border-primary/20" : "border-border/50"
          )}>
            {/* Log header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-muted/20">
              <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/40">
                {status === "running" ? "LIVE OUTPUT" : "OUTPUT LOG"}
              </span>
              {status === "running" && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[8px] font-mono text-green-500/60 uppercase">streaming</span>
                </div>
              )}
            </div>

            {/* Scrollable log content */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              onWheel={handleWheel}
              className={cn(
                "overflow-y-auto overflow-x-hidden px-4 py-3 font-mono text-[11px] leading-relaxed scrollbar-thin",
                "scrollbar-thumb-border/30 scrollbar-track-transparent hover:scrollbar-thumb-border/50"
              )}
              style={{ maxHeight: status === "running" ? "350px" : "200px" }}
            >
              {logs.length === 0 && !children ? (
                <div className="italic text-muted-foreground/30 text-[10px]">
                  {status === "running" ? "等待输出..." : "无输出日志"}
                </div>
              ) : (
                <>
                  {logs.map((log, i) => {
                    const trimmed = log.replace(/^\[.*?\]\s*/, "");
                    const isAddition = trimmed.startsWith("+") && !trimmed.startsWith("+++");
                    const isDeletion = trimmed.startsWith("-") && !trimmed.startsWith("---");

                    return (
                      <div key={i} className="flex gap-2 py-[2px] hover:bg-muted/20 rounded-sm transition-colors">
                        <span className="text-muted-foreground/15 select-none shrink-0 w-5 text-right text-[10px]">
                          {(i + 1).toString().padStart(2, "0")}
                        </span>
                        <span className={cn(
                          "whitespace-pre-wrap break-all",
                          isAddition ? "text-emerald-500/80" :
                          isDeletion ? "text-rose-500/80" :
                          log.startsWith("[Result]") ? "text-green-500/70" :
                          log.startsWith("[Error]") || log.startsWith("[stderr]") ? "text-red-400/70" :
                          log.includes("✓") || log.includes("success") ? "text-green-500/60" :
                          "text-muted-foreground/70"
                        )}>
                          {log}
                        </span>
                      </div>
                    );
                  })}
                  {children}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
