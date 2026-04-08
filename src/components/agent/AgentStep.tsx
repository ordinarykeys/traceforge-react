import * as React from "react";
import { ChevronDown, Terminal, CheckCircle2, CircleDashed, AlertCircle, Loader2, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import type { AgentToolRenderData } from "@/lib/agent/QueryEngine";

interface AgentStepProps {
  title: string;
  status: "pending" | "running" | "completed" | "rejected" | "error";
  logs?: string[];
  isExpanded?: boolean;
  toolRender?: AgentToolRenderData;
  previousCallArguments?: string;
  children?: React.ReactNode;
}

type DiffKind = "added" | "removed" | "modified";

interface ParamDiffEntry {
  path: string;
  kind: DiffKind;
  before?: string;
  after?: string;
}

const NOISE_FIELD_KEYS = new Set([
  "timestamp",
  "time",
  "ts",
  "nonce",
  "traceid",
  "trace_id",
  "requestid",
  "request_id",
  "correlationid",
  "correlation_id",
  "spanid",
  "span_id",
  "createdat",
  "created_at",
  "updatedat",
  "updated_at",
  "generatedat",
  "generated_at",
  "expiresat",
  "expires_at",
]);

const SHARED_STEP_DURATION_TICK_MS = 1_000;
let sharedStepClockNow = Date.now();
let sharedStepClockTimer: number | null = null;
const sharedStepClockListeners = new Set<() => void>();

function startSharedStepClock() {
  if (sharedStepClockTimer !== null || typeof window === "undefined") return;
  sharedStepClockTimer = window.setInterval(() => {
    sharedStepClockNow = Date.now();
    for (const listener of sharedStepClockListeners) {
      listener();
    }
  }, SHARED_STEP_DURATION_TICK_MS);
}

function stopSharedStepClockIfIdle() {
  if (sharedStepClockListeners.size > 0 || sharedStepClockTimer === null || typeof window === "undefined") return;
  window.clearInterval(sharedStepClockTimer);
  sharedStepClockTimer = null;
}

function subscribeSharedStepClock(listener: () => void) {
  sharedStepClockListeners.add(listener);
  startSharedStepClock();
  return () => {
    sharedStepClockListeners.delete(listener);
    stopSharedStepClockIfIdle();
  };
}

function getSharedStepClockSnapshot() {
  return sharedStepClockNow;
}

function useSharedStepClock(enabled: boolean) {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    if (!enabled) {
      return () => undefined;
    }
    return subscribeSharedStepClock(onStoreChange);
  }, [enabled]);

  const getSnapshot = React.useCallback(() => {
    return enabled ? getSharedStepClockSnapshot() : 0;
  }, [enabled]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function normalizePathSegment(segment: string): string {
  return segment.replace(/\[\d+\]/g, "").replace(/\s+/g, "").toLowerCase();
}

function isNoiseDiffPath(path: string): boolean {
  const cleaned = path.replace(/^\$\./, "");
  const segments = cleaned
    .split(".")
    .map(normalizePathSegment)
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return false;
  return segments.some((segment) => NOISE_FIELD_KEYS.has(segment));
}

function stringifyForDiff(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return JSON.stringify(value);
}

function flattenParamMap(value: unknown, basePath = "$", out = new Map<string, string>()) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(basePath, "[]");
      return out;
    }
    value.forEach((item, index) => {
      flattenParamMap(item, `${basePath}[${index}]`, out);
    });
    return out;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.set(basePath, "{}");
      return out;
    }
    for (const [key, nested] of entries) {
      flattenParamMap(nested, `${basePath}.${key}`, out);
    }
    return out;
  }

  out.set(basePath, stringifyForDiff(value));
  return out;
}

