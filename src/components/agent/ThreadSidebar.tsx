import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { translate, type AppLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { threadService } from "@/lib/agent/ThreadService";
import type { ThreadMetadata } from "@/lib/agent/ThreadService";

interface ThreadSidebarProps {
  threads: ThreadMetadata[];
  currentThreadId: string | null;
  selectedWorkspacePath?: string;
  editingId: string | null;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onSelectWorkspace?: (workingDir: string) => void;
  onNewThread: (workingDir?: string) => void;
  onLoadThread: (id: string) => void;
  onStartRename: (thread: ThreadMetadata) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onDeleteThread: (id: string) => void;
  onInvestigateThread?: (thread: ThreadMetadata) => void;
  onRunDiagnosisThread?: (thread: ThreadMetadata) => void;
}

interface WorkspaceGroup {
  key: string;
  name: string;
  path?: string;
  threads: ThreadMetadata[];
  lastActive: number;
  riskScore: number;
  highRiskCount: number;
}

type WorkspaceSortMode = "recent" | "risk";
type ThreadRiskFilterMode = "all" | "high";

interface ThreadRiskInfo {
  score: number;
  severity: "normal" | "medium" | "high";
  suppressionRatioPct: number;
  fallbackSuppressed: number;
  fallbackUsed: number;
  retryEventCount: number;
  permissionHighRisk: number;
  permissionCritical: number;
  permissionHardToReverse: number;
  permissionShared: number;
  diagnosisStatus?: string | null;
  diagnosisHistoryCount: number;
  reason?: string | null;
  strategy?: string | null;
}

function getDiagnosisKindLabel(locale: AppLocale, kind: string | null | undefined): string {
  if (!kind) return "-";
  switch (kind) {
    case "summary":
      return translate(locale, "agent.trace.hotspotRunSummary");
    case "hotspots":
      return translate(locale, "agent.trace.hotspotRunHotspots");
    case "queue_diagnostics":
      return translate(locale, "agent.trace.hotspotRunQueueDiagnostics");
    case "investigate":
      return translate(locale, "agent.trace.hotspotInvestigate");
    case "fallback_investigate":
      return translate(locale, "agent.diff.diagnosisFallbackRun");
    default:
      return kind;
  }
}

function getDiagnosisStatusLabel(locale: AppLocale, status: string | null | undefined): string {
  if (!status) return "-";
  if (status === "queue_full") {
    return translate(locale, "agent.sidebarDiagnosisQueueFull");
  }
  const key = `agent.trace.commandStatus.${status}`;
  const resolved = translate(locale, key);
  return resolved === key ? status : resolved;
}

function getDiagnosisStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "queued":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300";
    case "started":
      return "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300";
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "failed":
    case "aborted":
    case "queue_full":
      return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300";
    case "prepared":
      return "border-border/40 bg-muted/40 text-muted-foreground/85";
    default:
      return "border-border/40 bg-muted/30 text-muted-foreground/80";
  }
}

interface SpotlightThreadItem {
  thread: ThreadMetadata;
  workspaceName: string;
  risk: ThreadRiskInfo;
}

const WORKSPACE_STORAGE_KEY = "traceforge.agent.workspace.list.v1";
const WORKSPACE_ALIAS_STORAGE_KEY = "traceforge.agent.workspace.aliases.v1";
const ARCHIVED_THREAD_IDS_STORAGE_KEY = "traceforge.agent.archived.thread.ids.v1";
const HIDDEN_WORKSPACE_KEYS_STORAGE_KEY = "traceforge.agent.hidden.workspace.keys.v1";
const WORKSPACE_SORT_MODE_STORAGE_KEY = "traceforge.agent.workspace.sort.mode.v1";
const THREAD_RISK_FILTER_STORAGE_KEY = "traceforge.agent.thread.risk.filter.v1";
const MAX_THREAD_DISPLAY_CHARS = 10;
const SHOW_SIDEBAR_RISK_INSIGHTS = false;
const EMPTY_THREAD_RISK_INFO: ThreadRiskInfo = {
  score: 0,
  severity: "normal",
  suppressionRatioPct: 0,
  fallbackSuppressed: 0,
  fallbackUsed: 0,
  retryEventCount: 0,
  permissionHighRisk: 0,
  permissionCritical: 0,
  permissionHardToReverse: 0,
  permissionShared: 0,
  diagnosisStatus: null,
  diagnosisHistoryCount: 0,
  reason: null,
  strategy: null,
};

function normalizeWorkspacePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, "");
}

function getWorkspaceName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function dedupePaths(paths: string[]): string[] {
  const unique = new Set<string>();
  for (const path of paths) {
    const normalized = normalizeWorkspacePath(path);
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

function ellipsizeLabel(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return text;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function toPositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  return 0;
}

function getThreadRiskInfo(thread: ThreadMetadata): ThreadRiskInfo {
  const retry = thread.diagnostics?.retry;
  const fallbackSuppressed = toPositiveNumber(retry?.fallback_suppressed);
  const fallbackUsed = toPositiveNumber(retry?.fallback_used);
  const retryEventCount = toPositiveNumber(retry?.retry_event_count);
  const suppressionRatioPct = Math.min(100, Math.round(toPositiveNumber(retry?.suppression_ratio_pct)));
  const reason = retry?.last_suppressed_reason ?? null;
  const strategy = retry?.last_retry_strategy ?? null;
  const permission = thread.diagnostics?.permission;
  const permissionCritical = toPositiveNumber(permission?.risk?.critical);
  const permissionHighRisk = toPositiveNumber(permission?.risk?.high_risk);
  const permissionHardToReverse = toPositiveNumber(permission?.profile?.hard_to_reverse);
  const permissionShared = toPositiveNumber(permission?.profile?.shared);
  const diagnosisStatus = thread.diagnostics?.diagnosis_activity?.status ?? null;
  const diagnosisHistoryCount = Array.isArray(thread.diagnostics?.diagnosis_history)
    ? thread.diagnostics?.diagnosis_history?.length ?? 0
    : 0;

  let score = 0;
  if (fallbackSuppressed > 0) score += 1;
  if (suppressionRatioPct >= 50) score += 2;
  if (suppressionRatioPct >= 75) score += 1;
  if (fallbackSuppressed >= 3) score += 2;
  if (retryEventCount >= 4) score += 1;
  if (retryEventCount >= 8) score += 1;
  if (reason === "retry_strategy" || reason === "already_retried") score += 1;
  if (reason === "gate_disabled" || reason === "fallback_missing" || reason === "same_model") score += 1;
  if (permissionHighRisk > 0) score += 1;
  if (permissionCritical > 0) score += 2;
  if (permissionHardToReverse > 0) score += 1;
  if (permissionShared > 0) score += 1;
  if (diagnosisStatus === "queue_full") score += 2;
  if (diagnosisStatus === "queued" || diagnosisStatus === "started") score += 1;
  if (diagnosisStatus === "failed" || diagnosisStatus === "aborted") score += 1;
  if (diagnosisHistoryCount >= 3) score += 1;

  const severity: ThreadRiskInfo["severity"] = score >= 4 ? "high" : score >= 2 ? "medium" : "normal";

  return {
    score,
    severity,
    suppressionRatioPct,
    fallbackSuppressed,
    fallbackUsed,
    retryEventCount,
    permissionHighRisk,
    permissionCritical,
    permissionHardToReverse,
    permissionShared,
    diagnosisStatus,
    diagnosisHistoryCount,
    reason,
    strategy,
  };
}

export const ThreadSidebar = memo(function ThreadSidebar({
  threads,
  currentThreadId,
  selectedWorkspacePath,
  editingId,
  editingName,
  onEditingNameChange,
  onSelectWorkspace,
  onNewThread,
  onLoadThread,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onDeleteThread,
  onInvestigateThread,
  onRunDiagnosisThread,
}: ThreadSidebarProps) {
  const { locale } = useLocaleStore();
  const [savedWorkspaces, setSavedWorkspaces] = useState<string[]>([]);
  const [workspaceAliases, setWorkspaceAliases] = useState<Record<string, string>>({});
  const [archivedThreadIds, setArchivedThreadIds] = useState<Set<string>>(new Set());
  const [hiddenWorkspaceKeys, setHiddenWorkspaceKeys] = useState<Set<string>>(new Set());
  const [collapsedWorkspaceKeys, setCollapsedWorkspaceKeys] = useState<Set<string>>(new Set());
  const [workspaceSortMode, setWorkspaceSortMode] = useState<WorkspaceSortMode>("recent");
  const [threadRiskFilterMode, setThreadRiskFilterMode] = useState<ThreadRiskFilterMode>("all");
  const effectiveWorkspaceSortMode: WorkspaceSortMode = SHOW_SIDEBAR_RISK_INSIGHTS ? workspaceSortMode : "recent";
  const effectiveThreadRiskFilterMode: ThreadRiskFilterMode = SHOW_SIDEBAR_RISK_INSIGHTS
    ? threadRiskFilterMode
    : "all";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedWorkspaces(dedupePaths(parsed.filter((item) => typeof item === "string")));
    } catch {
      setSavedWorkspaces([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARCHIVED_THREAD_IDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setArchivedThreadIds(new Set(parsed.filter((item) => typeof item === "string")));
    } catch {
      setArchivedThreadIds(new Set());
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_WORKSPACE_KEYS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = dedupePaths(parsed.filter((item) => typeof item === "string"));
      setHiddenWorkspaceKeys(new Set(normalized));
    } catch {
      setHiddenWorkspaceKeys(new Set());
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKSPACE_ALIAS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof key !== "string" || typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed.length > 0) normalized[key] = trimmed;
      }
      setWorkspaceAliases(normalized);
    } catch {
      setWorkspaceAliases({});
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKSPACE_SORT_MODE_STORAGE_KEY);
      if (raw === "risk" || raw === "recent") {
        setWorkspaceSortMode(raw);
      }
    } catch {
      setWorkspaceSortMode("recent");
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(THREAD_RISK_FILTER_STORAGE_KEY);
      if (raw === "high" || raw === "all") {
        setThreadRiskFilterMode(raw);
      }
    } catch {
      setThreadRiskFilterMode("all");
    }
  }, []);

  const persistWorkspaces = (next: string[]) => {
    setSavedWorkspaces(next);
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
  };

  const persistWorkspaceAliases = (next: Record<string, string>) => {
    setWorkspaceAliases(next);
    localStorage.setItem(WORKSPACE_ALIAS_STORAGE_KEY, JSON.stringify(next));
  };

  const persistHiddenWorkspaceKeys = (next: Set<string>) => {
    setHiddenWorkspaceKeys(next);
    localStorage.setItem(HIDDEN_WORKSPACE_KEYS_STORAGE_KEY, JSON.stringify(Array.from(next)));
  };

  const persistWorkspaceSortMode = (next: WorkspaceSortMode) => {
    setWorkspaceSortMode(next);
    localStorage.setItem(WORKSPACE_SORT_MODE_STORAGE_KEY, next);
  };

  const persistThreadRiskFilterMode = (next: ThreadRiskFilterMode) => {
    setThreadRiskFilterMode(next);
    localStorage.setItem(THREAD_RISK_FILTER_STORAGE_KEY, next);
  };

  const unhideWorkspace = (workspacePath?: string) => {
    if (!workspacePath) return;
    const normalized = normalizeWorkspacePath(workspacePath);
    if (!hiddenWorkspaceKeys.has(normalized)) return;
    const next = new Set(hiddenWorkspaceKeys);
    next.delete(normalized);
    persistHiddenWorkspaceKeys(next);
  };

  const workspaceGroups = useMemo(() => {
    const threadMap = new Map<string, ThreadMetadata[]>();
    const selectedWorkspaceKey = selectedWorkspacePath ? normalizeWorkspacePath(selectedWorkspacePath) : null;

    for (const thread of threads) {
      if (!thread.working_dir?.trim()) continue;
      const key = normalizeWorkspacePath(thread.working_dir);
      const list = threadMap.get(key);
      if (list) list.push(thread);
      else threadMap.set(key, [thread]);
    }

    const allKeys = dedupePaths([...savedWorkspaces, ...Array.from(threadMap.keys())]);
    const groups: WorkspaceGroup[] = allKeys
      .filter((workspacePath) => !hiddenWorkspaceKeys.has(workspacePath))
      .map((workspacePath) => {
        const wsThreadsAll = [...(threadMap.get(workspacePath) ?? [])]
          .filter((thread) => !archivedThreadIds.has(thread.id))
          .sort((a, b) => {
            if (effectiveWorkspaceSortMode === "risk") {
              const riskA = getThreadRiskInfo(a);
              const riskB = getThreadRiskInfo(b);
              if (riskB.score !== riskA.score) return riskB.score - riskA.score;
              if (riskB.suppressionRatioPct !== riskA.suppressionRatioPct) {
                return riskB.suppressionRatioPct - riskA.suppressionRatioPct;
              }
              return b.last_active - a.last_active;
            }
            return b.last_active - a.last_active;
          });
        const wsThreads =
          effectiveThreadRiskFilterMode === "high"
            ? wsThreadsAll.filter((thread) => getThreadRiskInfo(thread).severity === "high")
            : wsThreadsAll;
        const maxRiskScore = wsThreadsAll.reduce((max, thread) => {
          const risk = getThreadRiskInfo(thread);
          return Math.max(max, risk.score);
        }, 0);
        const highRiskCount = wsThreadsAll.reduce((count, thread) => {
          const risk = getThreadRiskInfo(thread);
          return risk.severity === "high" ? count + 1 : count;
        }, 0);
        const alias = workspaceAliases[workspacePath]?.trim();
        return {
          key: workspacePath,
          name: alias || getWorkspaceName(workspacePath),
          path: workspacePath,
          threads: wsThreads,
          lastActive: wsThreadsAll[0]?.last_active ?? 0,
          riskScore: maxRiskScore,
          highRiskCount,
        };
      });

    const filteredGroups =
      effectiveThreadRiskFilterMode === "high"
        ? groups.filter((group) => group.threads.length > 0 || group.key === selectedWorkspaceKey)
        : groups;

    return filteredGroups.sort((a, b) => {
      if (effectiveWorkspaceSortMode === "risk") {
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
        if (b.highRiskCount !== a.highRiskCount) return b.highRiskCount - a.highRiskCount;
      }
      return b.lastActive - a.lastActive;
    });
  }, [
    archivedThreadIds,
    hiddenWorkspaceKeys,
    savedWorkspaces,
    selectedWorkspacePath,
    effectiveThreadRiskFilterMode,
    threads,
    workspaceAliases,
    effectiveWorkspaceSortMode,
  ]);

  const highRiskSpotlight = useMemo<SpotlightThreadItem[]>(() => {
    if (!SHOW_SIDEBAR_RISK_INSIGHTS) {
      return [];
    }
    const list: SpotlightThreadItem[] = [];
    for (const workspace of workspaceGroups) {
      for (const thread of workspace.threads) {
        const risk = getThreadRiskInfo(thread);
        if (risk.severity !== "high") continue;
        list.push({
          thread,
          workspaceName: workspace.name,
          risk,
        });
      }
    }
    return list
      .sort((a, b) => {
        if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
        if (b.risk.suppressionRatioPct !== a.risk.suppressionRatioPct) {
          return b.risk.suppressionRatioPct - a.risk.suppressionRatioPct;
        }
        return b.thread.last_active - a.thread.last_active;
      })
      .slice(0, 5);
  }, [workspaceGroups]);

  const handleChooseWorkspace = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: translate(locale, "agent.sidebarChooseWorkspaceTitle"),
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof selectedPath !== "string" || selectedPath.trim().length === 0) return;

      const normalized = normalizeWorkspacePath(selectedPath);
      persistWorkspaces(dedupePaths([...savedWorkspaces, normalized]));
      unhideWorkspace(normalized);
      onSelectWorkspace?.(normalized);
    } catch (error) {
      console.error("Failed to open directory picker:", error);
      toast.error(translate(locale, "agent.sidebarPickWorkspaceFailed"));
    }
  };

  const handleSelectWorkspace = (workspaceKey: string) => {
    unhideWorkspace(workspaceKey);
    onSelectWorkspace?.(workspaceKey);
  };

  const handleStartThreadInWorkspace = (workspacePath?: string) => {
    const normalized = workspacePath ? normalizeWorkspacePath(workspacePath) : undefined;
    if (normalized) {
      unhideWorkspace(normalized);
      onSelectWorkspace?.(normalized);
    }
    onNewThread(normalized);
  };

  const handleOpenWorkspaceInExplorer = async (workspacePath?: string) => {
    const normalized = workspacePath ? normalizeWorkspacePath(workspacePath) : "";
    if (!normalized) {
      toast.error(translate(locale, "agent.sidebarWorkspacePathMissing"));
      return;
    }
    try {
      await threadService.revealThreadsDir(normalized);
    } catch (error) {
      console.error("Failed to open workspace in explorer:", error);
      toast.error(translate(locale, "agent.sidebarOpenExplorerFailed"));
    }
  };

  const handleRenameWorkspace = (workspace: WorkspaceGroup) => {
    if (!workspace.path) {
      toast.error(translate(locale, "agent.sidebarWorkspacePathMissing"));
      return;
    }
    const defaultName = workspaceAliases[workspace.path] || workspace.name;
    const promptText = translate(locale, "agent.sidebarRenameWorkspacePrompt");
    const next = window.prompt(promptText, defaultName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const nextAliases = { ...workspaceAliases, [workspace.path]: trimmed };
    persistWorkspaceAliases(nextAliases);
  };

  const handleRemoveWorkspace = (workspace: WorkspaceGroup) => {
    if (!workspace.path) {
      toast.error(translate(locale, "agent.sidebarWorkspacePathMissing"));
      return;
    }
    const confirmText = translate(locale, "agent.sidebarRemoveWorkspaceConfirm").replace(
      "{name}",
      workspace.name,
    );
    const ok = window.confirm(confirmText);
    if (!ok) return;

    const normalized = normalizeWorkspacePath(workspace.path);
    persistWorkspaces(savedWorkspaces.filter((item) => normalizeWorkspacePath(item) !== normalized));

    const nextAliases = { ...workspaceAliases };
    delete nextAliases[workspace.path];
    persistWorkspaceAliases(nextAliases);

    setCollapsedWorkspaceKeys((prev) => {
      const next = new Set(prev);
      next.delete(workspace.key);
      return next;
    });

    const nextHidden = new Set(hiddenWorkspaceKeys);
    nextHidden.add(normalized);
    persistHiddenWorkspaceKeys(nextHidden);
    toast.success(translate(locale, "agent.sidebarRemoveWorkspaceDone"));
  };

  const toggleWorkspaceCollapsed = (workspaceKey: string) => {
    setCollapsedWorkspaceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceKey)) next.delete(workspaceKey);
      else next.add(workspaceKey);
      return next;
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return translate(locale, "agent.sidebarJustNow");
    if (hours < 24) {
      return translate(locale, "agent.sidebarHoursAgo").replace("{hours}", String(hours));
    }
    const days = Math.floor(hours / 24);
    return translate(locale, "agent.sidebarDaysAgo").replace("{days}", String(days));
  };

  const isSelectedWorkspace = (workspaceKey: string) => {
    if (!selectedWorkspacePath) return false;
    return normalizeWorkspacePath(selectedWorkspacePath) === workspaceKey;
  };

  const headerTitle = translate(locale, "agent.sidebarTitle");
  const noWorkspaceText = translate(locale, "agent.sidebarNoWorkspaces");
  const noThreadText = translate(locale, "agent.sidebarNoThreadsShort");
  const noHighRiskThreadText = translate(locale, "agent.sidebarNoHighRiskThreads");
  const emptyWorkspaceListText = effectiveThreadRiskFilterMode === "high" ? noHighRiskThreadText : noWorkspaceText;
  const sortByRecentLabel = translate(locale, "agent.sidebarSortRecent");
  const sortByRiskLabel = translate(locale, "agent.sidebarSortRisk");
  const riskFilterAllLabel = translate(locale, "agent.sidebarRiskFilterAll");
  const riskFilterHighLabel = translate(locale, "agent.sidebarRiskFilterHigh");
  const investigateLabel = translate(locale, "agent.sidebarInvestigateRisk");
  const investigateRunLabel = translate(locale, "agent.sidebarInvestigateRun");
  const highRiskSpotlightTitle = translate(locale, "agent.sidebarHighRiskSpotlight");

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <header className="flex h-11 items-center justify-between px-4">
        <span className="text-[12px] font-semibold text-foreground/80">{headerTitle}</span>
        <div className="flex items-center gap-1">
          {SHOW_SIDEBAR_RISK_INSIGHTS && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                  title={translate(locale, "agent.sidebarSortFilterTitle")}
                >
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground/80">
                  {translate(locale, "agent.sidebarSortModeTitle")}
                </div>
                <DropdownMenuRadioGroup
                  value={workspaceSortMode}
                  onValueChange={(value) => {
                    if (value === "risk" || value === "recent") {
                      persistWorkspaceSortMode(value);
                    }
                  }}
                >
                  <DropdownMenuRadioItem value="recent">{sortByRecentLabel}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="risk">{sortByRiskLabel}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground/80">
                  {translate(locale, "agent.sidebarRiskFilterTitle")}
                </div>
                <DropdownMenuRadioGroup
                  value={threadRiskFilterMode}
                  onValueChange={(value) => {
                    if (value === "all" || value === "high") {
                      persistThreadRiskFilterMode(value);
                    }
                  }}
                >
                  <DropdownMenuRadioItem value="all">{riskFilterAllLabel}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="high">{riskFilterHighLabel}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
            onClick={() => {
              void handleChooseWorkspace();
            }}
            title={translate(locale, "agent.sidebarPickWorkspace")}
          >
            <Plus size={14} />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {highRiskSpotlight.length > 0 && (
            <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                <AlertTriangle size={12} />
                <span>{highRiskSpotlightTitle}</span>
              </div>
              <div className="space-y-1">
                {highRiskSpotlight.map((item) => {
                  const threadName = item.thread.name || translate(locale, "agent.untitledTask");
                  const tooltip = translate(locale, "agent.sidebarThreadRiskTooltip")
                    .replace("{ratio}", String(item.risk.suppressionRatioPct))
                    .replace("{suppressed}", String(item.risk.fallbackSuppressed))
                    .replace("{retries}", String(item.risk.retryEventCount))
                    .replace("{reason}", item.risk.reason || "-")
                    .replace("{strategy}", item.risk.strategy || "-");
                  return (
                    <div
                      key={`spotlight-${item.thread.id}`}
                      className="flex items-center justify-between gap-1 rounded border border-amber-500/20 bg-background/45 px-1.5 py-1"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        title={tooltip}
                        onClick={() => onLoadThread(item.thread.id)}
                      >
                        <span className="block truncate text-[11px] text-foreground/90">
                          {ellipsizeLabel(threadName, 22)}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground/75">
                          {item.workspaceName} | {item.risk.suppressionRatioPct}%
                        </span>
                      </button>
                      <div className="flex items-center gap-1">
                        {onRunDiagnosisThread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                            onClick={() => onRunDiagnosisThread(item.thread)}
                            title={investigateRunLabel}
                          >
                            <Play size={11} className="mr-1" />
                            {investigateRunLabel}
                          </Button>
                        )}
                        {onInvestigateThread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                            onClick={() => onInvestigateThread(item.thread)}
                            title={investigateLabel}
                          >
                            <AlertTriangle size={11} className="mr-1" />
                            {investigateLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {workspaceGroups.length === 0 ? (
            <div
              className="cursor-pointer rounded-lg border-dashed border-border/40 p-3 text-[12px] text-muted-foreground/70 hover:bg-foreground/5"
              onClick={() => {
                void handleChooseWorkspace();
              }}
            >
              {emptyWorkspaceListText}
            </div>
          ) : (
            workspaceGroups.map((workspace) => {
              const isCollapsed = collapsedWorkspaceKeys.has(workspace.key);
              const threadTitle =
                translate(locale, "agent.sidebarStartThreadInWorkspace").replace(
                  "{name}",
                  workspace.name,
                );

              return (
                <div key={workspace.key} className="rounded-md px-1 py-1">
                  <div
                    className={cn(
                      "group flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-1 py-1",
                      isSelectedWorkspace(workspace.key)
                        ? "bg-foreground/10 text-foreground"
                        : "hover:bg-foreground/5",
                    )}
                    onClick={() => handleSelectWorkspace(workspace.key)}
                  >
                    <button
                      type="button"
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleWorkspaceCollapsed(workspace.key);
                      }}
                      title={translate(
                        locale,
                        isCollapsed ? "agent.sidebarExpandWorkspace" : "agent.sidebarCollapseWorkspace",
                      )}
                    >
                      <Folder size={14} className="block group-hover:hidden" />
                      {isCollapsed ? (
                        <ChevronRight size={14} className="hidden group-hover:block" />
                      ) : (
                        <ChevronDown size={14} className="hidden group-hover:block" />
                      )}
                    </button>

                    <div className="min-w-0 w-0 flex-1 overflow-hidden">
                      <span
                        className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-foreground/85"
                        title={workspace.path}
                      >
                        {workspace.name}
                      </span>
                    </div>

                    {SHOW_SIDEBAR_RISK_INSIGHTS && workspace.highRiskCount > 0 && (
                      <span
                        className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-300"
                        title={translate(locale, "agent.sidebarRiskBadgeHigh").replace(
                          "{count}",
                          String(workspace.highRiskCount),
                        )}
                      >
                        <AlertTriangle size={10} className="mr-1" />
                        {workspace.highRiskCount}
                      </span>
                    )}

                    <div
                      className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                        title={threadTitle}
                        onClick={() => handleStartThreadInWorkspace(workspace.path)}
                      >
                        <Pencil size={13} />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                            title={translate(locale, "agent.sidebarFilter")}
                          >
                            <MoreHorizontal size={13} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[210px]">
                          <DropdownMenuItem
                            onClick={() => {
                              void handleOpenWorkspaceInExplorer(workspace.path);
                            }}
                          >
                            <FolderOpen size={13} className="mr-2" />
                            {translate(locale, "agent.sidebarMenuOpenInExplorer")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRenameWorkspace(workspace)}>
                            <Pencil size={13} className="mr-2" />
                            {translate(locale, "agent.sidebarMenuEditName")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleRemoveWorkspace(workspace)}
                          >
                            <Trash2 size={13} className="mr-2" />
                            {translate(locale, "agent.sidebarMenuRemove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {isCollapsed ? null : workspace.threads.length === 0 ? (
                    <div className="pl-6 pr-1 py-1 text-[12px] text-muted-foreground/55">
                      {effectiveThreadRiskFilterMode === "high" ? noHighRiskThreadText : noThreadText}
                    </div>
                  ) : (
                    <div className="space-y-0.5 pl-3">
                      {workspace.threads.map((thread) => {
                        const risk = SHOW_SIDEBAR_RISK_INSIGHTS ? getThreadRiskInfo(thread) : EMPTY_THREAD_RISK_INFO;
                        const permissionSignalCount =
                          risk.permissionCritical +
                          risk.permissionHighRisk +
                          risk.permissionHardToReverse +
                          risk.permissionShared;
                        const diagnosisActivity = thread.diagnostics?.diagnosis_activity;
                        const diagnosisVisible =
                          SHOW_SIDEBAR_RISK_INSIGHTS &&
                          typeof diagnosisActivity?.command === "string" &&
                          diagnosisActivity.command.trim().length > 0;
                        const diagnosisKindLabel = getDiagnosisKindLabel(locale, diagnosisActivity?.kind);
                        const diagnosisStatusLabel = getDiagnosisStatusLabel(locale, diagnosisActivity?.status);
                        const diagnosisTooltip = diagnosisVisible
                          ? `${diagnosisKindLabel} | ${diagnosisStatusLabel}\n${diagnosisActivity?.command ?? ""}`
                          : "";
                        const riskLabel =
                          risk.severity === "high"
                            ? translate(locale, "agent.sidebarThreadRiskHigh")
                            : risk.severity === "medium"
                              ? translate(locale, "agent.sidebarThreadRiskMedium")
                              : "";
                        const diagnosisTooltipLine =
                          diagnosisVisible || risk.diagnosisHistoryCount > 0
                            ? `${translate(locale, "agent.sidebarDiagnosisCaption")} status=${getDiagnosisStatusLabel(
                                locale,
                                risk.diagnosisStatus,
                              )} | history=${risk.diagnosisHistoryCount}`
                            : "";
                        const diagnosisHistoryBadgeLabel = translate(locale, "agent.sidebarDiagnosisHistoryBadge", {
                          count: risk.diagnosisHistoryCount,
                        });
                        const riskTooltip =
                          risk.severity === "normal"
                            ? ""
                            : [
                                translate(locale, "agent.sidebarThreadRiskTooltip")
                                  .replace("{ratio}", String(risk.suppressionRatioPct))
                                  .replace("{suppressed}", String(risk.fallbackSuppressed))
                                  .replace("{retries}", String(risk.retryEventCount))
                                  .replace("{reason}", risk.reason || "-")
                                  .replace("{strategy}", risk.strategy || "-"),
                                risk.permissionCritical > 0 ||
                                risk.permissionHighRisk > 0 ||
                                risk.permissionHardToReverse > 0 ||
                                risk.permissionShared > 0
                                  ? translate(locale, "agent.sidebarThreadRiskTooltipPermission")
                                      .replace("{critical}", String(risk.permissionCritical))
                                      .replace("{highRisk}", String(risk.permissionHighRisk))
                                      .replace("{hardToReverse}", String(risk.permissionHardToReverse))
                                      .replace("{shared}", String(risk.permissionShared))
                                  : "",
                                diagnosisTooltipLine,
                              ]
                                .filter(Boolean)
                                .join(" | ");

                        return (
                          <div
                            key={thread.id}
                            onClick={() => onLoadThread(thread.id)}
                            className={cn(
                              "group relative flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors",
                              currentThreadId === thread.id
                                ? "bg-foreground/10 text-foreground"
                                : "text-muted-foreground/75 hover:bg-foreground/5 hover:text-foreground/90",
                            )}
                          >
                            <div className="min-w-0 max-w-[128px] flex-1 pr-2">
                              {editingId === thread.id ? (
                                <Input
                                  autoFocus
                                  className="h-6 w-full border-primary/30 bg-background px-1.5 text-[12px]"
                                  value={editingName}
                                  onChange={(event) => onEditingNameChange(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") onConfirmRename();
                                    if (event.key === "Escape") onCancelRename();
                                  }}
                                  onBlur={onConfirmRename}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              ) : (
                                <div className="min-w-0">
                                  <span
                                    className="block max-w-[128px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px]"
                                    title={thread.name || translate(locale, "agent.untitledTask")}
                                  >
                                    {ellipsizeLabel(
                                      thread.name || translate(locale, "agent.untitledTask"),
                                      MAX_THREAD_DISPLAY_CHARS,
                                    )}
                                  </span>
                                  {diagnosisVisible && (
                                    <div
                                      className="mt-0.5 flex min-w-0 items-center gap-1"
                                      title={diagnosisTooltip}
                                    >
                                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/65">
                                        {translate(locale, "agent.sidebarDiagnosisCaption")}
                                      </span>
                                      <span className="min-w-0 truncate text-[10px] text-muted-foreground/85">
                                        {diagnosisKindLabel}
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[9px]",
                                          getDiagnosisStatusBadgeClass(diagnosisActivity?.status),
                                        )}
                                      >
                                        {diagnosisStatusLabel}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {SHOW_SIDEBAR_RISK_INSIGHTS && risk.diagnosisHistoryCount > 0 && (
                                <span
                                  className="inline-flex max-w-[70px] items-center rounded border border-primary/35 bg-primary/10 px-1 py-0.5 text-[10px] text-primary/90"
                                  title={riskTooltip}
                                >
                                  {diagnosisHistoryBadgeLabel}
                                </span>
                              )}
                              {SHOW_SIDEBAR_RISK_INSIGHTS && risk.severity !== "normal" && (
                                <span
                                  className={cn(
                                    "inline-flex max-w-[64px] items-center rounded border px-1 py-0.5 text-[10px]",
                                    risk.severity === "high"
                                      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                                      : "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
                                  )}
                                  title={riskTooltip}
                                >
                                  {riskLabel}
                                </span>
                              )}
                              {SHOW_SIDEBAR_RISK_INSIGHTS && permissionSignalCount > 0 && (
                                <span
                                  className="inline-flex max-w-[70px] items-center rounded border border-violet-500/40 bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-600 dark:text-violet-300"
                                  title={riskTooltip}
                                >
                                  {translate(locale, "agent.sidebarThreadPermissionBadge", {
                                    count: permissionSignalCount,
                                  })}
                                </span>
                              )}
                              <span className="max-w-[58px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground/50">
                                {formatRelativeTime(thread.last_active)}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 text-muted-foreground/50 transition-opacity hover:text-foreground group-hover:opacity-100"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <MoreHorizontal size={12} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[190px]">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void handleOpenWorkspaceInExplorer(workspace.path ?? thread.working_dir);
                                    }}
                                  >
                                    <FolderOpen size={13} className="mr-2" />
                                    {translate(locale, "agent.sidebarOpenInExplorer")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onStartRename(thread)}>
                                    <Pencil size={13} className="mr-2" />
                                    {translate(locale, "agent.sidebarRename")}
                                  </DropdownMenuItem>
                                  {onRunDiagnosisThread && risk.severity !== "normal" && (
                                    <DropdownMenuItem onClick={() => onRunDiagnosisThread(thread)}>
                                      <Play size={13} className="mr-2" />
                                      {investigateRunLabel}
                                    </DropdownMenuItem>
                                  )}
                                  {onInvestigateThread && risk.severity !== "normal" && (
                                    <DropdownMenuItem onClick={() => onInvestigateThread(thread)}>
                                      <AlertTriangle size={13} className="mr-2" />
                                      {investigateLabel}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => onDeleteThread(thread.id)}
                                  >
                                    <Trash2 size={13} className="mr-2" />
                                    {translate(locale, "agent.sidebarDelete")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