function buildParamDiffEntries(previousValue: unknown, currentValue: unknown): ParamDiffEntry[] {
  const previousMap = flattenParamMap(previousValue);
  const currentMap = flattenParamMap(currentValue);
  const allPaths = new Set([...previousMap.keys(), ...currentMap.keys()]);
  const entries: ParamDiffEntry[] = [];

  [...allPaths]
    .sort((a, b) => a.localeCompare(b))
    .forEach((path) => {
      const before = previousMap.get(path);
      const after = currentMap.get(path);
      if (before === after) return;
      if (before === undefined) {
        entries.push({ path, kind: "added", after });
        return;
      }
      if (after === undefined) {
        entries.push({ path, kind: "removed", before });
        return;
      }
      entries.push({ path, kind: "modified", before, after });
    });

  return entries;
}

function parseCallArguments(raw: string): { text: string; isJson: boolean; value: unknown } {
  try {
    const parsed = JSON.parse(raw);
    return {
      text: JSON.stringify(parsed, null, 2),
      isJson: true,
      value: parsed,
    };
  } catch {
    return {
      text: raw,
      isJson: false,
      value: null,
    };
  }
}

function getLogsRenderSignature(logs: string[] | undefined): string {
  if (!logs || logs.length === 0) return "0";
  const first = logs[0] ?? "";
  const last = logs[logs.length - 1] ?? "";
  return `${logs.length}:${first.slice(0, 24)}:${last.slice(-24)}`;
}

function areToolRenderEqual(left?: AgentToolRenderData, right?: AgentToolRenderData): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.toolName === right.toolName &&
    left.argsSummary === right.argsSummary &&
    left.callArguments === right.callArguments &&
    left.outcome === right.outcome &&
    left.outcomePreview === right.outcomePreview
  );
}

function AgentStepImpl({
  title,
  status,
  logs = [],
  isExpanded: initialExpanded,
  toolRender,
  previousCallArguments,
  children,
}: AgentStepProps) {
  const { locale } = useLocaleStore();
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded ?? false);
  const [isArgsExpanded, setIsArgsExpanded] = React.useState(false);
  const [paramsViewMode, setParamsViewMode] = React.useState<"raw" | "diff">("raw");
  const [paramsSearchTerm, setParamsSearchTerm] = React.useState("");
  const [includeNoiseFields, setIncludeNoiseFields] = React.useState(false);
  const [copyState, setCopyState] = React.useState<"idle" | "success" | "error">("idle");
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = React.useRef(true);
  const [completedDuration, setCompletedDuration] = React.useState<number>(0);
  const startTimeRef = React.useRef<number | null>(null);
  const copyTimerRef = React.useRef<number | null>(null);
  const sharedClock = useSharedStepClock(status === "running");

  React.useEffect(() => {
    if (status === "running") {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      return;
    }
    if (status === "completed" || status === "rejected" || status === "error") {
      if (startTimeRef.current) {
        setCompletedDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
      return;
    }
    startTimeRef.current = null;
    setCompletedDuration(0);
  }, [status]);

  const duration = React.useMemo(() => {
    if (status === "running") {
      if (!startTimeRef.current) return 0;
      const now = sharedClock || Date.now();
      return Math.max(0, Math.floor((now - startTimeRef.current) / 1000));
    }
    return completedDuration;
  }, [status, sharedClock, completedDuration]);

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
  }, [logs.length, logs[0], logs[logs.length - 1]]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "rejected":
        return <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />;
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
      case "rejected": return "border-amber-500/30";
      case "error": return "border-destructive/30";
      default: return "border-border/40";
    }
  };

  const formatDuration = (secs: number) => {
    if (secs < 1) return "";
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m${secs % 60}s`;
  };

  React.useEffect(() => {
    setIsArgsExpanded(false);
    setParamsViewMode("raw");
    setParamsSearchTerm("");
    setIncludeNoiseFields(false);
    setCopyState("idle");
  }, [toolRender?.callArguments, toolRender?.toolName]);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const rawCallArguments = React.useMemo(
    () => toolRender?.callArguments?.trim() ?? "",
    [toolRender?.callArguments],
  );
  const hasCallArguments = rawCallArguments.length > 0;
  const shouldResolveParams = isArgsExpanded && hasCallArguments;
  const shouldResolveDiff = shouldResolveParams && paramsViewMode === "diff";

  const parsedCallArguments = React.useMemo(() => {
    if (!shouldResolveParams) return null;
    return parseCallArguments(rawCallArguments);
  }, [shouldResolveParams, rawCallArguments]);

  const parsedPreviousCallArguments = React.useMemo(() => {
    if (!shouldResolveDiff) return null;
    const raw = previousCallArguments?.trim();
    if (!raw) return null;
    return parseCallArguments(raw);
  }, [shouldResolveDiff, previousCallArguments]);

  const canShowDiff = Boolean(
    shouldResolveDiff && parsedCallArguments?.isJson && parsedPreviousCallArguments?.isJson,
  );

  const diffEntries = React.useMemo(() => {
    if (!shouldResolveDiff || !canShowDiff || !parsedCallArguments || !parsedPreviousCallArguments) return [];
    return buildParamDiffEntries(parsedPreviousCallArguments.value, parsedCallArguments.value);
  }, [shouldResolveDiff, canShowDiff, parsedCallArguments, parsedPreviousCallArguments]);

  const noiseDiffEntries = React.useMemo(
    () => diffEntries.filter((entry) => isNoiseDiffPath(entry.path)),
    [diffEntries],
  );

  const visibleDiffEntries = React.useMemo(() => {
    if (includeNoiseFields) return diffEntries;
    return diffEntries.filter((entry) => !isNoiseDiffPath(entry.path));
  }, [diffEntries, includeNoiseFields]);

  const normalizedSearchTerm = paramsSearchTerm.trim().toLowerCase();

  const filteredRawText = React.useMemo(() => {
    if (!shouldResolveParams || !parsedCallArguments) return "";
    if (!normalizedSearchTerm) return parsedCallArguments.text;
    const lines = parsedCallArguments.text
      .split("\n")
      .filter((line) => line.toLowerCase().includes(normalizedSearchTerm));
    return lines.join("\n");
  }, [shouldResolveParams, normalizedSearchTerm, parsedCallArguments]);

  const filteredDiffEntries = React.useMemo(() => {
    if (!normalizedSearchTerm) return visibleDiffEntries;
    return visibleDiffEntries.filter((entry) => {
      const haystack = `${entry.path} ${entry.before ?? ""} ${entry.after ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearchTerm);
    });
  }, [visibleDiffEntries, normalizedSearchTerm]);

  const outcomeLabel =
    toolRender?.outcome === "error"
      ? translate(locale, "agent.toolState.error")
      : toolRender?.outcome === "rejected"
        ? translate(locale, "agent.toolState.rejected")
        : toolRender?.outcome === "result"
          ? translate(locale, "agent.toolState.result")
          : null;

  const outcomeClass =
    toolRender?.outcome === "error"
      ? "border-destructive/30 text-destructive bg-destructive/5"
      : toolRender?.outcome === "rejected"
        ? "border-amber-500/30 text-amber-600 bg-amber-500/5"
        : "border-green-500/30 text-green-600 bg-green-500/5";

  const copyStatusLabel =
    copyState === "success"
      ? translate(locale, "agent.toolState.copied")
      : copyState === "error"
        ? translate(locale, "agent.toolState.copyFailed")
        : null;

  const handleCopyArgs = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!hasCallArguments) return;
    const copyText = parseCallArguments(rawCallArguments).text;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
    }, 1400);
  };

  const diffKindLabel = (kind: DiffKind) => {
    if (kind === "added") return translate(locale, "agent.toolState.diffAdded");
    if (kind === "removed") return translate(locale, "agent.toolState.diffRemoved");
    return translate(locale, "agent.toolState.diffModified");
  };

  return (
    <div className={cn(
      "group/step my-3 flex flex-col border-l-2 pl-4 transition-all duration-300",
      getStatusColor(),
      status === "running" && "border-l-primary/60"
    )}>
      {/* Step header - clickable */}
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
            {toolRender && (
              <div className="border-b border-border/20 px-3 py-2 space-y-2">
                <div className="rounded-md border border-border/40 bg-background/60 px-2.5 py-2">
                  <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">
                    {translate(locale, "agent.toolState.call")}
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-foreground/85 break-all">
                    {toolRender.toolName}({toolRender.argsSummary})
                  </div>
                  {hasCallArguments && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsArgsExpanded((prev) => !prev);
                          }}
                          className="rounded border border-border/50 bg-background/70 px-2 py-1 text-[9px] font-mono uppercase tracking-wide text-muted-foreground/80 transition-colors hover:bg-muted"
                        >
                          {isArgsExpanded
                            ? translate(locale, "agent.toolState.collapseParams")
                            : translate(locale, "agent.toolState.expandParams")}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyArgs}
                          className="rounded border border-border/50 bg-background/70 px-2 py-1 text-[9px] font-mono uppercase tracking-wide text-muted-foreground/80 transition-colors hover:bg-muted"
                        >
                          {translate(locale, "agent.toolState.copyParams")}
                        </button>
                        {copyStatusLabel && (
                          <span
                            className={cn(
                              "text-[9px] font-mono",
                              copyState === "success" ? "text-green-600" : "text-destructive",
                            )}
                          >
                            {copyStatusLabel}
                          </span>
                        )}
                      </div>
                      {isArgsExpanded && (
                        <div className="mt-2 rounded-md border border-border/40 bg-background/70 px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setParamsViewMode("raw");
                              }}
                              className={cn(
                                "rounded border px-2 py-1 text-[9px] font-mono uppercase tracking-wide transition-colors",
                                paramsViewMode === "raw"
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border/50 bg-background/70 text-muted-foreground/80 hover:bg-muted",
                              )}
                            >
                              {translate(locale, "agent.toolState.viewRaw")}
                            </button>
                            <button
                              type="button"
                              disabled={!canShowDiff}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canShowDiff) setParamsViewMode("diff");
                              }}
                              className={cn(
                                "rounded border px-2 py-1 text-[9px] font-mono uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                paramsViewMode === "diff"
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border/50 bg-background/70 text-muted-foreground/80 hover:bg-muted",
                              )}
                            >
                              {translate(locale, "agent.toolState.viewDiff")}
                            </button>
                            <button
                              type="button"
                              disabled={!canShowDiff}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canShowDiff) {
                                  setIncludeNoiseFields((prev) => !prev);
                                }
                              }}
                              className={cn(
                                "rounded border px-2 py-1 text-[9px] font-mono uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                includeNoiseFields
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                                  : "border-border/50 bg-background/70 text-muted-foreground/80 hover:bg-muted",
                              )}
                            >
                              {includeNoiseFields
                                ? translate(locale, "agent.toolState.hideNoiseFields")
                                : translate(locale, "agent.toolState.showNoiseFields")}
                            </button>
                            <input
                              type="text"
                              value={paramsSearchTerm}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setParamsSearchTerm(event.target.value)}
                              placeholder={translate(locale, "agent.toolState.searchParams")}
                              className="h-7 min-w-[180px] rounded border border-border/50 bg-background/70 px-2 text-[10px] font-mono text-foreground/85 outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
                            />
                          </div>
                          {paramsViewMode === "raw" && (
                            <>
                              <div className="mt-2 text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">
                                {translate(locale, "agent.toolState.params")}
                              </div>
                              {filteredRawText ? (
                                <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] font-mono leading-relaxed text-foreground/85">
                                  {filteredRawText}
                                </pre>
                              ) : (
                                <div className="mt-1 text-[9px] font-mono text-muted-foreground/75">
                                  {translate(locale, "agent.toolState.noSearchResult")}
                                </div>
                              )}
                              {parsedCallArguments && !parsedCallArguments.isJson && (
                                <div className="mt-1 text-[9px] font-mono text-amber-600/90">
                                  {translate(locale, "agent.toolState.paramsInvalid")}
                                </div>
                              )}
                            </>
                          )}
                          {paramsViewMode === "diff" && (
                            <>
                              {!includeNoiseFields && noiseDiffEntries.length > 0 && (
                                <div className="mt-2 text-[9px] font-mono text-amber-600/90">
                                  {translate(locale, "agent.toolState.noiseHidden", {
                                    count: noiseDiffEntries.length,
                                  })}
                                </div>
                              )}
                              {!canShowDiff ? (
                                <div className="mt-2 text-[9px] font-mono text-muted-foreground/75">
                                  {translate(locale, "agent.toolState.noDiffBaseline")}
                                </div>
                              ) : filteredDiffEntries.length === 0 ? (
                                <div className="mt-2 text-[9px] font-mono text-muted-foreground/75">
                                  {visibleDiffEntries.length === 0 && diffEntries.length > 0 && !includeNoiseFields
                                    ? translate(locale, "agent.toolState.noiseOnlyChanges")
                                    : diffEntries.length === 0
                                      ? translate(locale, "agent.toolState.noDiffChanges")
                                      : translate(locale, "agent.toolState.noSearchResult")}
                                </div>
                              ) : (
                                <div className="mt-2 space-y-2">
                                  {filteredDiffEntries.map((entry) => (
                                    <div key={`${entry.path}-${entry.kind}`} className="rounded border border-border/40 bg-background/80 p-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-mono text-foreground/90 break-all">{entry.path}</span>
                                        <span
                                          className={cn(
                                            "rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide",
                                            entry.kind === "added"
                                              ? "border-green-500/40 text-green-600 bg-green-500/10"
                                              : entry.kind === "removed"
                                                ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
                                                : "border-primary/40 text-primary bg-primary/10",
                                          )}
                                        >
                                          {diffKindLabel(entry.kind)}
                                        </span>
                                      </div>
                                      {(entry.before ?? "").length > 0 && (
                                        <div className="mt-1 text-[9px] font-mono text-muted-foreground/80 break-all">
                                          {translate(locale, "agent.toolState.before")}: {entry.before}
                                        </div>
                                      )}
                                      {(entry.after ?? "").length > 0 && (
                                        <div className="mt-1 text-[9px] font-mono text-foreground/85 break-all">
                                          {translate(locale, "agent.toolState.after")}: {entry.after}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {outcomeLabel && toolRender.outcomePreview && (
                  <div className={cn("rounded-md border px-2.5 py-2", outcomeClass)}>
                    <div className="text-[8px] font-mono uppercase tracking-widest opacity-80">
                      {outcomeLabel}
                    </div>
                    <div className="mt-1 text-[11px] font-mono break-all opacity-90">
                      {toolRender.outcomePreview}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Log header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-muted/20">
              <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/40">
                {status === "running"
                  ? translate(locale, "agent.toolState.live")
                  : translate(locale, "agent.toolState.rawLogs")}
              </span>
              {status === "running" && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[8px] font-mono text-green-500/60 uppercase">
                    {translate(locale, "agent.toolState.streaming")}
                  </span>
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
                  {status === "running"
                    ? translate(locale, "agent.step.waitingOutput")
                    : translate(locale, "agent.step.noOutputLogs")}
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
                                log.startsWith("[Permission]") ? "text-amber-500/80" :
                                  log.startsWith("[Error]") || log.startsWith("[stderr]") ? "text-red-400/70" :
                                    log.includes("\u2713") || log.includes("success") ? "text-green-500/60" :
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

export const AgentStep = React.memo(
  AgentStepImpl,
  (prev, next) =>
    prev.title === next.title &&
    prev.status === next.status &&
    prev.isExpanded === next.isExpanded &&
    prev.previousCallArguments === next.previousCallArguments &&
    prev.children === next.children &&
    getLogsRenderSignature(prev.logs) === getLogsRenderSignature(next.logs) &&
    areToolRenderEqual(prev.toolRender, next.toolRender),
);

