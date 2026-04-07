import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RefreshCw,
  ListTree,
  SquareMinus,
  SquarePlus,
  Terminal,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ImperativePanelHandle
} from "@/components/ui/resizable";
import { AgentMessageItem } from "@/components/agent/AgentMessageItem";
import { ComposerPanel } from "@/components/agent/ComposerPanel";
import { ThreadSidebar } from "@/components/agent/ThreadSidebar";
import { VirtualMessageList } from "@/components/agent/VirtualMessageList";
import {
  QueryEngine,
  type AgentStepData,
  type AgentMessage,
  type QueuePriority,
  type QueryRuntimeSnapshot,
  type QueuedQueryItem,
  type ToolPermissionMode,
  type PermissionPromptDecision,
  type PermissionPromptRequest,
} from "@/lib/agent/QueryEngine";
import type { PermissionRule, PermissionSuggestion } from "@/lib/agent/permissions/toolPermissions";
import type { Continue, Terminal as QueryTerminal } from "@/lib/agent/query/transitions";
import type {
  PermissionRiskClass,
  PromptCompiledSectionMetadata,
  QueryStreamEvent,
} from "@/lib/agent/query/events";
import { ALL_TOOLS } from "@/lib/agent/tools";
import { threadService } from "@/lib/agent/ThreadService";
import type { ThreadMetadata } from "@/lib/agent/ThreadService";
import type { ThreadEvent } from "@/lib/agent/ThreadService";
import type { ThreadDiagnostics, ThreadDiagnosisActivity } from "@/lib/agent/ThreadService";
import { translate, type AppLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { loadAgentPreferences, saveAgentPreferences } from "@/lib/agentPreferencesStorage";
import {
  getTerminalShellChangedEventName,
  loadTerminalShellType,
  type TerminalShellType,
} from "@/lib/terminalShellStorage";

interface AgentWorkstationViewProps {
  apiConfig: { baseUrl: string; apiKey: string } | null;
  isSiderVisible?: boolean;
  userInfo: any;
  onRefreshUserInfo: () => void;
}

interface ModelInfo {
  id: string;
  label: string;
}

interface PermissionPromptQueueItem {
  id: string;
  request: PermissionPromptRequest;
}

interface RuntimeGitSnapshotView {
  success: boolean;
  working_dir: string;
  is_git_repo: boolean;
  branch?: string | null;
  default_branch?: string | null;
  status_short: string[];
  recent_commits: string[];
  error?: string | null;
}

interface TerminalExecution {
  id: string;
  command: string;
  shell: TerminalShellType;
  status: "running" | "completed" | "error";
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  interrupted?: boolean;
  startedAt: number;
  endedAt?: number;
  expanded: boolean;
  liveLogs: string[];
}

interface RewindPreviewState {
  turnId: string;
  restoreCount: number;
  removeCount: number;
  affectedPaths: string[];
  warnings: string[];
  firstSeq: number | null;
}

type TraceQuickCommandKind =
  | "summary"
  | "hotspots"
  | "queue_diagnostics"
  | "investigate"
  | "fallback_investigate";
type TraceQuickCommandStatus =
  | "prepared"
  | "started"
  | "queued"
  | "queue_full"
  | "completed"
  | "failed"
  | "aborted";
type DiagnosisHistoryStatusFilter = "all" | "active" | "failed";
type DiagnosisHistoryKindFilter = "all" | TraceQuickCommandKind;
type DiagnosisHistorySortMode = "recent" | "risk";

interface TraceQuickCommandState {
  kind: TraceQuickCommandKind;
  status: TraceQuickCommandStatus;
  command: string;
  at: number;
  commandId?: string;
}

interface DiagnosisRunbookActionExecutionState {
  status: TraceQuickCommandStatus;
  at: number;
  command: string;
  commandId?: string | null;
}

const TRACE_QUICK_COMMAND_KIND_SET: ReadonlySet<TraceQuickCommandKind> = new Set([
  "summary",
  "hotspots",
  "queue_diagnostics",
  "investigate",
  "fallback_investigate",
]);

const TRACE_QUICK_COMMAND_STATUS_SET: ReadonlySet<TraceQuickCommandStatus> = new Set([
  "prepared",
  "started",
  "queued",
  "queue_full",
  "completed",
  "failed",
  "aborted",
]);
const DIAGNOSIS_HISTORY_ACTIVE_STATUS_SET: ReadonlySet<TraceQuickCommandStatus> = new Set([
  "prepared",
  "queued",
  "started",
]);
const DIAGNOSIS_HISTORY_FAILED_STATUS_SET: ReadonlySet<TraceQuickCommandStatus> = new Set([
  "failed",
  "aborted",
  "queue_full",
]);

interface PersistedThreadState {
  order: string[];
  signatures: Record<string, string>;
}

type DiffScope = "unstaged" | "staged" | "allBranches" | "lastRound";

type SubmitAgentQueryResult =
  | { accepted: true; queued: boolean; commandId: string }
  | {
      accepted: false;
      reason: "engine_not_ready" | "empty" | "queue_full";
    };

interface AgentLogEventPayload {
  source?: string;
  line?: string;
  command_id?: string | null;
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3 (SiliconFlow)" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
  { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B" },
];

const DEFAULT_TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);
const DEFAULT_TOOL_COUNT = DEFAULT_TOOL_NAMES.length;
const SNAPSHOT_SAMPLE_SIZE = 32;
const MAX_TERMINAL_LIVE_LOG_LINES = 800;
const THREADS_REFRESH_DEBOUNCE_MS = 450;
const TERMINAL_LOG_FLUSH_INTERVAL_MS = 80;
const STATUS_TICK_INTERVAL_MS = 1000;
const STATUS_STALL_THRESHOLD_SECONDS = 8;
const TOOL_ARGS_HISTORY_SCAN_LIMIT = 420;
const EMPTY_PROMPT_SECTIONS: PromptCompiledSectionMetadata[] = [];
const EMPTY_STRING_LIST: string[] = [];
const EMPTY_QUEUED_QUERY_LIST: QueuedQueryItem[] = [];
const EMPTY_QUEUE_BY_PRIORITY = Object.freeze({
  now: 0,
  next: 0,
  later: 0,
});
const EMPTY_QUERY_RUNTIME_SNAPSHOT: QueryRuntimeSnapshot = {
  queueCount: 0,
  queueLimit: 8,
  queuedQueries: Object.freeze([]),
  queueByPriority: EMPTY_QUEUE_BY_PRIORITY,
  recentEvents: Object.freeze([]),
  latestEvent: null,
  lastEventAt: null,
};
const THREAD_AUTOSAVE_IDLE_MS = 1_200;
const PERSISTED_MESSAGE_CONTENT_LIMIT = 40_000;
const PERSISTED_REPORT_CONTENT_LIMIT = 16_000;
const PERSISTED_STEP_LOG_LINES_LIMIT = 180;
const PERSISTED_STEP_LOG_LINE_CHARS_LIMIT = 900;
const PERSISTED_TOOL_ARGS_CHARS_LIMIT = 8_000;
const PERSISTED_TOOL_PREVIEW_CHARS_LIMIT = 3_000;
const PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS = 280_000;
const PERSISTED_BUDGET_RECENT_MESSAGE_COUNT = 8;
const PERSISTED_BUDGET_OLD_MESSAGE_CONTENT_LIMIT = 4_500;
const PERSISTED_BUDGET_OLD_MESSAGE_REPORT_LIMIT = 1_400;
const PERSISTED_BUDGET_OLD_STEP_LOG_LINES_LIMIT = 60;
const PERSISTED_BUDGET_OLD_STEP_LOG_LINE_CHARS_LIMIT = 360;
const PERSISTED_BUDGET_OLD_TOOL_ARGS_CHARS_LIMIT = 1_800;
const PERSISTED_BUDGET_OLD_TOOL_PREVIEW_CHARS_LIMIT = 900;
const PERSISTED_BUDGET_HARD_MIN_CONTENT_LIMIT = 220;
const PERSISTED_BUDGET_HARD_MIN_REPORT_LIMIT = 120;
const PERSISTED_BUDGET_HARD_MIN_LOG_LINES = 8;
const PERSISTED_BUDGET_HARD_MIN_LOG_LINE_CHARS_LIMIT = 140;
const PERSISTED_BUDGET_HARD_MIN_TOOL_ARGS_CHARS_LIMIT = 420;
const PERSISTED_BUDGET_HARD_MIN_TOOL_PREVIEW_CHARS_LIMIT = 240;
const PERSISTED_BUDGET_MINIMAL_CONTENT = "[persisted-pruned]";
const PERSISTED_BUDGET_MINIMAL_REPORT = "[persisted-pruned-report]";
const MAX_DIAGNOSIS_HISTORY_ITEMS = 40;
const DIAGNOSIS_HISTORY_PREVIEW_LIMIT = 8;

function getDiagnosisHistoryRiskScore(state: Pick<TraceQuickCommandState, "kind" | "status" | "command">): number {
  let score = 0;
  switch (state.status) {
    case "queue_full":
    case "failed":
      score += 4;
      break;
    case "aborted":
      score += 3;
      break;
    case "started":
    case "queued":
      score += 2;
      break;
    case "prepared":
      score += 1;
      break;
    case "completed":
    default:
      break;
  }
  switch (state.kind) {
    case "fallback_investigate":
      score += 2;
      break;
    case "investigate":
      score += 2;
      break;
    case "queue_diagnostics":
      score += 1;
      break;
    case "hotspots":
      score += 1;
      break;
    case "summary":
    default:
      break;
  }
  const command = state.command.toLowerCase();
  if (command.includes("failure")) score += 1;
  if (command.includes("queue")) score += 1;
  if (command.includes("fallback")) score += 1;
  return score;
}

function getDiagnosisRunbookActionIdFromKind(kind: TraceQuickCommandKind): string {
  if (kind === "summary") return "summary";
  if (kind === "hotspots") return "hotspots";
  if (kind === "queue_diagnostics") return "queue_diagnostics";
  if (kind === "investigate") return "investigate";
  return "fallback_investigate";
}

function extractTraceToolFromCommand(command: string): string | null {
  const matched = command.match(/\btool=([^\s]+)/);
  return matched?.[1] ?? null;
}

function cloneMessages(messages: AgentMessage[]): AgentMessage[] {
  if (typeof structuredClone === "function") {
    return structuredClone(messages);
  }
  return JSON.parse(JSON.stringify(messages)) as AgentMessage[];
}

function summarizeText(value: string | undefined): string {
  if (!value) return "0";
  const head = value.slice(0, SNAPSHOT_SAMPLE_SIZE);
  const tail = value.slice(-SNAPSHOT_SAMPLE_SIZE);
  return `${value.length}:${head}:${tail}`;
}

function truncateForPersistence(value: string | undefined, maxChars: number): string {
  const text = value ?? "";
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const marker = "\n...[persisted-trimmed]...\n";
  const available = Math.max(16, maxChars - marker.length);
  const headLen = Math.max(8, Math.floor(available * 0.72));
  const tailLen = Math.max(8, available - headLen);
  return `${text.slice(0, headLen)}${marker}${text.slice(-tailLen)}`;
}

function buildThreadDiagnosticsFromEvents(events: QueryStreamEvent[]): ThreadDiagnostics | undefined {
  if (events.length === 0) {
    return undefined;
  }

  let fallbackUsed = 0;
  let fallbackSuppressed = 0;
  let retryEventCount = 0;
  let lastSuppressedReason: string | null = null;
  let lastRetryStrategy: string | null = null;
  const permissionRiskCounts = createEmptyTracePermissionRiskCounts();
  const permissionReversibilityCounts = createEmptyTracePermissionReversibilityCounts();
  const permissionBlastRadiusCounts = createEmptyTracePermissionBlastRadiusCounts();
  let permissionScopeNotices = 0;

  for (const event of events) {
    if (event.type === "continue" && event.transition.reason === "fallback_retry") {
      fallbackUsed += 1;
      continue;
    }
    if (event.type === "retry_attempt") {
      retryEventCount += 1;
      if (event.retryStrategy) {
        lastRetryStrategy = event.retryStrategy;
      }
      continue;
    }
    if (event.type === "retry_profile_update") {
      retryEventCount += 1;
      if (event.retryStrategy) {
        lastRetryStrategy = event.retryStrategy;
      }
      continue;
    }
    if (event.type === "fallback_suppressed") {
      retryEventCount += 1;
      fallbackSuppressed += 1;
      lastSuppressedReason = event.reason;
      if (event.retryStrategy) {
        lastRetryStrategy = event.retryStrategy;
      }
      continue;
    }
    if (event.type === "permission_decision") {
      const risk = event.riskClass ?? "policy";
      permissionRiskCounts[risk] += 1;
      continue;
    }
    if (event.type === "authorization_scope_notice") {
      permissionScopeNotices += 1;
      continue;
    }
    if (event.type === "permission_risk_profile") {
      permissionReversibilityCounts[event.reversibility] += 1;
      permissionBlastRadiusCounts[event.blastRadius] += 1;
    }
  }

  const hasRetrySignals = fallbackUsed > 0 || fallbackSuppressed > 0 || retryEventCount > 0;
  const hasPermissionSignals =
    permissionRiskCounts.critical > 0 ||
    permissionRiskCounts.high_risk > 0 ||
    permissionRiskCounts.interactive > 0 ||
    permissionRiskCounts.path_outside > 0 ||
    permissionRiskCounts.policy > 0 ||
    permissionScopeNotices > 0 ||
    permissionReversibilityCounts.reversible > 0 ||
    permissionReversibilityCounts.mixed > 0 ||
    permissionReversibilityCounts.hard_to_reverse > 0 ||
    permissionBlastRadiusCounts.local > 0 ||
    permissionBlastRadiusCounts.workspace > 0 ||
    permissionBlastRadiusCounts.shared > 0;

  if (!hasRetrySignals && !hasPermissionSignals) {
    return undefined;
  }

  const totalFallbackTransitions = fallbackUsed + fallbackSuppressed;
  const suppressionRatioPct =
    totalFallbackTransitions > 0
      ? Math.round((fallbackSuppressed / totalFallbackTransitions) * 100)
      : 0;

  return {
    retry: {
      fallback_used: fallbackUsed,
      fallback_suppressed: fallbackSuppressed,
      retry_event_count: retryEventCount,
      suppression_ratio_pct: suppressionRatioPct,
      last_suppressed_reason: lastSuppressedReason,
      last_retry_strategy: lastRetryStrategy,
    },
    permission: hasPermissionSignals
      ? {
          risk: {
            critical: permissionRiskCounts.critical,
            high_risk: permissionRiskCounts.high_risk,
            interactive: permissionRiskCounts.interactive,
            path_outside: permissionRiskCounts.path_outside,
            policy: permissionRiskCounts.policy,
            scope_notices: permissionScopeNotices,
          },
          profile: {
            reversible: permissionReversibilityCounts.reversible,
            mixed: permissionReversibilityCounts.mixed,
            hard_to_reverse: permissionReversibilityCounts.hard_to_reverse,
            local: permissionBlastRadiusCounts.local,
            workspace: permissionBlastRadiusCounts.workspace,
            shared: permissionBlastRadiusCounts.shared,
          },
        }
      : undefined,
    updated_at: Date.now(),
  };
}

function compactStepForPersistence(step: AgentStepData): AgentStepData {
  const logs = (step.logs ?? [])
    .slice(-PERSISTED_STEP_LOG_LINES_LIMIT)
    .map((line) => truncateForPersistence(line, PERSISTED_STEP_LOG_LINE_CHARS_LIMIT));
  const toolRender = step.toolRender
    ? {
        ...step.toolRender,
        callArguments: truncateForPersistence(step.toolRender.callArguments, PERSISTED_TOOL_ARGS_CHARS_LIMIT),
        outcomePreview: truncateForPersistence(step.toolRender.outcomePreview, PERSISTED_TOOL_PREVIEW_CHARS_LIMIT),
      }
    : undefined;
  return {
    ...step,
    logs,
    toolRender,
  };
}

function compactMessageForPersistence(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: truncateForPersistence(message.content, PERSISTED_MESSAGE_CONTENT_LIMIT),
    report: truncateForPersistence(message.report, PERSISTED_REPORT_CONTENT_LIMIT),
    steps: message.steps?.map(compactStepForPersistence),
  };
}

function compactStepForBudget(
  step: AgentStepData,
  options: {
    logLinesLimit: number;
    lineCharsLimit: number;
    argsCharsLimit: number;
    previewCharsLimit: number;
  },
): AgentStepData {
  const logs = (step.logs ?? [])
    .slice(-Math.max(1, options.logLinesLimit))
    .map((line) => truncateForPersistence(line, Math.max(16, options.lineCharsLimit)));
  const toolRender = step.toolRender
    ? {
        ...step.toolRender,
        callArguments: truncateForPersistence(
          step.toolRender.callArguments,
          Math.max(24, options.argsCharsLimit),
        ),
        outcomePreview: truncateForPersistence(
          step.toolRender.outcomePreview,
          Math.max(24, options.previewCharsLimit),
        ),
      }
    : undefined;
  return {
    ...step,
    logs,
    toolRender,
  };
}

function compactMessageForBudget(
  message: AgentMessage,
  options: {
    contentLimit: number;
    reportLimit: number;
    logLinesLimit: number;
    lineCharsLimit: number;
    argsCharsLimit: number;
    previewCharsLimit: number;
  },
): AgentMessage {
  return {
    ...message,
    content: truncateForPersistence(message.content, Math.max(24, options.contentLimit)),
    report: truncateForPersistence(message.report, Math.max(24, options.reportLimit)),
    steps: message.steps?.map((step) =>
      compactStepForBudget(step, {
        logLinesLimit: options.logLinesLimit,
        lineCharsLimit: options.lineCharsLimit,
        argsCharsLimit: options.argsCharsLimit,
        previewCharsLimit: options.previewCharsLimit,
      }),
    ),
  };
}

function estimatePersistedMessagePayloadSize(message: AgentMessage): number {
  let total = 0;
  total += message.id.length;
  total += message.role.length;
  total += message.status?.length ?? 0;
  total += message.content?.length ?? 0;
  total += message.report?.length ?? 0;
  const steps = message.steps ?? [];
  for (const step of steps) {
    total += step.id.length + step.title.length + step.status.length;
    for (const line of step.logs ?? []) {
      total += line.length;
    }
    if (step.toolRender) {
      total += step.toolRender.toolName.length;
      total += step.toolRender.argsSummary.length;
      total += step.toolRender.callArguments?.length ?? 0;
      total += step.toolRender.outcome.length;
      total += step.toolRender.outcomePreview?.length ?? 0;
    }
  }
  return total;
}

function estimatePersistedMessagesPayloadSize(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + estimatePersistedMessagePayloadSize(message), 0);
}

function compactMessagesForPersistence(messages: AgentMessage[]): AgentMessage[] {
  const persisted = messages.map(compactMessageForPersistence);
  let totalSize = estimatePersistedMessagesPayloadSize(persisted);
  if (totalSize <= PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS) {
    return persisted;
  }

  const budgetProtectedStart = Math.max(0, persisted.length - PERSISTED_BUDGET_RECENT_MESSAGE_COUNT);
  for (let index = 0; index < budgetProtectedStart && totalSize > PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS; index += 1) {
    const current = persisted[index];
    const tightened = compactMessageForBudget(current, {
      contentLimit: PERSISTED_BUDGET_OLD_MESSAGE_CONTENT_LIMIT,
      reportLimit: PERSISTED_BUDGET_OLD_MESSAGE_REPORT_LIMIT,
      logLinesLimit: PERSISTED_BUDGET_OLD_STEP_LOG_LINES_LIMIT,
      lineCharsLimit: PERSISTED_BUDGET_OLD_STEP_LOG_LINE_CHARS_LIMIT,
      argsCharsLimit: PERSISTED_BUDGET_OLD_TOOL_ARGS_CHARS_LIMIT,
      previewCharsLimit: PERSISTED_BUDGET_OLD_TOOL_PREVIEW_CHARS_LIMIT,
    });
    const delta =
      estimatePersistedMessagePayloadSize(current) - estimatePersistedMessagePayloadSize(tightened);
    if (delta > 0) {
      persisted[index] = tightened;
      totalSize -= delta;
    }
  }

  if (totalSize <= PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS) {
    return persisted;
  }

  for (let index = 0; index < budgetProtectedStart && totalSize > PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS; index += 1) {
    const current = persisted[index];
    const hardened = compactMessageForBudget(current, {
      contentLimit: PERSISTED_BUDGET_HARD_MIN_CONTENT_LIMIT,
      reportLimit: PERSISTED_BUDGET_HARD_MIN_REPORT_LIMIT,
      logLinesLimit: PERSISTED_BUDGET_HARD_MIN_LOG_LINES,
      lineCharsLimit: PERSISTED_BUDGET_HARD_MIN_LOG_LINE_CHARS_LIMIT,
      argsCharsLimit: PERSISTED_BUDGET_HARD_MIN_TOOL_ARGS_CHARS_LIMIT,
      previewCharsLimit: PERSISTED_BUDGET_HARD_MIN_TOOL_PREVIEW_CHARS_LIMIT,
    });
    const minimal: AgentMessage = {
      ...hardened,
      content: hardened.content ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
      report: hardened.report ? PERSISTED_BUDGET_MINIMAL_REPORT : "",
      steps: hardened.steps?.map((step) => ({
        ...step,
        logs: step.logs.length > 0 ? [PERSISTED_BUDGET_MINIMAL_CONTENT] : [],
        toolRender: step.toolRender
          ? {
              ...step.toolRender,
              callArguments: step.toolRender.callArguments ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
              outcomePreview: step.toolRender.outcomePreview ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
            }
          : undefined,
      })),
    };
    const delta = estimatePersistedMessagePayloadSize(current) - estimatePersistedMessagePayloadSize(minimal);
    if (delta > 0) {
      persisted[index] = minimal;
      totalSize -= delta;
    }
  }

  return persisted;
}

function getMessageContentSnapshot(message: AgentMessage): string {
  return summarizeText(message.content);
}

function getPreviousArgsSnapshot(previousCallArgsByTool: Record<string, string>): string {
  const entries = Object.entries(previousCallArgsByTool);
  if (entries.length === 0) return "";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, args]) => `${tool}:${summarizeText(args)}`)
    .join("|");
}

function getMessageStepsSnapshot(message: AgentMessage): string {
  if (!message.steps || message.steps.length === 0) {
    return "";
  }

  return message.steps
    .map((step) => {
      const toolSnapshot = step.toolRender
        ? `${step.toolRender.toolName}:${step.toolRender.outcome}:${summarizeText(step.toolRender.outcomePreview)}`
        : "";
      const lastLog = step.logs.length > 0 ? step.logs[step.logs.length - 1] : "";
      return `${step.id}:${step.status}:${step.logs.length}:${summarizeText(lastLog)}:${toolSnapshot}`;
    })
    .join("|");
}

function getMessagePersistenceSignature(message: AgentMessage): string {
  const stepSnapshot = getMessageStepsSnapshot(message);
  return [
    message.id,
    message.role,
    message.status ?? "",
    summarizeText(message.content),
    summarizeText(message.report),
    stepSnapshot,
  ].join("#");
}

function buildPersistedThreadState(messages: AgentMessage[]): PersistedThreadState {
  return buildPersistedThreadStateFromPersisted(compactMessagesForPersistence(messages));
}

function buildPersistedThreadStateFromPersisted(messages: AgentMessage[]): PersistedThreadState {
  const order: string[] = [];
  const signatures: Record<string, string> = {};
  for (const message of messages) {
    order.push(message.id);
    signatures[message.id] = getMessagePersistenceSignature(message);
  }
  return { order, signatures };
}

function getPermissionSuggestionSummary(suggestions: PermissionSuggestion[]): string {
  if (suggestions.length === 0) return "";
  return suggestions.map((item) => item.summary).join(" | ");
}

function parseGitStatusEntry(line: string): { code: string; path: string } | null {
  const trimmed = line.trimEnd();
  if (!trimmed || trimmed.startsWith("##")) {
    return null;
  }
  if (trimmed.startsWith("?? ")) {
    return { code: "??", path: trimmed.slice(3) };
  }
  if (trimmed.length >= 3) {
    return { code: trimmed.slice(0, 2), path: trimmed.slice(3) };
  }
  return { code: "--", path: trimmed };
}

function deriveThreadNameFromQuery(query: string, fallback: string): string {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;

  const clauses = normalized
    .split(/[\r\n]+|[.!?;:,]+|[\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const leadingNoise =
    /^(?:please|pls|can you|could you|help me|i(?:\s+want|\s+need|\s+would like|\s+hope)?\s+to|\u8BF7|\u9EBB\u70E6|\u5E2E\u6211|\u6211(?:\u60F3|\u8981|\u9700\u8981|\u5E0C\u671B|\u5148)?|\u53EF\u4EE5|\u80FD\u4E0D\u80FD|\u7EE7\u7EED)\s*/i;

  const keywordPattern =
    /(\u4fee\u590d|\u4f18\u5316|\u8c03\u6574|\u5b9e\u73b0|\u652f\u6301|\u767b\u5f55|\u7ebf\u7a0b|\u5de5\u4f5c\u533a|\u66f4\u65b0|\u591a\u8bed\u8a00|\u4ed3\u5e93|git|ui|theme|bug|fix|optimi[sz]e|login|thread|workspace|sidebar|diff|panel|performance)/ig;

  const pickBestClause = () => {
    if (clauses.length === 0) return normalized;
    let best = clauses[0];
    let bestScore = -1;
    for (const clause of clauses) {
      const hits = clause.match(keywordPattern)?.length ?? 0;
      const score = hits * 10 + Math.min(clause.length, 40) / 10;
      if (score > bestScore) {
        best = clause;
        bestScore = score;
      }
    }
    return best;
  };

  let candidate = pickBestClause()
    .replace(/^[\-\s:,.!?\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A]+/g, "")
    .replace(/^[`"']+|[`"']+$/g, "")
    .trim();

  let previous = "";
  while (candidate && candidate !== previous) {
    previous = candidate;
    candidate = candidate.replace(leadingNoise, "").trim();
  }

  if (!candidate) {
    candidate = normalized;
  }

  const HARD_MAX_LENGTH = 14;
  if (candidate.length <= HARD_MAX_LENGTH) {
    return candidate;
  }

  const breakpoints = [
    candidate.lastIndexOf(" ", HARD_MAX_LENGTH),
    candidate.lastIndexOf("\uFF0C", HARD_MAX_LENGTH),
    candidate.lastIndexOf(",", HARD_MAX_LENGTH),
    candidate.lastIndexOf("\u3002", HARD_MAX_LENGTH),
    candidate.lastIndexOf("\uFF1A", HARD_MAX_LENGTH),
    candidate.lastIndexOf(":", HARD_MAX_LENGTH),
  ].filter((index) => index >= 10);

  const cut = breakpoints.length > 0 ? Math.max(...breakpoints) : HARD_MAX_LENGTH;
  return `${candidate.slice(0, cut).trim()}...`;
}
function buildThreadRiskInvestigationPrompt(thread: ThreadMetadata): string {
  const retry = thread.diagnostics?.retry;
  const suppressionRatioPct = typeof retry?.suppression_ratio_pct === "number" ? retry.suppression_ratio_pct : 0;
  const fallbackSuppressed = typeof retry?.fallback_suppressed === "number" ? retry.fallback_suppressed : 0;
  const fallbackUsed = typeof retry?.fallback_used === "number" ? retry.fallback_used : 0;
  const retryEvents = typeof retry?.retry_event_count === "number" ? retry.retry_event_count : 0;
  const reason = (retry?.last_suppressed_reason ?? "unknown").replace(/\s+/g, "_");
  const strategy = (retry?.last_retry_strategy ?? "unknown").replace(/\s+/g, "_");

  return [
    "/doctor fallback investigate",
    `thread=${thread.id}`,
    `suppression_ratio_pct=${suppressionRatioPct}`,
    `fallback_suppressed=${fallbackSuppressed}`,
    `fallback_used=${fallbackUsed}`,
    `retry_events=${retryEvents}`,
    `last_reason=${reason}`,
    `last_strategy=${strategy}`,
    "analyze root cause and propose minimal safe fix plan",
  ].join(" ");
}

function toThreadDiagnosisActivity(
  state: TraceQuickCommandState | null,
): ThreadDiagnosisActivity | undefined {
  if (!state) {
    return undefined;
  }
  return {
    kind: state.kind,
    status: state.status,
    command: state.command,
    at: state.at,
    command_id: state.commandId ?? null,
  };
}

function fromThreadDiagnosisActivity(
  activity: ThreadDiagnosisActivity | null | undefined,
): TraceQuickCommandState | null {
  if (!activity) {
    return null;
  }
  if (
    !TRACE_QUICK_COMMAND_KIND_SET.has(activity.kind as TraceQuickCommandKind) ||
    !TRACE_QUICK_COMMAND_STATUS_SET.has(activity.status as TraceQuickCommandStatus)
  ) {
    return null;
  }
  const command = activity.command?.trim() ?? "";
  if (!command || !Number.isFinite(activity.at)) {
    return null;
  }
  return {
    kind: activity.kind as TraceQuickCommandKind,
    status: activity.status as TraceQuickCommandStatus,
    command,
    at: activity.at,
    commandId: activity.command_id ?? undefined,
  };
}

function fromThreadDiagnosisHistory(
  history: ThreadDiagnosisActivity[] | null | undefined,
): TraceQuickCommandState[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }
  const next: TraceQuickCommandState[] = [];
  for (const item of history) {
    const parsed = fromThreadDiagnosisActivity(item);
    if (!parsed) continue;
    next.push(parsed);
  }
  return next
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_DIAGNOSIS_HISTORY_ITEMS);
}

function ellipsizeDisplayName(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return text;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function getStatusDotClass({
  hasConnection,
  isStalled,
  hasActiveWork,
  queuedCount,
  queueLimit,
}: {
  hasConnection: boolean;
  isStalled: boolean;
  hasActiveWork: boolean;
  queuedCount: number;
  queueLimit: number;
}) {
  if (!hasConnection) return "bg-red-500";
  if (isStalled) return "bg-red-500 animate-pulse";
  if (queueLimit > 0 && queuedCount >= queueLimit) return "bg-red-500 animate-pulse";
  if (queueLimit > 0 && queuedCount >= Math.ceil(queueLimit * 0.75)) return "bg-amber-500 animate-pulse";
  if (hasActiveWork) return "bg-amber-500 animate-pulse";
  if (queuedCount > 0) return "bg-yellow-500";
  return "bg-green-500";
}

function useStallInfo(hasActiveWork: boolean, lastActivityAt: number) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!hasActiveWork) {
      setTick(Date.now());
      return;
    }
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, STATUS_TICK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [hasActiveWork]);

  return useMemo(() => {
    if (!hasActiveWork) {
      return { stallSeconds: 0, isStalled: false };
    }
    const stallSeconds = Math.max(0, Math.floor((tick - lastActivityAt) / 1000));
    return {
      stallSeconds,
      isStalled: stallSeconds >= STATUS_STALL_THRESHOLD_SECONDS,
    };
  }, [hasActiveWork, tick, lastActivityAt]);
}

function formatContinueReason(locale: AppLocale, transition: Continue | null): string | null {
  if (!transition) return null;
  if (transition.reason === "tool_results") {
    return translate(locale, "agent.continue.toolResults");
  }
  if (transition.reason === "fallback_retry") {
    return translate(locale, "agent.continue.fallbackRetry", { model: transition.fallbackModel });
  }
  if (transition.reason === "token_budget_continuation") {
    return translate(locale, "agent.continue.tokenBudget", { attempt: transition.attempt });
  }
  if (transition.reason === "stop_hook_retry") {
    return translate(locale, "agent.continue.stopHookRetry", { attempt: transition.attempt });
  }
  return null;
}

function formatTerminalReason(locale: AppLocale, reason: QueryTerminal["reason"]): string {
  switch (reason) {
    case "completed":
      return translate(locale, "agent.trace.terminal.completed");
    case "aborted":
      return translate(locale, "agent.trace.terminal.aborted");
    case "stop_hook_prevented":
      return translate(locale, "agent.trace.terminal.stopHookPrevented");
    case "max_iterations":
      return translate(locale, "agent.trace.terminal.maxIterations");
    case "error":
      return translate(locale, "agent.trace.terminal.error");
    default:
      return String(reason);
  }
}

function formatRetryStrategyLabel(locale: AppLocale, strategy: string | undefined): string {
  if (!strategy) {
    return translate(locale, "agent.trace.retryStrategy.balanced");
  }
  return translate(locale, `agent.trace.retryStrategy.${strategy}`);
}

function formatFallbackSuppressedReasonLabel(locale: AppLocale, reason: string | null | undefined): string {
  if (!reason) {
    return "unknown";
  }
  const key = `agent.trace.fallbackSuppressedReason.${reason}`;
  const resolved = translate(locale, key);
  return resolved === key ? reason : resolved;
}

function formatCommandLifecycleStateLabel(
  locale: AppLocale,
  state: Extract<QueryStreamEvent, { type: "command_lifecycle" }>["state"],
): string {
  return translate(locale, `agent.trace.commandLifecycle.state.${state}`);
}

function formatQueuePriorityLabel(
  locale: AppLocale,
  priority: Extract<QueryStreamEvent, { type: "queue_update" }>["priority"],
): string {
  if (!priority) {
    return "";
  }
  return translate(locale, `agent.queue.priority.${priority}`);
}

function formatLatestTraceEventLabel(locale: AppLocale, event: QueryStreamEvent | null): string | null {
  if (!event) return null;
  switch (event.type) {
    case "prompt_compiled":
      {
        const baseLine = translate(locale, "agent.trace.event.promptCompiled", {
          staticSections: event.staticSections,
          dynamicSections: event.dynamicSections,
          staticChars: event.staticChars,
          dynamicChars: event.dynamicChars,
          totalChars: event.totalChars,
        });
        const suffix: string[] = [];
        if (event.staticHash && event.dynamicHash) {
          suffix.push(`hash=${event.staticHash}/${event.dynamicHash}`);
        }
        if (Array.isArray(event.modelLaunchTags) && event.modelLaunchTags.length > 0) {
          suffix.push(`tags=${event.modelLaunchTags.join(",")}`);
        }
        if (suffix.length === 0) {
          return baseLine;
        }
        return `${baseLine} | ${suffix.join(" | ")}`;
      }
    case "query_start": {
      if (
        event.lane === undefined &&
        event.retryMax === undefined &&
        event.fallbackEnabled === undefined &&
        event.retryStrategy === undefined
      ) {
        return translate(locale, "agent.trace.event.queryStart", {
          model: event.model,
          queueCount: event.queueCount,
        });
      }
      const laneLabel = translate(locale, `agent.trace.queryLane.${event.lane ?? "foreground"}`);
      const retries = typeof event.retryMax === "number" ? String(event.retryMax) : "-";
      const fallbackLabel = translate(locale, `agent.trace.queryFallback.${event.fallbackEnabled ? "on" : "off"}`);
      const baseLine = translate(locale, "agent.trace.event.queryStartDetailed", {
        model: event.model,
        queueCount: event.queueCount,
        lane: laneLabel,
        retries,
        fallback: fallbackLabel,
      });
      if (!event.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatRetryStrategyLabel(locale, event.retryStrategy);
      return `${baseLine} | ${translate(locale, "agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "iteration_start":
      return translate(locale, "agent.trace.event.iterationStart", {
        iteration: event.iteration,
        model: event.model,
      });
    case "retry_attempt": {
      const laneLabel = translate(locale, `agent.trace.queryLane.${event.lane ?? "foreground"}`);
      const baseLine = translate(locale, "agent.trace.event.retryAttempt", {
        iteration: event.iteration,
        model: event.model,
        lane: laneLabel,
        attempt: event.attempt,
        delaySec: (event.nextDelayMs / 1000).toFixed(1),
        reason: event.reason,
      });
      if (!event.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatRetryStrategyLabel(locale, event.retryStrategy);
      return `${baseLine} | ${translate(locale, "agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "retry_profile_update":
      return translate(locale, "agent.trace.event.retryProfileUpdate", {
        lane: translate(locale, `agent.trace.queryLane.${event.lane}`),
        queue: event.queueCount,
        retries: event.retryMax,
        fallback: translate(locale, `agent.trace.queryFallback.${event.fallbackEnabled ? "on" : "off"}`),
        strategy: formatRetryStrategyLabel(locale, event.retryStrategy),
        reason: translate(locale, `agent.trace.retryProfileReason.${event.reason}`),
      });
    case "fallback_suppressed":
      return translate(locale, "agent.trace.event.fallbackSuppressed", {
        iteration: event.iteration,
        model: event.model,
        lane: translate(locale, `agent.trace.queryLane.${event.lane}`),
        reason: translate(locale, `agent.trace.fallbackSuppressedReason.${event.reason}`),
        strategy: formatRetryStrategyLabel(locale, event.retryStrategy),
      });
    case "tool_batch_start":
      return translate(locale, "agent.trace.event.toolBatchStart", {
        iteration: event.iteration,
        count: event.count,
      });
    case "tool_batch_complete":
      return translate(locale, "agent.trace.event.toolBatchComplete", {
        count: event.count,
        errorCount: event.errorCount,
      });
    case "tool_result":
      return translate(locale, "agent.trace.event.toolResult", {
        tool: event.tool,
        outcome: translate(locale, `agent.trace.toolOutcome.${event.outcome}`),
      });
    case "tool_retry_guard":
      return translate(locale, "agent.trace.event.toolRetryGuard", {
        tool: event.tool,
        streak: event.streak,
      });
    case "continue":
      return translate(locale, "agent.trace.event.continue", {
        reason: formatContinueReason(locale, event.transition) ?? event.transition.reason,
      });
    case "stop_hook_review":
      return translate(locale, "agent.trace.event.stopHookReview", {
        notes: event.noteCount,
        continuation: event.continuationCount,
      });
    case "permission_decision":
      {
        const baseLine = translate(locale, "agent.trace.event.permissionDecision", {
          behavior: event.behavior,
          tool: event.tool,
          reason: event.reason,
        });
        const risk = getTracePermissionRisk(event);
        if (!risk) {
          return baseLine;
        }
        const riskLabel = translate(locale, `agent.trace.permissionRisk.${risk}`);
        return `${baseLine} | ${translate(locale, "agent.trace.permissionRiskLabel", {
          risk: riskLabel,
        })}`;
      }
    case "permission_risk_profile":
      return translate(locale, "agent.trace.event.permissionRiskProfile", {
        tool: event.tool,
        risk: event.riskClass
          ? translate(locale, `agent.trace.permissionRisk.${event.riskClass}`)
          : translate(locale, "agent.trace.permissionRisk.policy"),
        reversibility: translate(locale, `agent.permission.prompt.reversibility.${event.reversibility}`),
        blastRadius: translate(locale, `agent.permission.prompt.blastRadius.${event.blastRadius}`),
      });
    case "authorization_scope_notice":
      return translate(locale, "agent.trace.event.authorizationScope", {
        tool: event.tool,
        risk: translate(locale, `agent.trace.permissionRisk.${event.riskClass}`),
        count: event.priorApprovals,
      });
    case "queue_update": {
      const reasonLabel = event.reason
        ? translate(locale, `agent.trace.queueReason.${event.reason}`)
        : "";
      const priorityLabel = formatQueuePriorityLabel(locale, event.priority);
      return translate(locale, "agent.trace.event.queueUpdate", {
        action: translate(locale, `agent.trace.queueAction.${event.action}`),
        queueCount: event.queueCount,
        queueLimit: event.queueLimit,
        reason: `${priorityLabel ? ` [${priorityLabel}]` : ""}${reasonLabel ? ` (${reasonLabel})` : ""}`,
      });
    }
    case "command_lifecycle":
      return translate(locale, "agent.trace.event.commandLifecycle", {
        state: formatCommandLifecycleStateLabel(locale, event.state),
        command: event.command,
      });
    case "query_end":
      return translate(locale, "agent.trace.event.queryEnd", {
        terminalReason: formatTerminalReason(locale, event.terminalReason),
        durationSec: (event.durationMs / 1000).toFixed(1),
      });
    default:
      return translate(locale, "agent.trace.event.unknown");
  }
}

function formatTraceEventTime(locale: AppLocale, at: number): string {
  const languageTag = locale === "zh-CN" ? "zh-CN" : "en-US";
  try {
    return new Intl.DateTimeFormat(languageTag, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleTimeString();
  }
}

type TraceFilter = "all" | "queue" | "tools" | "permission" | "query" | "prompt" | "retry" | "continue";
type TraceCategory = Exclude<TraceFilter, "all">;
type TraceHotspotWindow = "runs3" | "runs6" | "all";
type TracePermissionRiskFilter = "all" | PermissionRiskClass;
type PermissionReversibilityLevel = "reversible" | "mixed" | "hard_to_reverse";
type PermissionBlastRadiusLevel = "local" | "workspace" | "shared";
type TracePermissionReversibilityFilter = "all" | PermissionReversibilityLevel;
type TracePermissionBlastRadiusFilter = "all" | PermissionBlastRadiusLevel;
type TracePermissionRiskCounts = Record<PermissionRiskClass, number>;
type TracePermissionReversibilityCounts = Record<PermissionReversibilityLevel, number>;
type TracePermissionBlastRadiusCounts = Record<PermissionBlastRadiusLevel, number>;
type TraceQueuePriority = NonNullable<Extract<QueryStreamEvent, { type: "queue_update" }>["priority"]>;
type TraceQueuePressure = "idle" | "busy" | "congested" | "saturated";
const TRACE_HOTSPOT_WINDOW_OPTIONS: Array<{ key: TraceHotspotWindow; runCount: number | null }> = [
  { key: "runs3", runCount: 3 },
  { key: "runs6", runCount: 6 },
  { key: "all", runCount: null },
];
const TRACE_CATEGORY_ORDER: TraceCategory[] = [
  "query",
  "prompt",
  "tools",
  "permission",
  "queue",
  "retry",
  "continue",
];

function getTraceEventFilter(event: QueryStreamEvent): Exclude<TraceFilter, "all"> {
  switch (event.type) {
    case "queue_update":
      return "queue";
    case "tool_result":
      return "tools";
    case "tool_retry_guard":
      return "retry";
    case "tool_batch_start":
    case "tool_batch_complete":
      return "tools";
    case "permission_decision":
    case "permission_risk_profile":
    case "authorization_scope_notice":
      return "permission";
    case "retry_attempt":
    case "retry_profile_update":
    case "fallback_suppressed":
      return "retry";
    case "continue":
      return "continue";
    case "stop_hook_review":
      return "continue";
    case "prompt_compiled":
      return "prompt";
    case "command_lifecycle":
      return "query";
    case "query_start":
    case "iteration_start":
    case "query_end":
    default:
      return "query";
  }
}

function getTraceEventSeverity(event: QueryStreamEvent): "info" | "warn" | "error" {
  if (event.type === "tool_result") {
    if (event.outcome === "error") {
      return "error";
    }
    if (event.outcome === "rejected") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "query_end") {
    if (
      event.terminalReason === "error" ||
      event.terminalReason === "max_iterations" ||
      event.terminalReason === "stop_hook_prevented"
    ) {
      return "error";
    }
    if (event.terminalReason === "aborted") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "command_lifecycle") {
    if (event.state === "failed") {
      return "error";
    }
    if (event.state === "aborted") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "retry_attempt") {
    return event.attempt >= 2 ? "warn" : "info";
  }
  if (event.type === "retry_profile_update") {
    return event.reason === "load_shed" ? "warn" : "info";
  }
  if (event.type === "fallback_suppressed") {
    return "warn";
  }

  if (event.type === "tool_retry_guard") {
    return "warn";
  }

  if (event.type === "stop_hook_review") {
    return event.continuationCount > 0 ? "warn" : "info";
  }

  if (event.type === "authorization_scope_notice") {
    return "warn";
  }
  if (event.type === "permission_risk_profile") {
    if (event.reversibility === "hard_to_reverse" || event.blastRadius === "shared") {
      return "warn";
    }
    return "info";
  }

  if (event.type === "tool_batch_complete" && event.errorCount > 0) {
    return "warn";
  }

  if (event.type === "permission_decision" && event.behavior === "deny") {
    return "warn";
  }

  if (event.type === "queue_update" && event.action === "rejected") {
    return "warn";
  }

  return "info";
}

function getTraceSeverityRowClass(severity: "info" | "warn" | "error"): string {
  if (severity === "error") {
    return "border-destructive/40 bg-destructive/10";
  }
  if (severity === "warn") {
    return "border-amber-500/40 bg-amber-500/10";
  }
  return "border-border/30 bg-muted/15";
}

function getTraceSeverityBadgeClass(severity: "info" | "warn" | "error"): string {
  if (severity === "error") {
    return "border border-destructive/50 bg-destructive/10 text-destructive";
  }
  if (severity === "warn") {
    return "border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-300";
  }
  return "border border-border/40 bg-background/70 text-muted-foreground/80";
}

interface TraceRunGroup {
  id: string;
  runIndex: number;
  events: QueryStreamEvent[];
  startedAt: number;
  endedAt: number;
  hasQueryEnd: boolean;
  terminalReason?: QueryTerminal["reason"];
}

interface VisibleTraceRun extends TraceRunGroup {
  visibleEvents: QueryStreamEvent[];
  visibleWarningCount: number;
  visibleErrorCount: number;
  categoryCounts: Record<TraceCategory, number>;
}

function mapCommandLifecycleTerminalReason(
  event: Extract<QueryStreamEvent, { type: "command_lifecycle" }>,
): QueryTerminal["reason"] | undefined {
  if (event.state === "completed") {
    return "completed";
  }
  if (event.state === "aborted") {
    return "aborted";
  }
  if (event.state === "failed") {
    return "error";
  }
  return undefined;
}

function buildTraceRunGroups(events: QueryStreamEvent[]): TraceRunGroup[] {
  if (events.length === 0) {
    return [];
  }

  const groups: TraceRunGroup[] = [];
  let current: TraceRunGroup | null = null;
  let sequence = 0;

  const ensureCurrent = (at: number) => {
    if (!current) {
      sequence += 1;
      current = {
        id: `trace-run-${sequence}-${at}`,
        runIndex: sequence,
        events: [],
        startedAt: at,
        endedAt: at,
        hasQueryEnd: false,
      };
    }
  };

  for (const event of events) {
    if (event.type === "query_start") {
      if (
        current &&
        current.events.length === 1 &&
        current.events[0]?.type === "command_lifecycle" &&
        current.events[0].state === "started"
      ) {
        current.events.push(event);
        current.endedAt = event.at;
        continue;
      }
      if (current && current.events.length > 0) {
        groups.push(current);
      }
      sequence += 1;
      current = {
        id: `trace-run-${sequence}-${event.at}`,
        runIndex: sequence,
        events: [event],
        startedAt: event.at,
        endedAt: event.at,
        hasQueryEnd: false,
      };
      continue;
    }

    ensureCurrent(event.at);
    const active = current as TraceRunGroup;
    active.events.push(event);
    active.endedAt = event.at;

    if (event.type === "query_end") {
      active.hasQueryEnd = true;
      active.terminalReason = event.terminalReason;
      continue;
    }
    if (event.type === "command_lifecycle") {
      const lifecycleTerminalReason = mapCommandLifecycleTerminalReason(event);
      if (lifecycleTerminalReason && !active.terminalReason) {
        active.terminalReason = lifecycleTerminalReason;
      }
    }
  }

  if (current && current.events.length > 0) {
    groups.push(current);
  }

  return groups;
}

function createEmptyTraceCategoryCounts(): Record<TraceCategory, number> {
  return {
    query: 0,
    prompt: 0,
    tools: 0,
    permission: 0,
    queue: 0,
    retry: 0,
    continue: 0,
  };
}

function createEmptyTraceQueuePriorityCounts(): Record<TraceQueuePriority, number> {
  return {
    now: 0,
    next: 0,
    later: 0,
  };
}

interface TraceQueuePriorityStats {
  total: number;
  queued: Record<TraceQueuePriority, number>;
  dequeued: Record<TraceQueuePriority, number>;
  rejected: Record<TraceQueuePriority, number>;
  latestQueueDepth: number;
  maxQueueDepth: number;
  pressure: TraceQueuePressure;
}

function deriveQueuePressure(depth: number, queueLimit: number): TraceQueuePressure {
  const normalizedDepth = Math.max(0, depth);
  if (normalizedDepth <= 0) {
    return "idle";
  }
  if (queueLimit > 0) {
    const ratio = normalizedDepth / queueLimit;
    if (ratio >= 1) {
      return "saturated";
    }
    if (ratio >= 0.75) {
      return "congested";
    }
    return "busy";
  }
  if (normalizedDepth >= 8) {
    return "saturated";
  }
  if (normalizedDepth >= 4) {
    return "congested";
  }
  return "busy";
}

function buildTraceQueuePriorityStats(
  events: QueryStreamEvent[],
  queueLimit: number,
): TraceQueuePriorityStats {
  const stats: TraceQueuePriorityStats = {
    total: 0,
    queued: createEmptyTraceQueuePriorityCounts(),
    dequeued: createEmptyTraceQueuePriorityCounts(),
    rejected: createEmptyTraceQueuePriorityCounts(),
    latestQueueDepth: 0,
    maxQueueDepth: 0,
    pressure: "idle",
  };
  for (const event of events) {
    if (event.type !== "queue_update") {
      continue;
    }
    stats.latestQueueDepth = Math.max(0, event.queueCount);
    if (event.queueCount > stats.maxQueueDepth) {
      stats.maxQueueDepth = event.queueCount;
    }
    if (event.priority) {
      stats[event.action][event.priority] += 1;
      stats.total += 1;
    }
  }
  const pressureDepth = Math.max(stats.latestQueueDepth, stats.maxQueueDepth);
  stats.pressure = deriveQueuePressure(pressureDepth, queueLimit);
  return stats;
}

function computeTraceAggregates(events: QueryStreamEvent[]) {
  const visibleWarningCount = events.reduce((count, event) => {
    return getTraceEventSeverity(event) === "warn" ? count + 1 : count;
  }, 0);
  const visibleErrorCount = events.reduce((count, event) => {
    return getTraceEventSeverity(event) === "error" ? count + 1 : count;
  }, 0);
  const categoryCounts = events.reduce((acc, event) => {
    const category = getTraceEventFilter(event);
    acc[category] += 1;
    return acc;
  }, createEmptyTraceCategoryCounts());
  return {
    visibleWarningCount,
    visibleErrorCount,
    categoryCounts,
  };
}

function isTraceEventToolMatched(event: QueryStreamEvent, toolName: string): boolean {
  if (event.type === "tool_result") {
    return event.tool === toolName;
  }
  if (event.type === "permission_decision") {
    return event.tool === toolName;
  }
  if (event.type === "permission_risk_profile") {
    return event.tool === toolName;
  }
  if (event.type === "tool_retry_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return false;
}

function includeTraceEventForToolFocus(event: QueryStreamEvent, toolName: string): boolean {
  if (event.type === "tool_result") {
    return event.tool === toolName;
  }
  if (event.type === "permission_decision") {
    return event.tool === toolName;
  }
  if (event.type === "permission_risk_profile") {
    return event.tool === toolName;
  }
  if (event.type === "tool_retry_guard") {
    return event.tool === toolName;
  }
  if (event.type === "authorization_scope_notice") {
    return event.tool === toolName;
  }
  return true;
}

function getTraceCategoryBarClass(category: TraceCategory): string {
  switch (category) {
    case "query":
      return "bg-primary/60";
    case "prompt":
      return "bg-violet-500/70";
    case "tools":
      return "bg-emerald-500/70";
    case "permission":
      return "bg-amber-500/70";
    case "queue":
      return "bg-sky-500/70";
    case "retry":
      return "bg-orange-500/75";
    case "continue":
      return "bg-fuchsia-500/70";
    default:
      return "bg-border/70";
  }
}

function getTraceCategoryChipClass(category: TraceCategory): string {
  switch (category) {
    case "query":
      return "border-primary/35 bg-primary/10 text-primary";
    case "prompt":
      return "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "tools":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "permission":
      return "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300";
    case "queue":
      return "border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-300";
    case "retry":
      return "border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "continue":
      return "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300";
    default:
      return "border-border/35 bg-background/70 text-muted-foreground/80";
  }
}

function getTracePermissionRisk(event: QueryStreamEvent): PermissionRiskClass | null {
  if (event.type === "permission_decision") {
    return event.riskClass ?? "policy";
  }
  if (event.type === "permission_risk_profile") {
    return event.riskClass ?? "policy";
  }
  if (event.type === "authorization_scope_notice") {
    return event.riskClass;
  }
  return null;
}

function getTracePermissionReversibility(event: QueryStreamEvent): PermissionReversibilityLevel | null {
  if (event.type === "permission_risk_profile") {
    return event.reversibility;
  }
  return null;
}

function getTracePermissionBlastRadius(event: QueryStreamEvent): PermissionBlastRadiusLevel | null {
  if (event.type === "permission_risk_profile") {
    return event.blastRadius;
  }
  return null;
}

function getTracePermissionRiskBadgeClass(risk: PermissionRiskClass): string {
  switch (risk) {
    case "critical":
      return "border-destructive/60 bg-destructive/10 text-destructive";
    case "high_risk":
      return "border-amber-500/55 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "interactive":
      return "border-fuchsia-500/55 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
    case "path_outside":
      return "border-sky-500/55 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "policy":
    default:
      return "border-border/45 bg-background/70 text-muted-foreground/90";
  }
}

function getTracePermissionReversibilityBadgeClass(
  value: PermissionReversibilityLevel,
): string {
  switch (value) {
    case "hard_to_reverse":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "mixed":
      return "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "reversible":
    default:
      return "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
}

function getTracePermissionBlastRadiusBadgeClass(
  value: PermissionBlastRadiusLevel,
): string {
  switch (value) {
    case "shared":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "workspace":
      return "border-sky-500/45 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "local":
    default:
      return "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
}

type PermissionRiskAdvice = "confirm" | "boundary" | "interactive" | "review";

function getPermissionReversibilityLevel(
  riskClass: PermissionRiskClass | undefined,
): PermissionReversibilityLevel {
  switch (riskClass) {
    case "critical":
    case "high_risk":
      return "hard_to_reverse";
    case "interactive":
    case "path_outside":
      return "mixed";
    case "policy":
    default:
      return "reversible";
  }
}

function getPermissionBlastRadiusLevel(
  riskClass: PermissionRiskClass | undefined,
): PermissionBlastRadiusLevel {
  switch (riskClass) {
    case "critical":
    case "high_risk":
      return "shared";
    case "interactive":
      return "workspace";
    case "path_outside":
      return "shared";
    case "policy":
    default:
      return "local";
  }
}

function getPermissionRiskAdviceKey(riskClass: PermissionRiskClass | undefined): PermissionRiskAdvice {
  switch (riskClass) {
    case "critical":
    case "high_risk":
      return "confirm";
    case "path_outside":
      return "boundary";
    case "interactive":
      return "interactive";
    case "policy":
    default:
      return "review";
  }
}

function createEmptyTracePermissionRiskCounts(): TracePermissionRiskCounts {
  return {
    critical: 0,
    high_risk: 0,
    interactive: 0,
    path_outside: 0,
    policy: 0,
  };
}

function createEmptyTracePermissionReversibilityCounts(): TracePermissionReversibilityCounts {
  return {
    reversible: 0,
    mixed: 0,
    hard_to_reverse: 0,
  };
}

function createEmptyTracePermissionBlastRadiusCounts(): TracePermissionBlastRadiusCounts {
  return {
    local: 0,
    workspace: 0,
    shared: 0,
  };
}

function getDominantTracePermissionReversibility(
  counts: TracePermissionReversibilityCounts,
): PermissionReversibilityLevel | null {
  const entries: Array<[PermissionReversibilityLevel, number]> = [
    ["hard_to_reverse", counts.hard_to_reverse],
    ["mixed", counts.mixed],
    ["reversible", counts.reversible],
  ];
  const top = entries.find(([, count]) => count > 0);
  return top?.[0] ?? null;
}

function getDominantTracePermissionBlastRadius(
  counts: TracePermissionBlastRadiusCounts,
): PermissionBlastRadiusLevel | null {
  const entries: Array<[PermissionBlastRadiusLevel, number]> = [
    ["shared", counts.shared],
    ["workspace", counts.workspace],
    ["local", counts.local],
  ];
  const top = entries.find(([, count]) => count > 0);
  return top?.[0] ?? null;
}

function getReversibilityMatrixScore(value: PermissionReversibilityLevel): number {
  switch (value) {
    case "hard_to_reverse":
      return 3;
    case "mixed":
      return 2;
    case "reversible":
    default:
      return 1;
  }
}

function getBlastRadiusMatrixScore(value: PermissionBlastRadiusLevel): number {
  switch (value) {
    case "shared":
      return 3;
    case "workspace":
      return 2;
    case "local":
    default:
      return 1;
  }
}

function summarizePromptGovernance(sectionMetadata: PromptCompiledSectionMetadata[]) {
  const ownerCounts = {
    core: 0,
    safeguards: 0,
    runtime: 0,
  };
  let immutableCount = 0;
  let modelLaunchCount = 0;
  for (const section of sectionMetadata) {
    ownerCounts[section.owner] += 1;
    if (!section.mutable) {
      immutableCount += 1;
    }
    if (section.modelLaunchTag) {
      modelLaunchCount += 1;
    }
  }
  return {
    ownerCounts,
    immutableCount,
    modelLaunchCount,
  };
}

interface ActivityStatusBadgesProps {
  hasConnection: boolean;
  hasActiveWork: boolean;
  queuedCount: number;
  queueLimit: number;
  queueByPriority: Readonly<Record<QueuePriority, number>>;
  runningTaskCount: number;
  statusLabel: string;
  queuePriorityCaption: string;
  queuePriorityNowLabel: string;
  queuePriorityNextLabel: string;
  queuePriorityLaterLabel: string;
  queuePressureCaption: string;
  queuePressureIdleLabel: string;
  queuePressureBusyLabel: string;
  queuePressureCongestedLabel: string;
  queuePressureSaturatedLabel: string;
  lastActivityAt: number;
  stalledLabel: string;
  continueLabel: string | null;
  continueCaption: string;
  retryDiagnosticLabel: string | null;
  retryDiagnosticCaption: string;
  retryDiagnosticWarn: boolean;
  retryDiagnosticHint: string;
  onRetryDiagnosticClick?: (() => void) | null;
  latestEventLabel: string | null;
  latestEventCaption: string;
}

const ActivityStatusBadges = memo(function ActivityStatusBadges({
  hasConnection,
  hasActiveWork,
  queuedCount,
  queueLimit,
  queueByPriority,
  runningTaskCount,
  statusLabel,
  queuePriorityCaption,
  queuePriorityNowLabel,
  queuePriorityNextLabel,
  queuePriorityLaterLabel,
  queuePressureCaption,
  queuePressureIdleLabel,
  queuePressureBusyLabel,
  queuePressureCongestedLabel,
  queuePressureSaturatedLabel,
  lastActivityAt,
  stalledLabel,
  continueLabel,
  continueCaption,
  retryDiagnosticLabel,
  retryDiagnosticCaption,
  retryDiagnosticWarn,
  retryDiagnosticHint,
  onRetryDiagnosticClick,
  latestEventLabel,
  latestEventCaption,
}: ActivityStatusBadgesProps) {
  const { stallSeconds, isStalled } = useStallInfo(hasActiveWork, lastActivityAt);
  const hasQueuePriorityBreakdown =
    hasConnection &&
    (queueByPriority.now > 0 || queueByPriority.next > 0 || queueByPriority.later > 0);
  const queuePressure = deriveQueuePressure(queuedCount, queueLimit);
  const queuePressureLabel =
    queuePressure === "saturated"
      ? queuePressureSaturatedLabel
      : queuePressure === "congested"
        ? queuePressureCongestedLabel
        : queuePressure === "busy"
          ? queuePressureBusyLabel
          : queuePressureIdleLabel;
  const showQueuePressureHint = hasConnection && queuePressure !== "idle";
  const statusDotClass = getStatusDotClass({
    hasConnection,
    isStalled,
    hasActiveWork,
    queuedCount,
    queueLimit,
  });

  return (
    <>
      <Badge variant="outline" className="h-6 px-2 text-[11px] border-border/50 text-foreground/80 bg-background">
        <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", statusDotClass)} />
        {statusLabel}
        {hasConnection && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">
            {queueLimit > 0 ? `Q${queuedCount}/${queueLimit}` : `Q${queuedCount}`} T{runningTaskCount}
          </span>
        )}
      </Badge>
      {hasQueuePriorityBreakdown && (
        <Badge variant="outline" className="h-6 px-2 text-[11px] border-border/50 text-muted-foreground bg-background/95">
          <span className="mr-1 text-[10px] uppercase tracking-wide">{queuePriorityCaption}</span>
          <span className="font-mono text-[10px]">
            {queuePriorityNowLabel}:{queueByPriority.now} {queuePriorityNextLabel}:{queueByPriority.next}{" "}
            {queuePriorityLaterLabel}:{queueByPriority.later}
          </span>
        </Badge>
      )}
      {showQueuePressureHint && (
        <Badge
          variant="outline"
          className={cn(
            "h-6 px-2 text-[11px] bg-background/95",
            queuePressure === "saturated"
              ? "border-red-500/40 text-red-600 dark:text-red-300"
              : queuePressure === "congested"
                ? "border-amber-500/40 text-amber-600 dark:text-amber-300"
                : "border-yellow-500/40 text-yellow-600 dark:text-yellow-300",
          )}
        >
          <span className="mr-1 text-[10px] uppercase tracking-wide">{queuePressureCaption}</span>
          <span className="font-mono text-[10px]">{queuePressureLabel}</span>
        </Badge>
      )}
      {isStalled && (
        <Badge
          variant="outline"
          className="h-6 px-2 text-[11px] border-red-500/40 text-red-500 bg-red-500/5 animate-pulse"
        >
          <AlertTriangle size={10} className="mr-1" /> {stalledLabel} {stallSeconds}s
        </Badge>
      )}
      {continueLabel && (
        <Badge
          variant="outline"
          className="h-6 px-2 text-[11px] border-border/50 text-muted-foreground bg-background/95"
        >
          <span className="mr-1 text-[10px] uppercase tracking-wide">{continueCaption}</span>
          <span className="font-mono text-[10px]">{continueLabel}</span>
        </Badge>
      )}
      {retryDiagnosticLabel && (
        <Badge
          variant="outline"
          className={cn(
            "h-6 max-w-[360px] px-2 text-[11px] bg-background/95",
            retryDiagnosticWarn
              ? "border-amber-500/40 text-amber-600 dark:text-amber-300"
              : "border-border/50 text-muted-foreground",
            onRetryDiagnosticClick && "cursor-pointer hover:bg-muted/70",
          )}
          title={onRetryDiagnosticClick ? retryDiagnosticHint : retryDiagnosticLabel}
          onClick={() => {
            onRetryDiagnosticClick?.();
          }}
        >
          <span className="mr-1 text-[10px] uppercase tracking-wide">{retryDiagnosticCaption}</span>
          <span className="truncate font-mono text-[10px]">{retryDiagnosticLabel}</span>
        </Badge>
      )}
      {latestEventLabel && (
        <Badge
          variant="outline"
          className="h-6 max-w-[360px] px-2 text-[11px] border-border/50 text-muted-foreground bg-background/95"
          title={latestEventLabel}
        >
          <span className="mr-1 text-[10px] uppercase tracking-wide">{latestEventCaption}</span>
          <span className="truncate font-mono text-[10px]">{latestEventLabel}</span>
        </Badge>
      )}
    </>
  );
});

interface ThinkingIndicatorProps {
  isThinking: boolean;
  lastActivityAt: number;
  label: string;
  stalledLabel: string;
}

const ThinkingIndicator = memo(function ThinkingIndicator({
  isThinking,
  lastActivityAt,
  label,
  stalledLabel,
}: ThinkingIndicatorProps) {
  const { stallSeconds, isStalled } = useStallInfo(isThinking, lastActivityAt);

  if (!isThinking) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col space-y-2 py-3",
        isStalled ? "opacity-90" : "opacity-50 animate-pulse",
      )}
    >
      <div className="h-px w-full bg-border/20" />
      <div className="flex items-center gap-3">
        <div className={cn("h-1.5 w-1.5 rounded-full", isStalled ? "bg-red-500" : "bg-primary")} />
        <span className="text-[12px] text-muted-foreground">
          {label}
        </span>
        {isStalled && (
          <span className="rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-500">
            {stalledLabel.replace("{seconds}", String(stallSeconds))}
          </span>
        )}
      </div>
    </div>
  );
});

export default function AgentWorkstationView({
  apiConfig,
  isSiderVisible = true,
  userInfo,
  onRefreshUserInfo,
}: AgentWorkstationViewProps) {
  const { locale } = useLocaleStore();
  const defaultTaskName = translate(locale, "agent.newTask");
  const [input, setInput] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [currentModel, setCurrentModel] = useState<string>("deepseek-ai/DeepSeek-V3");
  const [permissionMode, setPermissionMode] = useState<ToolPermissionMode>("default");
  const [permissionRules, setPermissionRules] = useState<PermissionRule[]>([]);
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [permissionQueue, setPermissionQueue] = useState<PermissionPromptQueueItem[]>([]);
  const [permissionDelayReady, setPermissionDelayReady] = useState(false);

  // Thread management states
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentThreadName, setCurrentThreadName] = useState(defaultTaskName);
  const [currentThreadWorkingDir, setCurrentThreadWorkingDir] = useState<string | undefined>(undefined);
  const [activeWorkspacePath, setActiveWorkspacePath] = useState<string | undefined>(undefined);
  const [isDraftThread, setIsDraftThread] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: translate(locale, "agent.ready"),
      status: "completed"
    }
  ]);
  const [engineRuntimeSnapshot, setEngineRuntimeSnapshot] =
    useState<QueryRuntimeSnapshot>(EMPTY_QUERY_RUNTIME_SNAPSHOT);
  const apiBaseUrl = apiConfig?.baseUrl ?? "";
  const apiKey = apiConfig?.apiKey ?? "";

  const engineRef = useRef<QueryEngine | null>(null);
  const pendingEngineMessagesRef = useRef<AgentMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPersistedStateRef = useRef<PersistedThreadState | null>(null);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const panelRef = useRef<ImperativePanelHandle>(null);
  const diffPanelRef = useRef<ImperativePanelHandle>(null);
  const diffPanelSizeRef = useRef(30);
  const sidebarOpenBeforeDiffExpandRef = useRef(isSiderVisible);
  const permissionResolversRef = useRef(new Map<string, (decision: PermissionPromptDecision) => void>());
  const hasHydratedAgentPreferencesRef = useRef(false);
  const activePermissionItem = permissionQueue[0] ?? null;
  const [isDiffPanelOpen, setIsDiffPanelOpen] = useState(true);
  const [isDiffPanelExpanded, setIsDiffPanelExpanded] = useState(false);
  const [diffPanelSizePct, setDiffPanelSizePct] = useState(30);
  const [diffSplitViewEnabled, setDiffSplitViewEnabled] = useState(false);
  const [diffWordWrapEnabled, setDiffWordWrapEnabled] = useState(true);
  const [diffCollapsedAll, setDiffCollapsedAll] = useState(false);
  const [diffLoadFullFileEnabled, setDiffLoadFullFileEnabled] = useState(false);
  const [diffRichTextPreviewEnabled, setDiffRichTextPreviewEnabled] = useState(false);
  const [diffTextDiffEnabled, setDiffTextDiffEnabled] = useState(true);
  const [isDiffScopeMenuOpen, setIsDiffScopeMenuOpen] = useState(false);
  const [diffScope, setDiffScope] = useState<DiffScope>("allBranches");
  const [lastRoundChangedFiles, setLastRoundChangedFiles] = useState<Array<{ code: string; path: string }>>([]);
  const [isSidebarPanelOpen, setIsSidebarPanelOpen] = useState(isSiderVisible);
  const [gitSnapshot, setGitSnapshot] = useState<RuntimeGitSnapshotView | null>(null);
  const [gitSnapshotLoading, setGitSnapshotLoading] = useState(false);
  const [gitSnapshotError, setGitSnapshotError] = useState<string | null>(null);
  const [gitSnapshotUpdatedAt, setGitSnapshotUpdatedAt] = useState<number | null>(null);
  const [isTracePanelOpen, setIsTracePanelOpen] = useState(false);
  const [traceFilter, setTraceFilter] = useState<TraceFilter>("all");
  const [traceRiskFilter, setTraceRiskFilter] = useState<TracePermissionRiskFilter>("all");
  const [traceReversibilityFilter, setTraceReversibilityFilter] =
    useState<TracePermissionReversibilityFilter>("all");
  const [traceBlastRadiusFilter, setTraceBlastRadiusFilter] =
    useState<TracePermissionBlastRadiusFilter>("all");
  const [isPromptGovernanceExpanded, setIsPromptGovernanceExpanded] = useState(false);
  const [traceWarningsOnly, setTraceWarningsOnly] = useState(false);
  const [traceFailureFocus, setTraceFailureFocus] = useState(false);
  const [traceHotspotWindow, setTraceHotspotWindow] = useState<TraceHotspotWindow>("runs6");
  const [selectedTraceTool, setSelectedTraceTool] = useState<string | null>(null);
  const [expandedTraceRuns, setExpandedTraceRuns] = useState<Record<string, boolean>>({});
  const [traceQuickCommandState, setTraceQuickCommandState] = useState<TraceQuickCommandState | null>(null);
  const [lastDiagnosisActivity, setLastDiagnosisActivity] = useState<TraceQuickCommandState | null>(null);
  const [diagnosisHistory, setDiagnosisHistory] = useState<TraceQuickCommandState[]>([]);
  const [diagnosisHistoryStatusFilter, setDiagnosisHistoryStatusFilter] =
    useState<DiagnosisHistoryStatusFilter>("all");
  const [diagnosisHistoryKindFilter, setDiagnosisHistoryKindFilter] = useState<DiagnosisHistoryKindFilter>("all");
  const [diagnosisHistorySortMode, setDiagnosisHistorySortMode] =
    useState<DiagnosisHistorySortMode>("recent");
  const [diagnosisRunbookActionStateById, setDiagnosisRunbookActionStateById] = useState<
    Record<string, DiagnosisRunbookActionExecutionState>
  >({});
  const [expandedDiagnosisLifecycleKeys, setExpandedDiagnosisLifecycleKeys] = useState<Record<string, boolean>>({});
  const [diagnosisQueueTick, setDiagnosisQueueTick] = useState(0);
  const [isConsolePanelOpen, setIsConsolePanelOpen] = useState(false);
  const [terminalShellType, setTerminalShellType] = useState<TerminalShellType>("powershell");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalRuns, setTerminalRuns] = useState<TerminalExecution[]>([]);
  const [isRewindPreviewOpen, setIsRewindPreviewOpen] = useState(false);
  const [rewindPreviewLoading, setRewindPreviewLoading] = useState(false);
  const [rewindApplying, setRewindApplying] = useState(false);
  const [rewindPreview, setRewindPreview] = useState<RewindPreviewState | null>(null);
  const wasThinkingRef = useRef(false);
  const roundStartChangedFilesRef = useRef<Array<{ code: string; path: string }>>([]);
  const currentThreadIdRef = useRef<string | null>(currentThreadId);
  const isDraftThreadRef = useRef(isDraftThread);
  const lastUiActivityAtRef = useRef(Date.now());
  const threadsRefreshTimerRef = useRef<number | null>(null);
  const terminalLogQueueRef = useRef<Map<string, string[]>>(new Map());
  const terminalLogFlushTimerRef = useRef<number | null>(null);
  const handleLoadThreadRef = useRef<(id: string) => Promise<void>>(async () => undefined);
  const effectiveWorkingDir = currentThreadWorkingDir ?? activeWorkspacePath;
  const currentThreadMeta = useMemo(
    () => (currentThreadId ? threads.find((thread) => thread.id === currentThreadId) ?? null : null),
    [threads, currentThreadId],
  );
  const compactThreadName = ellipsizeDisplayName(currentThreadName, 14);
  const isThinking = useMemo(() => messages.some((message) => message.status === "running"), [messages]);

  const enqueuePermissionRequest = useCallback((request: PermissionPromptRequest) => {
    return new Promise<PermissionPromptDecision>((resolve) => {
      const id =
        globalThis.crypto?.randomUUID?.() ?? `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      permissionResolversRef.current.set(id, resolve);
      setPermissionQueue((prev) => [...prev, { id, request }]);
    });
  }, []);

  const resolveActivePermission = useCallback((decision: PermissionPromptDecision) => {
    setPermissionQueue((prev) => {
      const current = prev[0];
      if (!current) return prev;
      const resolver = permissionResolversRef.current.get(current.id);
      if (resolver) {
        resolver(decision);
        permissionResolversRef.current.delete(current.id);
      }
      return prev.slice(1);
    });
  }, []);

  const denyAllPermissionPrompts = useCallback(() => {
    setPermissionQueue((prev) => {
      for (const item of prev) {
        const resolver = permissionResolversRef.current.get(item.id);
        if (resolver) {
          resolver("deny");
          permissionResolversRef.current.delete(item.id);
        }
      }
      return [];
    });
    setPermissionDelayReady(false);
  }, []);

  const flushQueuedTerminalLogs = useCallback(() => {
    terminalLogFlushTimerRef.current = null;
    if (terminalLogQueueRef.current.size === 0) {
      return;
    }

    const queuedByRunId = new Map(terminalLogQueueRef.current);
    terminalLogQueueRef.current.clear();

    setTerminalRuns((prev) => {
      let changed = false;
      const next = prev.map((run) => {
        const queuedLines = queuedByRunId.get(run.id);
        if (!queuedLines || queuedLines.length === 0) {
          return run;
        }
        changed = true;
        const merged = [...run.liveLogs, ...queuedLines];
        const trimmed =
          merged.length > MAX_TERMINAL_LIVE_LOG_LINES
            ? merged.slice(merged.length - MAX_TERMINAL_LIVE_LOG_LINES)
            : merged;
        return {
          ...run,
          liveLogs: trimmed,
        };
      });
      return changed ? next : prev;
    });
  }, []);

  const enqueueTerminalLogLine = useCallback(
    (commandId: string, prefixedLine: string) => {
      const bucket = terminalLogQueueRef.current.get(commandId) ?? [];
      bucket.push(prefixedLine);
      terminalLogQueueRef.current.set(commandId, bucket);

      if (terminalLogFlushTimerRef.current !== null) {
        return;
      }
      terminalLogFlushTimerRef.current = window.setTimeout(() => {
        flushQueuedTerminalLogs();
      }, TERMINAL_LOG_FLUSH_INTERVAL_MS);
    },
    [flushQueuedTerminalLogs],
  );

  const scheduleThreadsRefresh = useCallback(
    (delayMs = THREADS_REFRESH_DEBOUNCE_MS) => {
      if (threadsRefreshTimerRef.current !== null) {
        window.clearTimeout(threadsRefreshTimerRef.current);
      }
      threadsRefreshTimerRef.current = window.setTimeout(() => {
        threadsRefreshTimerRef.current = null;
        void threadService.listThreads()
          .then((list) => {
            setThreads(list);
          })
          .catch((error) => {
            console.warn("Failed to list threads:", error);
          });
      }, delayMs);
    },
    [],
  );

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    isDraftThreadRef.current = isDraftThread;
  }, [isDraftThread]);

  useEffect(() => {
    if (!activePermissionItem) {
      setPermissionDelayReady(false);
      return;
    }
    setPermissionDelayReady(false);
    const timer = setTimeout(() => {
      setPermissionDelayReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [activePermissionItem]);

  useEffect(() => {
    const resolverMapRef = permissionResolversRef;
    return () => {
      const pendingResolvers = [...resolverMapRef.current.values()];
      resolverMapRef.current.clear();
      for (const resolve of pendingResolvers) {
        resolve("deny");
      }
    };
  }, []);

  useEffect(() => {
    const refreshTimerRef = threadsRefreshTimerRef;
    const logTimerRef = terminalLogFlushTimerRef;
    const logQueueRef = terminalLogQueueRef;
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (logTimerRef.current !== null) {
        window.clearTimeout(logTimerRef.current);
        logTimerRef.current = null;
      }
      logQueueRef.current.clear();
    };
  }, []);

  // Sync side toggle
  useEffect(() => {
    setIsSidebarPanelOpen(isSiderVisible);
  }, [isSiderVisible]);

  const loadGitSnapshot = useCallback(async () => {
    if (!effectiveWorkingDir) {
      setGitSnapshot(null);
      setGitSnapshotError(null);
      setGitSnapshotUpdatedAt(null);
      return;
    }

    setGitSnapshotLoading(true);
    setGitSnapshotError(null);
    try {
      const snapshot = await invoke<RuntimeGitSnapshotView>("invoke_agent_git_snapshot", {
        request: {
          working_dir: effectiveWorkingDir,
          max_commits: 10,
        },
      });
      setGitSnapshot(snapshot);
      setGitSnapshotUpdatedAt(Date.now());
    } catch (error) {
      setGitSnapshotError(String(error));
    } finally {
      setGitSnapshotLoading(false);
    }
  }, [effectiveWorkingDir]);

  const resolveLastUserTurnId = useCallback(() => {
    const candidate = [...messagesRef.current]
      .reverse()
      .find((message) => message.role === "user");
    return candidate?.id ?? null;
  }, []);

  const handleOpenRewindPreview = useCallback(async () => {
    if (!effectiveWorkingDir || !currentThreadId) {
      toast.warning(translate(locale, "agent.command.rewind.missingContext"));
      return;
    }
    const turnId = resolveLastUserTurnId();
    if (!turnId) {
      toast.warning(translate(locale, "agent.command.rewind.noUserTurn"));
      return;
    }

    setRewindPreviewLoading(true);
    try {
      const result = await threadService.previewRewindThreadFiles(
        currentThreadId,
        turnId,
        effectiveWorkingDir,
      );

      setRewindPreview({
        turnId,
        restoreCount: Number(result.restore_count ?? 0),
        removeCount: Number(result.remove_count ?? 0),
        affectedPaths: Array.isArray(result.affected_paths) ? result.affected_paths : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        firstSeq: result.first_seq ?? null,
      });
      setIsRewindPreviewOpen(true);
    } catch (error) {
      console.warn("Failed to preview rewind:", error);
      toast.error(translate(locale, "agent.rewind.previewFailed"));
    } finally {
      setRewindPreviewLoading(false);
    }
  }, [currentThreadId, effectiveWorkingDir, locale, resolveLastUserTurnId]);

  const handleApplyRewind = useCallback(async () => {
    if (!effectiveWorkingDir || !currentThreadId || !rewindPreview?.turnId) {
      toast.warning(translate(locale, "agent.command.rewind.missingContext"));
      return;
    }

    setRewindApplying(true);
    try {
      const result = await threadService.rewindThreadFiles(
        currentThreadId,
        rewindPreview.turnId,
        effectiveWorkingDir,
      );
      const restored = Number(result.restored_count ?? 0);
      const removed = Number(result.removed_count ?? 0);
      const files = Array.isArray(result.affected_paths) ? result.affected_paths.length : 0;
      toast.success(
        translate(locale, "agent.rewind.applySuccess", {
          restored,
          removed,
          files,
        }),
      );
      setIsRewindPreviewOpen(false);
      await loadGitSnapshot();
    } catch (error) {
      console.warn("Failed to apply rewind:", error);
      toast.error(translate(locale, "agent.rewind.applyFailed"));
    } finally {
      setRewindApplying(false);
    }
  }, [currentThreadId, effectiveWorkingDir, loadGitSnapshot, locale, rewindPreview?.turnId]);

  const toggleDiffPanel = useCallback(() => {
    const nextOpen = !isDiffPanelOpen;
    setIsDiffPanelOpen(nextOpen);
    if (!nextOpen) {
      const shouldRestoreSidebar = isDiffPanelExpanded && sidebarOpenBeforeDiffExpandRef.current;
      setIsDiffPanelExpanded(false);
      setDiffPanelSizePct(0);
      diffPanelRef.current?.resize("0%");
      if (shouldRestoreSidebar) {
        setIsSidebarPanelOpen(true);
        requestAnimationFrame(() => {
          panelRef.current?.resize("18%");
        });
      }
      return;
    }
    setDiffPanelSizePct(30);
    requestAnimationFrame(() => {
      diffPanelRef.current?.resize("30%");
    });
  }, [isDiffPanelExpanded, isDiffPanelOpen]);

  const toggleDiffPanelExpand = useCallback(() => {
    if (!isDiffPanelOpen) return;
    if (!isDiffPanelExpanded) {
      sidebarOpenBeforeDiffExpandRef.current = isSidebarPanelOpen;
      setIsDiffPanelExpanded(true);
      if (isSidebarPanelOpen) {
        setIsSidebarPanelOpen(false);
        panelRef.current?.resize("0%");
      }
      setDiffPanelSizePct(100);
      requestAnimationFrame(() => {
        diffPanelRef.current?.resize("100%");
      });
      return;
    }
    setIsDiffPanelExpanded(false);
    const restoreSize = Math.max(20, Math.min(55, diffPanelSizeRef.current || 30));
    setDiffPanelSizePct(restoreSize);
    requestAnimationFrame(() => {
      diffPanelRef.current?.resize(`${restoreSize}%`);
    });
    if (sidebarOpenBeforeDiffExpandRef.current) {
      setIsSidebarPanelOpen(true);
      requestAnimationFrame(() => {
        panelRef.current?.resize("18%");
      });
    }
  }, [isDiffPanelExpanded, isDiffPanelOpen, isSidebarPanelOpen]);

  const toggleSidebarPanel = useCallback(() => {
    const nextOpen = !isSidebarPanelOpen;
    setIsSidebarPanelOpen(nextOpen);
    if (!nextOpen) {
      panelRef.current?.resize("0%");
      return;
    }
    requestAnimationFrame(() => {
      panelRef.current?.resize("18%");
    });
  }, [isSidebarPanelOpen]);

  const handleSidebarResize = useCallback(() => { }, []);

  const handleDiffPanelResize = useCallback((panelSize: { asPercentage: number; inPixels: number }) => {
    if (!isDiffPanelOpen || isDiffPanelExpanded) return;
    if (panelSize.asPercentage > 0.01 || panelSize.inPixels > 1) {
      diffPanelSizeRef.current = panelSize.asPercentage;
      setDiffPanelSizePct(panelSize.asPercentage);
    }
  }, [isDiffPanelExpanded, isDiffPanelOpen]);

  useEffect(() => {
    if (!isDiffPanelOpen) return;
    void loadGitSnapshot();
  }, [isDiffPanelOpen, loadGitSnapshot]);

  useEffect(() => {
    let cancelled = false;

    const hydrateTerminalShell = async () => {
      try {
        const shellType = await loadTerminalShellType();
        if (!cancelled) {
          setTerminalShellType(shellType);
        }
      } catch {
        if (!cancelled) {
          setTerminalShellType("powershell");
        }
      }
    };

    void hydrateTerminalShell();

    const eventName = getTerminalShellChangedEventName();
    const onShellTypeChanged = (event: Event) => {
      const detail = (event as CustomEvent<TerminalShellType>).detail;
      setTerminalShellType(detail === "cmd" ? "cmd" : "powershell");
    };
    window.addEventListener(eventName, onShellTypeChanged as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener(eventName, onShellTypeChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    let unlisten: null | (() => void) = null;

    const bindAgentLog = async () => {
      unlisten = await listen<AgentLogEventPayload>("agent-log", (event) => {
        const payload = event.payload ?? {};
        const commandId = typeof payload.command_id === "string" ? payload.command_id : "";
        if (!commandId) return;
        const line = typeof payload.line === "string" ? payload.line : "";
        const source = typeof payload.source === "string" ? payload.source : "stdout";
        const prefixedLine =
          source === "stderr" || source === "error"
            ? `[stderr] ${line}`
            : `[stdout] ${line}`;
        enqueueTerminalLogLine(commandId, prefixedLine);
      });
    };

    void bindAgentLog();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [enqueueTerminalLogLine]);

  // Load threads on mount
  const refreshThreads = useCallback(async (autoSelect = false) => {
    try {
      const list = await threadService.listThreads();
      setThreads(list);

      // If no thread is selected, select the most recent one.
      if (autoSelect && !currentThreadIdRef.current && !isDraftThreadRef.current && list.length > 0) {
        void handleLoadThreadRef.current(list[0].id);
      }
    } catch (e) {
      console.warn("Failed to list threads:", e);
    }
  }, []);

  useEffect(() => {
    void refreshThreads(true);
  }, [refreshThreads]);

  useEffect(() => {
    let cancelled = false;
    hasHydratedAgentPreferencesRef.current = false;

    const hydrateAgentPreferences = async () => {
      try {
        const snapshot = await loadAgentPreferences(apiBaseUrl || undefined);
        if (cancelled) return;
        setCurrentModel(snapshot.currentModel);
        setPermissionMode(snapshot.permissionMode);
      } catch (error) {
        console.warn("Failed to load agent preferences:", error);
      }
      hasHydratedAgentPreferencesRef.current = true;
    };

    void hydrateAgentPreferences();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!hasHydratedAgentPreferencesRef.current) {
      return;
    }
    void saveAgentPreferences(apiBaseUrl || undefined, {
      currentModel,
      permissionMode,
    }).catch((error) => {
      console.warn("Failed to save agent preferences:", error);
    });
  }, [apiBaseUrl, currentModel, permissionMode]);

  // Initialize engine
  useEffect(() => {
    if (!apiBaseUrl || !apiKey) return;

    const engine = new QueryEngine(
      (updatedMessages) => {
        const nextMessages = [...updatedMessages];
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
        lastUiActivityAtRef.current = Date.now();
      },
      apiBaseUrl,
      apiKey,
      {
        onPermissionRequest: enqueuePermissionRequest,
      }
    );
    engineRef.current = engine;
    const unsubscribeRuntimeSnapshot = engine.subscribeRuntimeSnapshot((snapshot) => {
      setEngineRuntimeSnapshot(snapshot);
    });

    // Replay any messages loaded before engine was ready.
    if (pendingEngineMessagesRef.current) {
      engine.setMessages(pendingEngineMessagesRef.current);
      pendingEngineMessagesRef.current = null;
    } else if (messagesRef.current.length > 0) {
      engine.setMessages(messagesRef.current);
    }

    const fetchModels = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/models`, {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            const models: ModelInfo[] = data.data
              .filter((m: any) => m.id)
              .map((m: any) => ({ id: m.id, label: m.id }))
              .slice(0, 20);
            if (models.length > 0) {
              setAvailableModels(models);
              setCurrentModel((prev) =>
                models.some((model) => model.id === prev) ? prev : models[0].id,
              );
            }
          }
        }
      } catch { }
    };
    fetchModels();

    return () => {
      unsubscribeRuntimeSnapshot();
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      setEngineRuntimeSnapshot(EMPTY_QUERY_RUNTIME_SNAPSHOT);
    };
  }, [apiBaseUrl, apiKey, enqueuePermissionRequest]);

  useEffect(() => {
    if (apiBaseUrl && apiKey) {
      return;
    }
    setEngineRuntimeSnapshot(EMPTY_QUERY_RUNTIME_SNAPSHOT);
  }, [apiBaseUrl, apiKey]);

  useEffect(() => {
    messagesRef.current = messages;
    lastUiActivityAtRef.current = Date.now();
  }, [messages]);

  useEffect(() => {
    engineRef.current?.setPermissionMode(permissionMode);
  }, [permissionMode]);

  useEffect(() => {
    engineRef.current?.setPermissionRules(permissionRules);
  }, [permissionRules]);

  useEffect(() => {
    engineRef.current?.setThreadId(currentThreadId ?? undefined);
  }, [currentThreadId]);

  useEffect(() => {
    engineRef.current?.setWorkingDir(effectiveWorkingDir);
  }, [effectiveWorkingDir]);

  useEffect(() => {
    engineRef.current?.setLocale(locale);
  }, [locale]);

  const handleClearPermissionRules = () => {
    setPermissionRules([]);
  };

  const handleAllowWorkspaceWrite = () => {
    if (!effectiveWorkingDir) return;
    const root = effectiveWorkingDir;
    const ts = Date.now();
    const workspaceRules: PermissionRule[] = [
      {
        id: `allow-file-write-${ts}`,
        tool: "file_write",
        behavior: "allow",
        mode: "default",
        matcher: { type: "path_prefix", value: root },
        description: "Allow file_write inside current workspace path",
      },
      {
        id: `allow-shell-cwd-${ts + 1}`,
        tool: "shell",
        behavior: "allow",
        mode: "default",
        matcher: { type: "path_prefix", value: root },
        description: "Allow shell commands under current workspace path",
      },
    ];
    setPermissionRules((prev) => [...prev, ...workspaceRules]);
  };

  // Thread Handlers
  const handleSelectWorkspace = useCallback((workingDir: string) => {
    const normalized = workingDir.trim();
    if (!normalized) return;
    setActiveWorkspacePath(normalized);
    if (!currentThreadId || isDraftThread) {
      setCurrentThreadWorkingDir(normalized);
    }
  }, [currentThreadId, isDraftThread]);

  const handleNewThread = useCallback((workingDir?: string) => {
    denyAllPermissionPrompts();
    setExpandedTraceRuns({});
    setSelectedTraceTool(null);
    setTraceQuickCommandState(null);
    setLastDiagnosisActivity(null);
    setDiagnosisHistory([]);
    setIsDraftThread(true);
    setCurrentThreadId(null);
    setCurrentThreadName(defaultTaskName);
    setCurrentThreadWorkingDir(workingDir);
    setActiveWorkspacePath(workingDir);

    const initMsg: AgentMessage[] = [{
      id: "init",
      role: "assistant",
      content: translate(locale, "agent.readyWithTools").replace(
        "{count}",
        String(DEFAULT_TOOL_COUNT),
      ),
      status: "completed"
    }];
    const nextMessages = cloneMessages(initMsg);
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
    // Keep null so autosave performs an initial full snapshot for brand-new threads.
    lastPersistedStateRef.current = null;
    if (engineRef.current) {
      engineRef.current.setMessages(initMsg);
      engineRef.current.setWorkingDir(workingDir);
      engineRef.current.setThreadId(undefined);
      engineRef.current.clearQueryEvents();
      pendingEngineMessagesRef.current = null;
    } else {
      pendingEngineMessagesRef.current = initMsg;
    }
  }, [defaultTaskName, denyAllPermissionPrompts, locale]);

  const handleLoadThread = useCallback(async (id: string) => {
    try {
      denyAllPermissionPrompts();
      setExpandedTraceRuns({});
      setSelectedTraceTool(null);
      setIsDraftThread(false);
      const data = await threadService.loadThread(id);
      setCurrentThreadId(data.metadata.id);
      setCurrentThreadName(data.metadata.name);
      setCurrentThreadWorkingDir(data.metadata.working_dir);
      setActiveWorkspacePath(data.metadata.working_dir);
      setTraceQuickCommandState(null);
      setLastDiagnosisActivity(fromThreadDiagnosisActivity(data.metadata.diagnostics?.diagnosis_activity));
      setDiagnosisHistory(fromThreadDiagnosisHistory(data.metadata.diagnostics?.diagnosis_history));
      const nextMessages = cloneMessages(data.messages);
      setMessages(nextMessages);
      messagesRef.current = nextMessages;
      lastPersistedStateRef.current = buildPersistedThreadState(nextMessages);

      if (engineRef.current) {
        engineRef.current.setMessages(nextMessages);
        engineRef.current.setWorkingDir(data.metadata.working_dir);
        engineRef.current.setThreadId(data.metadata.id);
        engineRef.current.clearQueryEvents();
        pendingEngineMessagesRef.current = null;
      } else {
        pendingEngineMessagesRef.current = nextMessages;
      }
    } catch (e) {
      console.error("Failed to load thread:", e);
    }
  }, [denyAllPermissionPrompts]);

  useEffect(() => {
    handleLoadThreadRef.current = handleLoadThread;
  }, [handleLoadThread]);

  const handleDeleteThread = useCallback(async (id: string) => {
    try {
      await threadService.deleteThread(id);
      if (currentThreadId === id) {
        setCurrentThreadId(null);
        setTraceQuickCommandState(null);
        setLastDiagnosisActivity(null);
        setDiagnosisHistory([]);
      }
      void refreshThreads(true);
    } catch { }
  }, [currentThreadId, refreshThreads]);

  const handleStartRename = useCallback((thread: ThreadMetadata) => {
    setEditingId(thread.id);
    setEditingName(thread.name || "");
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      await threadService.renameThread(editingId, editingName);
      if (currentThreadId === editingId) {
        setCurrentThreadName(editingName);
      }
      setEditingId(null);
      void refreshThreads();
    } catch { }
  }, [currentThreadId, editingId, editingName, refreshThreads]);

  const handleLoadThreadFromSidebar = useCallback((id: string) => {
    void handleLoadThread(id);
  }, [handleLoadThread]);

  const handleConfirmRenameFromSidebar = useCallback(() => {
    void handleConfirmRename();
  }, [handleConfirmRename]);

  const handleDeleteThreadFromSidebar = useCallback((id: string) => {
    void handleDeleteThread(id);
  }, [handleDeleteThread]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  const focusComposerToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) return;
      target.focus();
      target.style.height = "auto";
      target.style.height = `${target.scrollHeight}px`;
      const caret = target.value.length;
      target.setSelectionRange(caret, caret);
    });
  }, []);

  const handleInvestigateThreadFromSidebar = useCallback((thread: ThreadMetadata) => {
    void (async () => {
      try {
        if (thread.id !== currentThreadId) {
          await handleLoadThread(thread.id);
        }
        setIsTracePanelOpen(true);
        setTraceFilter("retry");
        setTraceWarningsOnly(false);
        setTraceFailureFocus(false);
        setTraceRiskFilter("all");
        setTraceReversibilityFilter("all");
        setTraceBlastRadiusFilter("all");
        setSelectedTraceTool(null);
        setExpandedTraceRuns({});

        const command = buildThreadRiskInvestigationPrompt(thread);
        setInput(command);
        setTraceQuickCommandState({
          kind: "fallback_investigate",
          status: "prepared",
          command,
          at: Date.now(),
        });
        focusComposerToEnd();
        toast.success(translate(locale, "agent.sidebarInvestigatePrepared"));
      } catch (error) {
        console.warn("Failed to prepare thread investigation:", error);
        toast.error(translate(locale, "agent.sidebarInvestigateFailed"));
      }
    })();
  }, [currentThreadId, focusComposerToEnd, handleLoadThread, locale]);
  // Auto-save thread on message updates
  useEffect(() => {
    if (!currentThreadId) return;
    if (isThinking) return;

    const buildThreadEvents = (
      prevState: PersistedThreadState,
      nextPersistedMessages: AgentMessage[],
    ): ThreadEvent[] => {
      const events: ThreadEvent[] = [];
      const prevSignatures = prevState.signatures;
      const nextIds = new Set<string>();
      const now = Date.now();

      for (const persisted of nextPersistedMessages) {
        nextIds.add(persisted.id);
        const prevSignature = prevSignatures[persisted.id];
        const nextSignature = getMessagePersistenceSignature(persisted);
        if (!prevSignature) {
          events.push({
            event_type: "append_message",
            message_id: persisted.id,
            payload: persisted,
            at: now,
          });
          continue;
        }
        if (prevSignature !== nextSignature) {
          events.push({
            event_type: "upsert_message",
            message_id: persisted.id,
            payload: persisted,
            at: now,
          });
        }
      }

      for (const messageId of prevState.order) {
        if (!nextIds.has(messageId)) {
          events.push({
            event_type: "delete_message",
            message_id: messageId,
            payload: {},
            at: now,
          });
        }
      }
      return events;
    };

    const name = currentThreadName;

    const saveTimer = setTimeout(() => {
      const prevState = lastPersistedStateRef.current;
      const currentMessages = messages;
      const persistedMessages = compactMessagesForPersistence(currentMessages);
      const nextState = buildPersistedThreadStateFromPersisted(persistedMessages);
      const wd = currentThreadWorkingDir;
      const computedDiagnostics = buildThreadDiagnosticsFromEvents(engineRef.current?.getRecentQueryEvents(80) ?? []);
      const persistedDiagnosisActivity = toThreadDiagnosisActivity(lastDiagnosisActivity);
      const persistedDiagnosisHistory: ThreadDiagnosisActivity[] = diagnosisHistory
        .slice(0, MAX_DIAGNOSIS_HISTORY_ITEMS)
        .map((item) => ({
          kind: item.kind,
          status: item.status,
          command: item.command,
          at: item.at,
          command_id: item.commandId ?? null,
        }));
      const existingDiagnostics = currentThreadMeta?.diagnostics;
      const diagnostics: ThreadDiagnostics | undefined = (() => {
        if (!computedDiagnostics && !existingDiagnostics && !persistedDiagnosisActivity && persistedDiagnosisHistory.length === 0) {
          return undefined;
        }
        return {
          retry: computedDiagnostics?.retry ??
            existingDiagnostics?.retry ?? {
              fallback_used: 0,
              fallback_suppressed: 0,
              retry_event_count: 0,
              suppression_ratio_pct: 0,
              last_suppressed_reason: null,
              last_retry_strategy: null,
            },
          permission: computedDiagnostics?.permission ?? existingDiagnostics?.permission,
          diagnosis_activity: persistedDiagnosisActivity ?? existingDiagnostics?.diagnosis_activity,
          diagnosis_history:
            persistedDiagnosisHistory.length > 0
              ? persistedDiagnosisHistory
              : existingDiagnostics?.diagnosis_history ?? [],
          updated_at: computedDiagnostics?.updated_at ?? Date.now(),
        };
      })();

      if (!prevState) {
        void threadService.saveThread(currentThreadId, name, persistedMessages, wd, diagnostics)
          .then(() => {
            lastPersistedStateRef.current = nextState;
            scheduleThreadsRefresh();
          })
          .catch((error) => {
            console.warn("Failed to save thread:", error);
          });
        return;
      }

      const events = buildThreadEvents(prevState, persistedMessages);
      if (events.length === 0) return;

      void threadService.appendThreadEvents(currentThreadId, name, events, wd, diagnostics)
        .then(() => {
          lastPersistedStateRef.current = nextState;
          scheduleThreadsRefresh();
        })
        .catch((error) => {
          console.warn("Failed to append thread events, fallback to full snapshot:", error);
          void threadService.saveThread(currentThreadId, name, persistedMessages, wd, diagnostics)
            .then(() => {
              lastPersistedStateRef.current = nextState;
              scheduleThreadsRefresh();
            })
            .catch((saveErr) => {
              console.warn("Failed to save thread snapshot:", saveErr);
            });
        });
    }, THREAD_AUTOSAVE_IDLE_MS);

    return () => clearTimeout(saveTimer);
  }, [
    messages,
    currentThreadId,
    currentThreadName,
    currentThreadWorkingDir,
    scheduleThreadsRefresh,
    isThinking,
    lastDiagnosisActivity,
    diagnosisHistory,
    currentThreadMeta?.diagnostics,
  ]);

  useEffect(() => {
    if (scrollRef.current && isUserAtBottomRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserAtBottomRef.current = distanceFromBottom < 50;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) isUserAtBottomRef.current = false;
  };

  const queuedCount = engineRuntimeSnapshot.queueCount;
  const queueLimit = engineRuntimeSnapshot.queueLimit;
  const queueByPriority = engineRuntimeSnapshot.queueByPriority ?? EMPTY_QUEUE_BY_PRIORITY;
  const queuedQueries: QueuedQueryItem[] =
    engineRuntimeSnapshot.queuedQueries.length > 0
      ? engineRuntimeSnapshot.queuedQueries.map((item) => ({ ...item }))
      : EMPTY_QUEUED_QUERY_LIST;
  const toolNames = engineRef.current?.getToolNames() ?? DEFAULT_TOOL_NAMES;
  const slashCommands = engineRef.current?.getSlashCommands() ?? [];
  const permissionRuleCount = engineRef.current?.getPermissionRules().length ?? 0;
  const tasks = engineRef.current?.listTasks() ?? [];
  const runningTaskCount = tasks.filter((task) => task.status === "running").length;
  const permissionLabelForUi =
    permissionMode === "full_access"
      ? translate(locale, "permission.fullAccess")
      : translate(locale, "permission.default");
  const isEngineReady = Boolean(engineRef.current);
  const hasConnection = Boolean(apiConfig);
  const hasActiveWork = isThinking || runningTaskCount > 0;
  const statusLabel = !hasConnection
    ? translate(locale, "agent.statusDisconnected")
    : hasActiveWork
      ? translate(locale, "agent.statusRunning")
      : queuedCount > 0
        ? translate(locale, "agent.statusQueued")
        : translate(locale, "agent.statusIdle");
  const latestStreamEvent = engineRuntimeSnapshot.latestEvent ?? null;
  const lastStreamEventAt = engineRuntimeSnapshot.lastEventAt;
  const latestStreamEventLabel = useMemo(
    () => formatLatestTraceEventLabel(locale, latestStreamEvent),
    [locale, latestStreamEvent],
  );
  const latestRetryDiagnosticEvent = useMemo<
    Extract<QueryStreamEvent, { type: "retry_profile_update" | "fallback_suppressed" }> | null
  >(() => {
    const events = engineRuntimeSnapshot.recentEvents;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === "fallback_suppressed" || event.type === "retry_profile_update") {
        return event;
      }
    }
    return null;
  }, [engineRuntimeSnapshot.recentEvents]);
  const latestRetryDiagnosticLabel = useMemo(
    () =>
      latestRetryDiagnosticEvent
        ? formatLatestTraceEventLabel(locale, latestRetryDiagnosticEvent)
        : null,
    [locale, latestRetryDiagnosticEvent],
  );
  const latestRetryDiagnosticWarn = Boolean(
    latestRetryDiagnosticEvent &&
      (latestRetryDiagnosticEvent.type === "fallback_suppressed" ||
        latestRetryDiagnosticEvent.reason === "load_shed"),
  );
  const lastContinueReasonLabel = formatContinueReason(
    locale,
    engineRef.current?.getLastContinue() ?? null,
  );
  const activePermissionSuggestionSummary = activePermissionItem
    ? getPermissionSuggestionSummary(activePermissionItem.request.suggestions)
    : "";
  const activePermissionRiskClass = activePermissionItem?.request.riskClass;
  const activePermissionRiskLabel = activePermissionRiskClass
    ? translate(locale, `agent.trace.permissionRisk.${activePermissionRiskClass}`)
    : null;
  const activePermissionReversibility = translate(
    locale,
    `agent.permission.prompt.reversibility.${getPermissionReversibilityLevel(activePermissionRiskClass)}`,
  );
  const activePermissionBlastRadius = translate(
    locale,
    `agent.permission.prompt.blastRadius.${getPermissionBlastRadiusLevel(activePermissionRiskClass)}`,
  );
  const activePermissionRiskAdvice = translate(
    locale,
    `agent.permission.prompt.advice.${getPermissionRiskAdviceKey(activePermissionRiskClass)}`,
  );
  const activePermissionScopeReminder = useMemo(() => {
    if (!activePermissionItem) {
      return null;
    }
    const priorApprovals = activePermissionItem.request.priorApprovals ?? 0;
    const riskClass = activePermissionItem.request.riskClass;
    if (!riskClass || priorApprovals <= 0) {
      return null;
    }
    const riskLabel = translate(locale, `agent.trace.permissionRisk.${riskClass}`);
    return translate(locale, "agent.permission.prompt.scopeReminder", {
      count: priorApprovals,
      risk: riskLabel,
    });
  }, [activePermissionItem, locale]);
  const activePermissionWorkspaceHint = useMemo(() => {
    if (!activePermissionItem) {
      return null;
    }
    if (activePermissionItem.request.riskClass !== "path_outside") {
      return null;
    }
    const roots = (activePermissionItem.request.workspaceRoots ?? [])
      .map((root) => root.trim())
      .filter((root) => root.length > 0);
    if (roots.length === 0) {
      return translate(locale, "agent.permission.prompt.workspaceHintNoWorkspace");
    }
    return translate(locale, "agent.permission.prompt.workspaceHintScoped", {
      workspace: roots[0],
      count: roots.length,
    });
  }, [activePermissionItem, locale]);
  const pendingPermissionCount = permissionQueue.length;

  useEffect(() => {
    if (lastStreamEventAt) {
      lastUiActivityAtRef.current = lastStreamEventAt;
    }
  }, [lastStreamEventAt]);

  useEffect(() => {
    if (!isDiffPanelOpen) return;
    if (isThinking) return;
    void loadGitSnapshot();
  }, [isDiffPanelOpen, isThinking, loadGitSnapshot]);

  const submitAgentQuery = useCallback(
    (
      rawQuery: string,
      options?: {
        clearComposer?: boolean;
        restoreComposerOnQueueReject?: boolean;
        focusComposerOnQueueReject?: boolean;
      },
    ): SubmitAgentQueryResult => {
      if (!engineRef.current) {
        return { accepted: false, reason: "engine_not_ready" };
      }
      const query = rawQuery.trim();
      if (!query) {
        return { accepted: false, reason: "empty" };
      }

      const runtimeQueueLimit = engineRuntimeSnapshot.queueLimit;
      const runtimeQueueCount = engineRuntimeSnapshot.queueCount;
      if (isThinking && runtimeQueueLimit > 0 && runtimeQueueCount >= runtimeQueueLimit) {
        toast.warning(
          translate(locale, "agent.queue.full", {
            count: runtimeQueueCount,
            limit: runtimeQueueLimit,
          }),
        );
        return { accepted: false, reason: "queue_full" };
      }

      if (options?.clearComposer ?? false) {
        setInput("");
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
        }
      }

      if (!currentThreadId) {
        const newId = threadService.generateId();
        const threadName = deriveThreadNameFromQuery(query, defaultTaskName);
        const workingDir = effectiveWorkingDir;

        setIsDraftThread(false);
        setCurrentThreadId(newId);
        setCurrentThreadName(threadName);
        setCurrentThreadWorkingDir(workingDir);
        setActiveWorkspacePath(workingDir);

        const nextMessages: AgentMessage[] = [];
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
        lastPersistedStateRef.current = null;

        engineRef.current.setMessages(nextMessages);
        engineRef.current.setWorkingDir(workingDir);
        engineRef.current.setThreadId(newId);
        pendingEngineMessagesRef.current = null;
      }

      const commandId =
        globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuedLikely = isThinking && !query.startsWith("/");
      lastUiActivityAtRef.current = Date.now();
      void engineRef.current
        .processQuery(query, currentModel, undefined, "foreground", {
          id: commandId,
          command: query,
          queued: queuedLikely,
          priority: "now",
        })
        .then((result) => {
        if (result.state === "rejected" && result.reason === "queue_full") {
          toast.warning(
            translate(locale, "agent.queue.full", {
              count: result.queueCount ?? engineRuntimeSnapshot.queueCount,
              limit: result.queueLimit ?? engineRuntimeSnapshot.queueLimit,
            }),
          );
          if (options?.restoreComposerOnQueueReject ?? true) {
            setInput((prev) => (prev.trim().length === 0 ? query : prev));
          }
          if (options?.focusComposerOnQueueReject ?? true) {
            requestAnimationFrame(() => {
              const target = inputRef.current;
              if (!target) return;
              target.focus();
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
              const caret = target.value.length;
              target.setSelectionRange(caret, caret);
            });
          }
        }
      });
      return { accepted: true, queued: queuedLikely, commandId };
    },
    [
      isThinking,
      locale,
      currentThreadId,
      defaultTaskName,
      effectiveWorkingDir,
      currentModel,
      engineRuntimeSnapshot.queueCount,
      engineRuntimeSnapshot.queueLimit,
    ],
  );
  const handleRunThreadDiagnosisFromSidebar = useCallback((thread: ThreadMetadata) => {
    void (async () => {
      try {
        if (thread.id !== currentThreadId) {
          await handleLoadThread(thread.id);
        }
        setIsTracePanelOpen(true);
        setTraceFilter("retry");
        setTraceWarningsOnly(false);
        setTraceFailureFocus(false);
        setTraceRiskFilter("all");
        setTraceReversibilityFilter("all");
        setTraceBlastRadiusFilter("all");
        setSelectedTraceTool(null);
        setExpandedTraceRuns({});

        const command = buildThreadRiskInvestigationPrompt(thread);
        const submitResult = submitAgentQuery(command, {
          clearComposer: false,
          restoreComposerOnQueueReject: true,
          focusComposerOnQueueReject: true,
        });
        if (submitResult.accepted) {
          setTraceQuickCommandState({
            kind: "fallback_investigate",
            status: submitResult.queued ? "queued" : "started",
            command,
            at: Date.now(),
            commandId: submitResult.commandId,
          });
          if (submitResult.queued) {
            toast.info(translate(locale, "agent.sidebarInvestigateRunQueued"));
          } else {
            toast.success(translate(locale, "agent.sidebarInvestigateRunStarted"));
          }
        } else if (submitResult.reason === "queue_full") {
          setTraceQuickCommandState({
            kind: "fallback_investigate",
            status: "queue_full",
            command,
            at: Date.now(),
          });
        }
      } catch (error) {
        console.warn("Failed to run thread investigation:", error);
        toast.error(translate(locale, "agent.sidebarInvestigateFailed"));
      }
    })();
  }, [currentThreadId, handleLoadThread, locale, submitAgentQuery]);

  const handleSend = useCallback(() => {
    submitAgentQuery(input, {
      clearComposer: true,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
  }, [input, submitAgentQuery]);

  const handleRemoveQueuedQuery = useCallback((queueId: string) => {
    engineRef.current?.removeQueuedQuery(queueId);
  }, []);

  const handleEditQueuedQuery = useCallback((queueId: string) => {
    const queued = engineRef.current?.popQueuedQueryToDraft(queueId);
    if (!queued) return;
    setInput(queued.query);
    requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) return;
      target.focus();
      target.style.height = "auto";
      target.style.height = `${target.scrollHeight}px`;
      const caret = target.value.length;
      target.setSelectionRange(caret, caret);
    });
  }, []);

  const handleStop = useCallback(() => {
    denyAllPermissionPrompts();
    engineRef.current?.abort(true, "manual_stop");
  }, [denyAllPermissionPrompts]);

  const handleToggleConsolePanel = useCallback(() => {
    setIsConsolePanelOpen((prev) => !prev);
  }, []);

  const handleToggleTracePanel = useCallback(() => {
    setIsTracePanelOpen((prev) => !prev);
  }, []);

  const handleOpenRetryTraceDiagnostics = useCallback(() => {
    setIsTracePanelOpen(true);
    setTraceFilter("retry");
    setTraceWarningsOnly(false);
    setTraceFailureFocus(false);
    setTraceRiskFilter("all");
    setTraceReversibilityFilter("all");
    setTraceBlastRadiusFilter("all");
    setSelectedTraceTool(null);
  }, []);

  const handleOpenPermissionTraceDiagnostics = useCallback(() => {
    setIsTracePanelOpen(true);
    setTraceFilter("permission");
    setTraceWarningsOnly(false);
    setTraceFailureFocus(false);
    setTraceRiskFilter(activePermissionRiskClass ?? "all");
    setTraceReversibilityFilter("all");
    setTraceBlastRadiusFilter("all");
    setSelectedTraceTool(null);
  }, [activePermissionRiskClass]);

  const handleClearTraceEvents = useCallback(() => {
    engineRef.current?.clearQueryEvents();
    setExpandedTraceRuns({});
    setSelectedTraceTool(null);
    setTraceQuickCommandState(null);
  }, []);

  const handleExpandAllTraceRuns = useCallback((runIds: string[]) => {
    setExpandedTraceRuns((prev) => {
      const next = { ...prev };
      for (const id of runIds) {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const handleCollapseAllTraceRuns = useCallback((runIds: string[]) => {
    setExpandedTraceRuns((prev) => {
      const next = { ...prev };
      for (const id of runIds) {
        delete next[id];
      }
      return next;
    });
  }, []);

  const handleToggleTraceRun = useCallback((runId: string) => {
    setExpandedTraceRuns((prev) => ({
      ...prev,
      [runId]: !prev[runId],
    }));
  }, []);

  const handleCopyTraceRun = useCallback(async (run: VisibleTraceRun) => {
    try {
      const runLabel = translate(locale, "agent.trace.run", { index: run.runIndex });
      const start = formatTraceEventTime(locale, run.startedAt);
      const end = formatTraceEventTime(locale, run.endedAt);
      const durationSec = Math.max(0, ((run.endedAt - run.startedAt) / 1000)).toFixed(1);
      const terminal = run.terminalReason
        ? formatTerminalReason(locale, run.terminalReason)
        : translate(locale, "agent.trace.runStatusOngoing");
      const categoryLines = TRACE_CATEGORY_ORDER.map((category) => {
        return `${translate(locale, `agent.trace.bucket.${category}`)}: ${run.categoryCounts[category]}`;
      });
      const lines = run.visibleEvents.map((event) => {
        const eventLabel =
          formatLatestTraceEventLabel(locale, event) ??
          translate(locale, "agent.trace.event.unknown");
        const at = formatTraceEventTime(locale, event.at);
        const severity = getTraceEventSeverity(event).toUpperCase();
        return `[${at}] [${severity}] [${event.type}] ${eventLabel}`;
      });
      const payload = [
        `${runLabel}`,
        `${translate(locale, "agent.trace.runStatus")}: ${terminal}`,
        `${translate(locale, "agent.trace.runRange")}: ${start} -> ${end}`,
        `${translate(locale, "agent.trace.runDuration", { seconds: durationSec })}`,
        `${translate(locale, "agent.trace.runEvents", { count: run.visibleEvents.length })}`,
        `${translate(locale, "agent.trace.runWarnings", { count: run.visibleWarningCount })}`,
        `${translate(locale, "agent.trace.runErrors", { count: run.visibleErrorCount })}`,
        ...categoryLines,
        "",
        ...lines,
      ].join("\n");
      await navigator.clipboard.writeText(payload);
      toast.success(translate(locale, "agent.trace.copySuccess"));
    } catch (error) {
      console.warn("Failed to copy trace run:", error);
      toast.error(translate(locale, "agent.trace.copyFailed"));
    }
  }, [locale]);

  const runTerminalCommand = useCallback(async (rawCommand: string) => {
    const command = rawCommand.trim();
    if (!command) return { success: false } as const;

    const runId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startAt = Date.now();
    const shellType = terminalShellType;
    setTerminalRuns((prev) => [
      ...prev,
      {
        id: runId,
        command,
        shell: shellType,
        status: "running",
        stdout: "",
        stderr: "",
        startedAt: startAt,
        expanded: false,
        liveLogs: [],
      },
    ]);

    try {
      const request =
        shellType === "cmd"
          ? {
            cmd: "cmd",
            args: ["/c", command],
            cwd: effectiveWorkingDir || null,
            timeout_ms: 300000,
            command_id: runId,
          }
          : {
            cmd: "powershell",
            args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            cwd: effectiveWorkingDir || null,
            timeout_ms: 300000,
            command_id: runId,
          };

      const response: any = await invoke("invoke_agent_task_execution", { request });
      const nextStatus =
        response?.success || response?.interrupted ? "completed" : "error";

      flushQueuedTerminalLogs();
      setTerminalRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? {
              ...run,
              status: nextStatus,
              stdout: String(response?.stdout || ""),
              stderr: String(response?.stderr || ""),
              exitCode: typeof response?.exit_code === "number" ? response.exit_code : null,
              interrupted: Boolean(response?.interrupted),
              endedAt: Date.now(),
            }
            : run,
        ),
      );

      return {
        success: Boolean(response?.success || response?.interrupted),
        response,
      } as const;
    } catch (error) {
      const errorText = String(error);
      flushQueuedTerminalLogs();
      setTerminalRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? {
              ...run,
              status: "error",
              stderr: errorText,
              endedAt: Date.now(),
            }
            : run,
        ),
      );

      return {
        success: false,
        error: errorText,
      } as const;
    }
  }, [terminalShellType, effectiveWorkingDir, flushQueuedTerminalLogs]);

  const handleRunTerminalCommand = useCallback(async () => {
    const command = terminalInput.trim();
    if (!command) return;
    setTerminalInput("");
    await runTerminalCommand(command);
  }, [terminalInput, runTerminalCommand]);

  const handleToggleTerminalRunExpanded = useCallback((runId: string) => {
    setTerminalRuns((prev) =>
      prev.map((run) =>
        run.id === runId ? { ...run, expanded: !run.expanded } : run,
      ),
    );
  }, []);

  const handleClearTerminalRuns = useCallback(() => {
    if (terminalLogFlushTimerRef.current !== null) {
      window.clearTimeout(terminalLogFlushTimerRef.current);
      terminalLogFlushTimerRef.current = null;
    }
    terminalLogQueueRef.current.clear();
    setTerminalRuns([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isThinking) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey) return;
      if (event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      handleStop();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleStop, isThinking]);

  const handleClear = () => {
    denyAllPermissionPrompts();
    setExpandedTraceRuns({});
    setSelectedTraceTool(null);
    engineRef.current?.clear();
    const nextMessages: AgentMessage[] = [{
      id: "init-" + Date.now(),
      role: "assistant",
      content: `${translate(locale, "common.clear")}...`,
      status: "completed"
    }];
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
    lastPersistedStateRef.current = null;
  };

  const toolCallCount = useMemo(
    () => messages.reduce((acc, message) => acc + (message.steps?.length || 0), 0),
    [messages],
  );
  const virtualListOverscan = useMemo(() => {
    if (messages.length > 500) return 2;
    if (messages.length > 240) return 3;
    if (messages.length > 120) return 4;
    return 5;
  }, [messages.length]);
  const virtualEstimateHeight = useMemo(() => {
    if (messages.length > 500) return 240;
    return 260;
  }, [messages.length]);
  const previousToolArgsByMessageId = useMemo(() => {
    const lookup = new Map<string, Record<string, string>>();
    const rolling = new Map<string, string>();
    const startIndex = Math.max(0, messages.length - TOOL_ARGS_HISTORY_SCAN_LIMIT);

    for (let index = startIndex; index < messages.length; index += 1) {
      const message = messages[index];
      lookup.set(message.id, Object.fromEntries(rolling.entries()));
      if (!message.steps || message.steps.length === 0) continue;
      for (const step of message.steps) {
        const toolName = step.toolRender?.toolName;
        const callArgs = step.toolRender?.callArguments;
        if (toolName && callArgs) {
          rolling.set(toolName, callArgs);
        }
      }
    }
    return lookup;
  }, [messages]);

  const renderVirtualMessageItem = useCallback((message: AgentMessage) => {
    const previousCallArgsByTool = previousToolArgsByMessageId.get(message.id) ?? {};
    const previousArgsSnapshot = getPreviousArgsSnapshot(previousCallArgsByTool);
    return (
      <AgentMessageItem
        message={message}
        contentSnapshot={getMessageContentSnapshot(message)}
        statusSnapshot={message.status ?? ""}
        stepsSnapshot={getMessageStepsSnapshot(message)}
        previousCallArgsByTool={previousCallArgsByTool}
        previousArgsSnapshot={previousArgsSnapshot}
      />
    );
  }, [previousToolArgsByMessageId]);

  const diffPanelText = useMemo(
    () => ({
      open: translate(locale, "agent.diff.open"),
      close: translate(locale, "agent.diff.close"),
      expand: translate(locale, "agent.diff.expand"),
      restore: translate(locale, "agent.diff.restore"),
      menu: translate(locale, "agent.diff.menu"),
      splitView: translate(locale, "agent.diff.splitView"),
      disableWrap: translate(locale, "agent.diff.disableWrap"),
      collapseAll: translate(locale, "agent.diff.collapseAll"),
      noFullFile: translate(locale, "agent.diff.noFullFile"),
      richPreview: translate(locale, "agent.diff.richPreview"),
      disableTextDiff: translate(locale, "agent.diff.disableTextDiff"),
      copyGitApply: translate(locale, "agent.diff.copyGitApply"),
      scopeUnstaged: translate(locale, "agent.diff.scopeUnstaged"),
      scopeStaged: translate(locale, "agent.diff.scopeStaged"),
      scopeAllBranches: translate(locale, "agent.diff.scopeAllBranches"),
      scopeLastRound: translate(locale, "agent.diff.scopeLastRound"),
      textDiffDisabledHint: translate(locale, "agent.diff.textDiffDisabledHint"),
      collapsedHint: translate(locale, "agent.diff.collapsedHint"),
      noLastRoundChanges: translate(locale, "agent.diff.noLastRoundChanges"),
      title: translate(locale, "agent.diff.title"),
      refresh: translate(locale, "agent.diff.refresh"),
      loading: translate(locale, "agent.diff.loading"),
      noWorkspace: translate(locale, "agent.diff.noWorkspace"),
      chooseWorkspace: translate(locale, "agent.diff.chooseWorkspace"),
      chooseWorkspaceHint: translate(locale, "agent.diff.chooseWorkspaceHint"),
      notRepo: translate(locale, "agent.diff.notRepo"),
      branch: translate(locale, "agent.diff.branch"),
      changed: translate(locale, "agent.diff.changed"),
      commits: translate(locale, "agent.diff.commits"),
      clean: translate(locale, "agent.diff.clean"),
      updatedAt: translate(locale, "agent.diff.updatedAt"),
      unknown: translate(locale, "agent.diff.unknown"),
      initRepo: translate(locale, "agent.diff.initRepo"),
      initRepoHint: translate(locale, "agent.diff.initRepoHint"),
      noCommits: translate(locale, "agent.diff.noCommits"),
      rewindPreview: translate(locale, "agent.rewind.previewAction"),
      rewindApply: translate(locale, "agent.rewind.applyAction"),
      diagnosisCockpit: translate(locale, "agent.diff.diagnosisCockpit"),
      diagnosisLatestActivity: translate(locale, "agent.diff.diagnosisLatestActivity"),
      diagnosisNoSignals: translate(locale, "agent.diff.diagnosisNoSignals"),
      diagnosisQueueTitle: translate(locale, "agent.diff.diagnosisQueueTitle"),
      diagnosisFallbackTitle: translate(locale, "agent.diff.diagnosisFallbackTitle"),
      diagnosisFallbackSummary: translate(locale, "agent.diff.diagnosisFallbackSummary", {
        suppressed: "{suppressed}",
        used: "{used}",
        ratio: "{ratio}",
      }),
      diagnosisFallbackPrepare: translate(locale, "agent.diff.diagnosisFallbackPrepare"),
      diagnosisFallbackRun: translate(locale, "agent.diff.diagnosisFallbackRun"),
      diagnosisFallbackPrepared: translate(locale, "agent.diff.diagnosisFallbackPrepared"),
      diagnosisFallbackStarted: translate(locale, "agent.diff.diagnosisFallbackStarted"),
      diagnosisFallbackQueued: translate(locale, "agent.diff.diagnosisFallbackQueued"),
      diagnosisFallbackMissingThread: translate(locale, "agent.diff.diagnosisFallbackMissingThread"),
      diagnosisQueueTrack: translate(locale, "agent.diff.diagnosisQueueTrack"),
      diagnosisQueueTrackEmpty: translate(locale, "agent.diff.diagnosisQueueTrackEmpty"),
      diagnosisRunbookActionsTitle: translate(locale, "agent.diff.diagnosisRunbookActionsTitle"),
      diagnosisActionPrepare: translate(locale, "agent.diff.diagnosisActionPrepare"),
      diagnosisActionRun: translate(locale, "agent.diff.diagnosisActionRun"),
      diagnosisRecommendationsTitle: translate(locale, "agent.diff.diagnosisRecommendationsTitle"),
      diagnosisRecommendationsEmpty: translate(locale, "agent.diff.diagnosisRecommendationsEmpty"),
      diagnosisRecommendationQueueReason: translate(locale, "agent.diff.diagnosisRecommendationQueueReason"),
      diagnosisRecommendationFallbackReason: translate(locale, "agent.diff.diagnosisRecommendationFallbackReason"),
      diagnosisRecommendationHotspotReason: translate(locale, "agent.diff.diagnosisRecommendationHotspotReason"),
      diagnosisRecommendationFailedReason: translate(locale, "agent.diff.diagnosisRecommendationFailedReason"),
      diagnosisSeverityHigh: translate(locale, "agent.diff.diagnosisSeverityHigh"),
      diagnosisSeverityMedium: translate(locale, "agent.diff.diagnosisSeverityMedium"),
      diagnosisSeverityLow: translate(locale, "agent.diff.diagnosisSeverityLow"),
      diagnosisRiskMatrix: translate(locale, "agent.diff.diagnosisRiskMatrix"),
      diagnosisRootSummaryTitle: translate(locale, "agent.diff.diagnosisRootSummaryTitle"),
      diagnosisHistoryTitle: translate(locale, "agent.diff.diagnosisHistoryTitle"),
      diagnosisHistoryEmpty: translate(locale, "agent.diff.diagnosisHistoryEmpty"),
      diagnosisLifecycleTitle: translate(locale, "agent.diff.diagnosisLifecycleTitle"),
      diagnosisLifecycleEmpty: translate(locale, "agent.diff.diagnosisLifecycleEmpty"),
      diagnosisLifecycleExpand: translate(locale, "agent.diff.diagnosisLifecycleExpand"),
      diagnosisLifecycleCollapse: translate(locale, "agent.diff.diagnosisLifecycleCollapse"),
      diagnosisLifecycleEvents: translate(locale, "agent.diff.diagnosisLifecycleEvents"),
      diagnosisReplay: translate(locale, "agent.diff.diagnosisReplay"),
      diagnosisReplayFailed: translate(locale, "agent.diff.diagnosisReplayFailed"),
      diagnosisReplayStarted: translate(locale, "agent.diff.diagnosisReplayStarted"),
      diagnosisReplayQueued: translate(locale, "agent.diff.diagnosisReplayQueued"),
      diagnosisReplayMissing: translate(locale, "agent.diff.diagnosisReplayMissing"),
      diagnosisReplayFailedMissing: translate(locale, "agent.diff.diagnosisReplayFailedMissing"),
      diagnosisFixProposal: translate(locale, "agent.diff.diagnosisFixProposal"),
      diagnosisFixProposalPrepared: translate(locale, "agent.diff.diagnosisFixProposalPrepared"),
      diagnosisFilterAll: translate(locale, "agent.diff.diagnosisFilterAll"),
      diagnosisFilterActive: translate(locale, "agent.diff.diagnosisFilterActive"),
      diagnosisFilterFailed: translate(locale, "agent.diff.diagnosisFilterFailed"),
      diagnosisFilterKindAll: translate(locale, "agent.diff.diagnosisFilterKindAll"),
      diagnosisSortRecent: translate(locale, "agent.diff.diagnosisHistorySortRecent"),
      diagnosisSortRisk: translate(locale, "agent.diff.diagnosisHistorySortRisk"),
      diagnosisRunbookCopy: translate(locale, "agent.diff.diagnosisRunbookCopy"),
      diagnosisRunbookCopied: translate(locale, "agent.diff.diagnosisRunbookCopied"),
      diagnosisRunbookCopyFailed: translate(locale, "agent.diff.diagnosisRunbookCopyFailed"),
      diagnosisFailureClustersTitle: translate(locale, "agent.diff.diagnosisFailureClustersTitle"),
      diagnosisFailureClustersEmpty: translate(locale, "agent.diff.diagnosisFailureClustersEmpty"),
      diagnosisFailureClusterCount: translate(locale, "agent.diff.diagnosisFailureClusterCount", { count: "{count}" }),
      diagnosisClusterFirstSeen: translate(locale, "agent.diff.diagnosisClusterFirstSeen"),
      diagnosisClusterDuration: translate(locale, "agent.diff.diagnosisClusterDuration"),
      diagnosisClusterRecovery: translate(locale, "agent.diff.diagnosisClusterRecovery"),
      diagnosisClusterTrend: translate(locale, "agent.diff.diagnosisClusterTrend"),
      diagnosisTrendImproving: translate(locale, "agent.diff.diagnosisTrendImproving"),
      diagnosisTrendDegrading: translate(locale, "agent.diff.diagnosisTrendDegrading"),
      diagnosisTrendFlaky: translate(locale, "agent.diff.diagnosisTrendFlaky"),
      diagnosisTrendStable: translate(locale, "agent.diff.diagnosisTrendStable"),
      diagnosisReplayTemplatesTitle: translate(locale, "agent.diff.diagnosisReplayTemplatesTitle"),
      diagnosisReplayTemplatesEmpty: translate(locale, "agent.diff.diagnosisReplayTemplatesEmpty"),
      diagnosisReplayTemplateContextReady: translate(locale, "agent.diff.diagnosisReplayTemplateContextReady"),
      diagnosisReplayCompareTitle: translate(locale, "agent.diff.diagnosisReplayCompareTitle"),
      diagnosisReplayCompareEmpty: translate(locale, "agent.diff.diagnosisReplayCompareEmpty"),
      diagnosisReplayCompareBefore: translate(locale, "agent.diff.diagnosisReplayCompareBefore"),
      diagnosisReplayCompareAfter: translate(locale, "agent.diff.diagnosisReplayCompareAfter"),
      diagnosisReplayCompareDelta: translate(locale, "agent.diff.diagnosisReplayCompareDelta"),
      diagnosisReplayCompareOutcome: translate(locale, "agent.diff.diagnosisReplayCompareOutcome"),
      diagnosisReplayCompareOutcomeImproved: translate(locale, "agent.diff.diagnosisReplayCompareOutcomeImproved"),
      diagnosisReplayCompareOutcomeRegressed: translate(locale, "agent.diff.diagnosisReplayCompareOutcomeRegressed"),
      diagnosisReplayCompareOutcomeFlaky: translate(locale, "agent.diff.diagnosisReplayCompareOutcomeFlaky"),
      diagnosisReplayCompareOutcomeUnchanged: translate(locale, "agent.diff.diagnosisReplayCompareOutcomeUnchanged"),
    }),
    [locale],
  );

  const diffChangedFiles = useMemo(() => {
    if (!gitSnapshot?.status_short) return [];
    return gitSnapshot.status_short
      .map((line) => parseGitStatusEntry(line))
      .filter((entry): entry is { code: string; path: string } => Boolean(entry));
  }, [gitSnapshot?.status_short]);

  useEffect(() => {
    if (isThinking && !wasThinkingRef.current) {
      roundStartChangedFilesRef.current = diffChangedFiles;
    }
    if (!isThinking && wasThinkingRef.current) {
      const beforeKeys = new Set(
        roundStartChangedFilesRef.current.map((entry) => `${entry.code}:${entry.path}`),
      );
      const delta = diffChangedFiles.filter((entry) => !beforeKeys.has(`${entry.code}:${entry.path}`));
      setLastRoundChangedFiles(delta);
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking, diffChangedFiles]);

  const diffBranch = gitSnapshot?.branch?.trim() || diffPanelText.unknown;
  const diffBaseBranch = gitSnapshot?.default_branch?.trim() || diffPanelText.unknown;
  const diffUpdatedText = gitSnapshotUpdatedAt
    ? new Date(gitSnapshotUpdatedAt).toLocaleTimeString(locale, { hour12: false })
    : null;
  const diffScopeLabel = useMemo(() => {
    switch (diffScope) {
      case "unstaged":
        return diffPanelText.scopeUnstaged;
      case "staged":
        return diffPanelText.scopeStaged;
      case "lastRound":
        return diffPanelText.scopeLastRound;
      case "allBranches":
      default:
        return diffPanelText.scopeAllBranches;
    }
  }, [diffScope, diffPanelText]);
  const visibleDiffChangedFiles = useMemo(() => {
    if (diffScope === "allBranches") return diffChangedFiles;
    if (diffScope === "lastRound") return lastRoundChangedFiles;
    if (diffScope === "staged") {
      return diffChangedFiles.filter((entry) => entry.code !== "??" && entry.code.charAt(0) !== " ");
    }
    return diffChangedFiles.filter((entry) => entry.code === "??" || entry.code.charAt(1) !== " ");
  }, [diffScope, diffChangedFiles, lastRoundChangedFiles]);
  const useTwoColumnDiffLayout = diffSplitViewEnabled && (isDiffPanelExpanded || diffPanelSizePct >= 38);
  const canCopyGitApplyCommand = Boolean(effectiveWorkingDir) && visibleDiffChangedFiles.length > 0;
  const handleCreateGitRepository = useCallback(async () => {
    if (!effectiveWorkingDir) {
      toast.error(translate(locale, "agent.sidebarThreadWorkspaceMissing"));
      return;
    }
    setIsConsolePanelOpen(true);
    const result = await runTerminalCommand("git init");
    if (result.success) {
      await loadGitSnapshot();
    }
  }, [effectiveWorkingDir, runTerminalCommand, loadGitSnapshot, locale]);
  const handleCopyGitApplyCommand = useCallback(async () => {
    if (!effectiveWorkingDir) return;
    const command = `git -C "${effectiveWorkingDir}" apply changes.patch`;
    await navigator.clipboard.writeText(command);
  }, [effectiveWorkingDir]);
  const consoleText = useMemo(
    () => ({
      open: translate(locale, "agent.console.open"),
      close: translate(locale, "agent.console.close"),
      title: translate(locale, "agent.console.title"),
      run: translate(locale, "agent.console.run"),
      clear: translate(locale, "agent.console.clear"),
      placeholder:
        terminalShellType === "cmd"
          ? translate(locale, "agent.console.placeholderCmd")
          : translate(locale, "agent.console.placeholderPowerShell"),
      empty: translate(locale, "agent.console.empty"),
      executed: translate(locale, "agent.console.executed"),
      shell: translate(locale, "agent.console.shell"),
      command: translate(locale, "agent.console.command"),
      process: translate(locale, "agent.console.process"),
      running: translate(locale, "agent.console.running"),
      output: translate(locale, "agent.console.output"),
      error: translate(locale, "agent.console.error"),
      lines: translate(locale, "agent.console.lines"),
      emptyValue: translate(locale, "agent.console.emptyValue"),
      noneValue: translate(locale, "agent.console.noneValue"),
    }),
    [locale, terminalShellType],
  );
  const tracePanelText = useMemo(
    () => ({
      open: translate(locale, "agent.trace.panelOpen"),
      close: translate(locale, "agent.trace.panelClose"),
      recent: translate(locale, "agent.trace.recent"),
      empty: translate(locale, "agent.trace.empty"),
      clear: translate(locale, "agent.trace.clear"),
      filterAll: translate(locale, "agent.trace.filter.all"),
      filterQueue: translate(locale, "agent.trace.filter.queue"),
      filterTools: translate(locale, "agent.trace.filter.tools"),
      filterPermission: translate(locale, "agent.trace.filter.permission"),
      filterQuery: translate(locale, "agent.trace.filter.query"),
      filterPrompt: translate(locale, "agent.trace.filter.prompt"),
      filterRetry: translate(locale, "agent.trace.filter.retry"),
      filterContinue: translate(locale, "agent.trace.filter.continue"),
      warningsOnly: translate(locale, "agent.trace.filter.warningsOnly"),
      failureFocus: translate(locale, "agent.trace.filter.failureFocus"),
      riskLabel: translate(locale, "agent.trace.risk.label"),
      riskReversibilityLabel: translate(locale, "agent.permission.prompt.reversibility"),
      riskBlastRadiusLabel: translate(locale, "agent.permission.prompt.blastRadius"),
      riskAll: translate(locale, "agent.trace.risk.all"),
      riskCritical: translate(locale, "agent.trace.permissionRisk.critical"),
      riskHighRisk: translate(locale, "agent.trace.permissionRisk.high_risk"),
      riskInteractive: translate(locale, "agent.trace.permissionRisk.interactive"),
      riskPathOutside: translate(locale, "agent.trace.permissionRisk.path_outside"),
      riskPolicy: translate(locale, "agent.trace.permissionRisk.policy"),
      reversibilityReversible: translate(locale, "agent.permission.prompt.reversibility.reversible"),
      reversibilityMixed: translate(locale, "agent.permission.prompt.reversibility.mixed"),
      reversibilityHardToReverse: translate(locale, "agent.permission.prompt.reversibility.hard_to_reverse"),
      blastLocal: translate(locale, "agent.permission.prompt.blastRadius.local"),
      blastWorkspace: translate(locale, "agent.permission.prompt.blastRadius.workspace"),
      blastShared: translate(locale, "agent.permission.prompt.blastRadius.shared"),
      levelInfo: translate(locale, "agent.trace.level.info"),
      levelWarn: translate(locale, "agent.trace.level.warn"),
      levelError: translate(locale, "agent.trace.level.error"),
      run: translate(locale, "agent.trace.run", { index: "{index}" }),
      runStatus: translate(locale, "agent.trace.runStatus"),
      runRange: translate(locale, "agent.trace.runRange"),
      runDuration: translate(locale, "agent.trace.runDuration", { seconds: "{seconds}" }),
      runEvents: translate(locale, "agent.trace.runEvents", { count: "{count}" }),
      runWarnings: translate(locale, "agent.trace.runWarnings", { count: "{count}" }),
      runErrors: translate(locale, "agent.trace.runErrors", { count: "{count}" }),
      runStatusOngoing: translate(locale, "agent.trace.runStatusOngoing"),
      runExpand: translate(locale, "agent.trace.runExpand"),
      runCollapse: translate(locale, "agent.trace.runCollapse"),
      runExpandAll: translate(locale, "agent.trace.runExpandAll"),
      runCollapseAll: translate(locale, "agent.trace.runCollapseAll"),
      copyRun: translate(locale, "agent.trace.copyRun"),
      bucketQuery: translate(locale, "agent.trace.bucket.query"),
      bucketTools: translate(locale, "agent.trace.bucket.tools"),
      bucketPermission: translate(locale, "agent.trace.bucket.permission"),
      bucketQueue: translate(locale, "agent.trace.bucket.queue"),
      bucketRetry: translate(locale, "agent.trace.bucket.retry"),
      bucketContinue: translate(locale, "agent.trace.bucket.continue"),
      hotspots: translate(locale, "agent.trace.hotspots"),
      hotspotsEmpty: translate(locale, "agent.trace.hotspotsEmpty"),
      hotspotFocusHottest: translate(locale, "agent.trace.hotspotFocusHottest"),
      hotspotInvestigate: translate(locale, "agent.trace.hotspotInvestigate"),
      hotspotPrepareCommand: translate(locale, "agent.trace.hotspotPrepareCommand"),
      hotspotPrepareSummary: translate(locale, "agent.trace.hotspotPrepareSummary"),
      hotspotRunSummary: translate(locale, "agent.trace.hotspotRunSummary"),
      hotspotPrepareHotspots: translate(locale, "agent.trace.hotspotPrepareHotspots"),
      hotspotRunHotspots: translate(locale, "agent.trace.hotspotRunHotspots"),
      hotspotQueueDiagnostics: translate(locale, "agent.trace.hotspotQueueDiagnostics"),
      hotspotPrepareQueueDiagnostics: translate(locale, "agent.trace.hotspotPrepareQueueDiagnostics"),
      hotspotRunQueueDiagnostics: translate(locale, "agent.trace.hotspotRunQueueDiagnostics"),
      hotspotPrepareQueueDiagnosticsReady: translate(locale, "agent.trace.hotspotPrepareQueueDiagnosticsReady"),
      hotspotRunQueueDiagnosticsStarted: translate(locale, "agent.trace.hotspotRunQueueDiagnosticsStarted"),
      hotspotRunQueueDiagnosticsQueued: translate(locale, "agent.trace.hotspotRunQueueDiagnosticsQueued"),
      diagnosisTitle: translate(locale, "agent.trace.diagnosis.title"),
      diagnosisRootCause: translate(locale, "agent.trace.diagnosis.rootCause"),
      diagnosisMinimalFix: translate(locale, "agent.trace.diagnosis.minimalFix"),
      diagnosisVerify: translate(locale, "agent.trace.diagnosis.verify"),
      diagnosisQueueTitle: translate(locale, "agent.trace.diagnosis.queue.title"),
      diagnosisQueueSummary: translate(locale, "agent.trace.diagnosis.queue.summary", {
        pressure: "{pressure}",
        depth: "{depth}",
      }),
      diagnosisQueueRootCause: translate(locale, "agent.trace.diagnosis.queue.rootCause"),
      diagnosisQueueFix: translate(locale, "agent.trace.diagnosis.queue.fix"),
      diagnosisQueueVerify: translate(locale, "agent.trace.diagnosis.queue.verify"),
      diagnosisHotspotTitle: translate(locale, "agent.trace.diagnosis.hotspot.title", { tool: "{tool}" }),
      diagnosisHotspotSummary: translate(locale, "agent.trace.diagnosis.hotspot.summary", {
        total: "{total}",
        errors: "{errors}",
        rejected: "{rejected}",
        denied: "{denied}",
      }),
      diagnosisHotspotRootCause: translate(locale, "agent.trace.diagnosis.hotspot.rootCause"),
      diagnosisHotspotFix: translate(locale, "agent.trace.diagnosis.hotspot.fix"),
      diagnosisHotspotVerify: translate(locale, "agent.trace.diagnosis.hotspot.verify"),
      hotspotWindow: translate(locale, "agent.trace.hotspotWindow"),
      hotspotRuns3: translate(locale, "agent.trace.hotspotWindow.runs", { count: 3 }),
      hotspotRuns6: translate(locale, "agent.trace.hotspotWindow.runs", { count: 6 }),
      hotspotAll: translate(locale, "agent.trace.hotspotWindow.all"),
      queuePriorityTitle: translate(locale, "agent.trace.queuePriority.title"),
      queuePressureTitle: translate(locale, "agent.trace.queuePressure.title"),
      queuePressureIdle: translate(locale, "agent.trace.queuePressure.idle"),
      queuePressureBusy: translate(locale, "agent.trace.queuePressure.busy"),
      queuePressureCongested: translate(locale, "agent.trace.queuePressure.congested"),
      queuePressureSaturated: translate(locale, "agent.trace.queuePressure.saturated"),
      commandStatusQueued: translate(locale, "agent.trace.commandStatus.queued"),
      commandStatusPrepared: translate(locale, "agent.trace.commandStatus.prepared"),
      commandStatusStarted: translate(locale, "agent.trace.commandStatus.started"),
      commandStatusCompleted: translate(locale, "agent.trace.commandStatus.completed"),
      commandStatusFailed: translate(locale, "agent.trace.commandStatus.failed"),
      commandStatusAborted: translate(locale, "agent.trace.commandStatus.aborted"),
      toolFocusClear: translate(locale, "agent.trace.toolFocus.clear"),
      toolFocusActive: translate(locale, "agent.trace.toolFocus.active", { tool: "{tool}" }),
      promptInspectorTitle: translate(locale, "agent.trace.promptInspector.title"),
      promptInspectorEmpty: translate(locale, "agent.trace.promptInspector.empty"),
      promptInspectorSections: translate(locale, "agent.trace.promptInspector.sections"),
      promptInspectorChars: translate(locale, "agent.trace.promptInspector.chars"),
      promptInspectorStaticIds: translate(locale, "agent.trace.promptInspector.staticIds"),
      promptInspectorDynamicIds: translate(locale, "agent.trace.promptInspector.dynamicIds"),
      promptInspectorHashes: translate(locale, "agent.trace.promptInspector.hashes"),
      promptInspectorTags: translate(locale, "agent.trace.promptInspector.tags"),
      promptInspectorGovernance: translate(locale, "agent.trace.promptInspector.governance"),
      promptInspectorSectionMeta: translate(locale, "agent.trace.promptInspector.sectionMeta"),
      promptInspectorExpand: translate(locale, "agent.trace.promptInspector.expand"),
      promptInspectorCollapse: translate(locale, "agent.trace.promptInspector.collapse"),
      promptInspectorCopy: translate(locale, "agent.trace.promptInspector.copy"),
      promptInspectorCopySuccess: translate(locale, "agent.trace.promptInspector.copySuccess"),
      promptInspectorCopyFailed: translate(locale, "agent.trace.promptInspector.copyFailed"),
      promptInspectorColumnKind: translate(locale, "agent.trace.promptInspector.column.kind"),
      promptInspectorColumnOwner: translate(locale, "agent.trace.promptInspector.column.owner"),
      promptInspectorColumnMutable: translate(locale, "agent.trace.promptInspector.column.mutable"),
      promptInspectorColumnLaunchTag: translate(locale, "agent.trace.promptInspector.column.launchTag"),
      promptInspectorMutableYes: translate(locale, "agent.trace.promptInspector.mutableYes"),
      promptInspectorMutableNo: translate(locale, "agent.trace.promptInspector.mutableNo"),
      promptInspectorLaunchTagNone: translate(locale, "agent.trace.promptInspector.launchTagNone"),
    }),
    [locale],
  );
  const traceFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: tracePanelText.filterAll },
      { key: "query" as const, label: tracePanelText.filterQuery },
      { key: "prompt" as const, label: tracePanelText.filterPrompt },
      { key: "tools" as const, label: tracePanelText.filterTools },
      { key: "permission" as const, label: tracePanelText.filterPermission },
      { key: "queue" as const, label: tracePanelText.filterQueue },
      { key: "retry" as const, label: tracePanelText.filterRetry },
      { key: "continue" as const, label: tracePanelText.filterContinue },
    ],
    [tracePanelText],
  );
  const traceEventsChronological = useMemo<QueryStreamEvent[]>(() => {
    if (!isTracePanelOpen) {
      return [];
    }
    return engineRuntimeSnapshot.recentEvents.map((event) => ({ ...event }));
  }, [isTracePanelOpen, engineRuntimeSnapshot.recentEvents]);
  const activeTraceQuickLifecycle = useMemo(() => {
    const commandId = traceQuickCommandState?.commandId;
    if (!commandId) {
      return null;
    }
    void lastStreamEventAt;
    return engineRef.current?.getCommandLifecycle(commandId) ?? null;
  }, [traceQuickCommandState?.commandId, lastStreamEventAt]);
  const latestPromptCompiled = useMemo(() => {
    const events = engineRuntimeSnapshot.recentEvents;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === "prompt_compiled") {
        return event;
      }
    }
    return null;
  }, [engineRuntimeSnapshot.recentEvents]);
  const latestPromptStaticIds = latestPromptCompiled?.staticSectionIds ?? EMPTY_STRING_LIST;
  const latestPromptDynamicIds = latestPromptCompiled?.dynamicSectionIds ?? EMPTY_STRING_LIST;
  const latestPromptModelLaunchTags = latestPromptCompiled?.modelLaunchTags ?? EMPTY_STRING_LIST;
  const latestPromptSectionMetadata = latestPromptCompiled?.sectionMetadata ?? EMPTY_PROMPT_SECTIONS;
  const latestPromptSectionMetaPreview = useMemo(() => {
    if (latestPromptSectionMetadata.length === 0) {
      return [];
    }
    return latestPromptSectionMetadata.slice(0, 10).map((section) => {
      const tag = section.modelLaunchTag ? `|${section.modelLaunchTag}` : "";
      return `${section.id}[${section.kind}|${section.owner}|${section.mutable ? "mutable" : "locked"}${tag}]`;
    });
  }, [latestPromptSectionMetadata]);
  const latestPromptGovernance = useMemo(() => {
    if (latestPromptSectionMetadata.length === 0) {
      return null;
    }
    return summarizePromptGovernance(latestPromptSectionMetadata);
  }, [latestPromptSectionMetadata]);
  const latestPromptSectionRows = useMemo(
    () =>
      latestPromptSectionMetadata.map((section, index) => ({
        index: index + 1,
        ...section,
      })),
    [latestPromptSectionMetadata],
  );
  const promptInspectorCopyPayload = useMemo(() => {
    if (!latestPromptCompiled) {
      return "";
    }
    return JSON.stringify(
      {
        compiledAt: new Date(latestPromptCompiled.at).toISOString(),
        sections: {
          staticCount: latestPromptCompiled.staticSections,
          dynamicCount: latestPromptCompiled.dynamicSections,
          staticIds: latestPromptStaticIds,
          dynamicIds: latestPromptDynamicIds,
        },
        chars: {
          staticChars: latestPromptCompiled.staticChars,
          dynamicChars: latestPromptCompiled.dynamicChars,
          totalChars: latestPromptCompiled.totalChars,
        },
        hashes: {
          staticHash: latestPromptCompiled.staticHash ?? null,
          dynamicHash: latestPromptCompiled.dynamicHash ?? null,
        },
        modelLaunchTags: latestPromptModelLaunchTags,
        governance: latestPromptGovernance,
        sectionMetadata: latestPromptSectionMetadata,
      },
      null,
      2,
    );
  }, [
    latestPromptCompiled,
    latestPromptDynamicIds,
    latestPromptGovernance,
    latestPromptModelLaunchTags,
    latestPromptSectionMetadata,
    latestPromptStaticIds,
  ]);
  useEffect(() => {
    if (!latestPromptCompiled) {
      setIsPromptGovernanceExpanded(false);
    }
  }, [latestPromptCompiled]);
  const handleCopyPromptInspector = useCallback(async () => {
    if (!promptInspectorCopyPayload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(promptInspectorCopyPayload);
      toast.success(translate(locale, "agent.trace.promptInspector.copySuccess"));
    } catch (error) {
      console.warn("Failed to copy prompt inspector payload:", error);
      toast.error(translate(locale, "agent.trace.promptInspector.copyFailed"));
    }
  }, [locale, promptInspectorCopyPayload]);
  const rawTraceEventCount = traceEventsChronological.length;
  const traceRunGroups = useMemo(
    () => buildTraceRunGroups(traceEventsChronological),
    [traceEventsChronological],
  );
  const traceRunsByCategory = useMemo<VisibleTraceRun[]>(() => {
    const next: VisibleTraceRun[] = [];
    for (const run of traceRunGroups) {
      const visibleEvents = run.events.filter((event) => {
        if (traceFilter !== "all" && getTraceEventFilter(event) !== traceFilter) {
          return false;
        }
        if (traceWarningsOnly && getTraceEventSeverity(event) === "info") {
          return false;
        }
        return true;
      });
      if (visibleEvents.length === 0) {
        continue;
      }
      const aggregates = computeTraceAggregates(visibleEvents);
      next.push({
        ...run,
        visibleEvents,
        ...aggregates,
      });
    }
    return next.slice().reverse();
  }, [traceRunGroups, traceFilter, traceWarningsOnly]);
  const traceRiskCounts = useMemo<TracePermissionRiskCounts>(() => {
    const next = createEmptyTracePermissionRiskCounts();
    for (const run of traceRunsByCategory) {
      for (const event of run.visibleEvents) {
        const risk = getTracePermissionRisk(event);
        if (risk) {
          next[risk] += 1;
        }
      }
    }
    return next;
  }, [traceRunsByCategory]);
  const traceReversibilityCounts = useMemo<TracePermissionReversibilityCounts>(() => {
    const next = createEmptyTracePermissionReversibilityCounts();
    for (const run of traceRunsByCategory) {
      for (const event of run.visibleEvents) {
        const reversibility = getTracePermissionReversibility(event);
        if (reversibility) {
          next[reversibility] += 1;
        }
      }
    }
    return next;
  }, [traceRunsByCategory]);
  const traceBlastRadiusCounts = useMemo<TracePermissionBlastRadiusCounts>(() => {
    const next = createEmptyTracePermissionBlastRadiusCounts();
    for (const run of traceRunsByCategory) {
      for (const event of run.visibleEvents) {
        const blastRadius = getTracePermissionBlastRadius(event);
        if (blastRadius) {
          next[blastRadius] += 1;
        }
      }
    }
    return next;
  }, [traceRunsByCategory]);
  const traceRiskTotalCount = useMemo(
    () =>
      traceRiskCounts.critical +
      traceRiskCounts.high_risk +
      traceRiskCounts.interactive +
      traceRiskCounts.path_outside +
      traceRiskCounts.policy,
    [traceRiskCounts],
  );
  const traceReversibilityTotalCount = useMemo(
    () =>
      traceReversibilityCounts.reversible +
      traceReversibilityCounts.mixed +
      traceReversibilityCounts.hard_to_reverse,
    [traceReversibilityCounts],
  );
  const traceBlastRadiusTotalCount = useMemo(
    () =>
      traceBlastRadiusCounts.local +
      traceBlastRadiusCounts.workspace +
      traceBlastRadiusCounts.shared,
    [traceBlastRadiusCounts],
  );
  const traceRiskFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: tracePanelText.riskAll, count: traceRiskTotalCount },
      { key: "critical" as const, label: tracePanelText.riskCritical, count: traceRiskCounts.critical },
      { key: "high_risk" as const, label: tracePanelText.riskHighRisk, count: traceRiskCounts.high_risk },
      { key: "interactive" as const, label: tracePanelText.riskInteractive, count: traceRiskCounts.interactive },
      { key: "path_outside" as const, label: tracePanelText.riskPathOutside, count: traceRiskCounts.path_outside },
      { key: "policy" as const, label: tracePanelText.riskPolicy, count: traceRiskCounts.policy },
    ],
    [tracePanelText, traceRiskCounts, traceRiskTotalCount],
  );
  const traceReversibilityFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: tracePanelText.riskAll, count: traceReversibilityTotalCount },
      {
        key: "reversible" as const,
        label: tracePanelText.reversibilityReversible,
        count: traceReversibilityCounts.reversible,
      },
      {
        key: "mixed" as const,
        label: tracePanelText.reversibilityMixed,
        count: traceReversibilityCounts.mixed,
      },
      {
        key: "hard_to_reverse" as const,
        label: tracePanelText.reversibilityHardToReverse,
        count: traceReversibilityCounts.hard_to_reverse,
      },
    ],
    [tracePanelText, traceReversibilityCounts, traceReversibilityTotalCount],
  );
  const traceBlastRadiusFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: tracePanelText.riskAll, count: traceBlastRadiusTotalCount },
      { key: "local" as const, label: tracePanelText.blastLocal, count: traceBlastRadiusCounts.local },
      {
        key: "workspace" as const,
        label: tracePanelText.blastWorkspace,
        count: traceBlastRadiusCounts.workspace,
      },
      { key: "shared" as const, label: tracePanelText.blastShared, count: traceBlastRadiusCounts.shared },
    ],
    [tracePanelText, traceBlastRadiusCounts, traceBlastRadiusTotalCount],
  );
  const visibleTraceRuns = useMemo<VisibleTraceRun[]>(() => {
    if (
      traceRiskFilter === "all" &&
      traceReversibilityFilter === "all" &&
      traceBlastRadiusFilter === "all"
    ) {
      return traceRunsByCategory;
    }
    const next: VisibleTraceRun[] = [];
    for (const run of traceRunsByCategory) {
      const visibleEvents = run.visibleEvents.filter((event) => {
        if (traceRiskFilter !== "all") {
          const risk = getTracePermissionRisk(event);
          if (!risk || risk !== traceRiskFilter) {
            return false;
          }
        }
        if (traceReversibilityFilter !== "all") {
          const reversibility = getTracePermissionReversibility(event);
          if (!reversibility || reversibility !== traceReversibilityFilter) {
            return false;
          }
        }
        if (traceBlastRadiusFilter !== "all") {
          const blastRadius = getTracePermissionBlastRadius(event);
          if (!blastRadius || blastRadius !== traceBlastRadiusFilter) {
            return false;
          }
        }
        return true;
      });
      if (visibleEvents.length === 0) {
        continue;
      }
      const aggregates = computeTraceAggregates(visibleEvents);
      next.push({
        ...run,
        visibleEvents,
        ...aggregates,
      });
    }
    return next;
  }, [traceRunsByCategory, traceRiskFilter, traceReversibilityFilter, traceBlastRadiusFilter]);
  const failureFocusedTraceRuns = useMemo(
    () =>
      traceFailureFocus
        ? visibleTraceRuns.filter((run) => run.visibleWarningCount > 0 || run.visibleErrorCount > 0)
        : visibleTraceRuns,
    [visibleTraceRuns, traceFailureFocus],
  );
  const hotspotSourceRuns = useMemo(() => {
    const selectedWindow =
      TRACE_HOTSPOT_WINDOW_OPTIONS.find((option) => option.key === traceHotspotWindow) ??
      TRACE_HOTSPOT_WINDOW_OPTIONS[1];
    if (selectedWindow.runCount === null) {
      return failureFocusedTraceRuns;
    }
    return failureFocusedTraceRuns.slice(0, selectedWindow.runCount);
  }, [failureFocusedTraceRuns, traceHotspotWindow]);
  const traceHotspotQueueEvents = useMemo(
    () =>
      hotspotSourceRuns.flatMap((run) =>
        run.visibleEvents.filter(
          (event): event is Extract<QueryStreamEvent, { type: "queue_update" }> => event.type === "queue_update",
        ),
      ),
    [hotspotSourceRuns],
  );
  const traceHotspotQueuePriorityStats = useMemo(
    () => buildTraceQueuePriorityStats(traceHotspotQueueEvents, queueLimit),
    [traceHotspotQueueEvents, queueLimit],
  );
  const traceHotspotQueuePressureLabel = useMemo(() => {
    switch (traceHotspotQueuePriorityStats.pressure) {
      case "saturated":
        return tracePanelText.queuePressureSaturated;
      case "congested":
        return tracePanelText.queuePressureCongested;
      case "busy":
        return tracePanelText.queuePressureBusy;
      case "idle":
      default:
        return tracePanelText.queuePressureIdle;
    }
  }, [traceHotspotQueuePriorityStats.pressure, tracePanelText]);
  const traceHotspotQueuePriorityVisible = useMemo(
    () => traceHotspotQueuePriorityStats.total > 0 || traceHotspotQueuePriorityStats.latestQueueDepth > 0,
    [traceHotspotQueuePriorityStats.latestQueueDepth, traceHotspotQueuePriorityStats.total],
  );
  const traceToolHotspots = useMemo(() => {
    const counter = new Map<
      string,
      { tool: string; total: number; errors: number; rejected: number; denied: number }
    >();
    for (const run of hotspotSourceRuns) {
      for (const event of run.visibleEvents) {
        if (event.type === "tool_result" && event.outcome !== "result") {
          const current = counter.get(event.tool) ?? {
            tool: event.tool,
            total: 0,
            errors: 0,
            rejected: 0,
            denied: 0,
          };
          current.total += 1;
          if (event.outcome === "error") {
            current.errors += 1;
          } else if (event.outcome === "rejected") {
            current.rejected += 1;
          }
          counter.set(event.tool, current);
        }
        if (event.type === "permission_decision" && event.behavior === "deny") {
          const current = counter.get(event.tool) ?? {
            tool: event.tool,
            total: 0,
            errors: 0,
            rejected: 0,
            denied: 0,
          };
          current.total += 1;
          current.denied += 1;
          counter.set(event.tool, current);
        }
        if (event.type === "tool_retry_guard") {
          const current = counter.get(event.tool) ?? {
            tool: event.tool,
            total: 0,
            errors: 0,
            rejected: 0,
            denied: 0,
          };
          current.total += 1;
          current.errors += 1;
          counter.set(event.tool, current);
        }
      }
    }
    return [...counter.values()]
      .sort((a, b) => b.total - a.total || b.errors - a.errors || a.tool.localeCompare(b.tool))
      .slice(0, 8);
  }, [hotspotSourceRuns]);
  const topTraceHotspot = traceToolHotspots[0] ?? null;
  const traceQueueDiagnosisVisible = useMemo(
    () =>
      traceHotspotQueuePriorityStats.pressure === "congested" ||
      traceHotspotQueuePriorityStats.pressure === "saturated",
    [traceHotspotQueuePriorityStats.pressure],
  );
  const traceHotspotDiagnosisVisible = useMemo(() => {
    if (!topTraceHotspot) {
      return false;
    }
    const anomalyCount = topTraceHotspot.errors + topTraceHotspot.rejected + topTraceHotspot.denied;
    return topTraceHotspot.total >= 2 && anomalyCount >= 2;
  }, [topTraceHotspot]);
  const traceQueueDiagnosisDepthLabel = useMemo(
    () =>
      queueLimit > 0
        ? `Q${traceHotspotQueuePriorityStats.latestQueueDepth}/${queueLimit}`
        : `Q${traceHotspotQueuePriorityStats.latestQueueDepth}`,
    [traceHotspotQueuePriorityStats.latestQueueDepth, queueLimit],
  );
  const traceQueueDiagnosisSummary = useMemo(
    () =>
      tracePanelText.diagnosisQueueSummary
        .replace("{pressure}", traceHotspotQueuePressureLabel)
        .replace("{depth}", traceQueueDiagnosisDepthLabel),
    [tracePanelText, traceHotspotQueuePressureLabel, traceQueueDiagnosisDepthLabel],
  );
  const currentThreadPermissionDiagnostics = currentThreadMeta?.diagnostics?.permission;
  const currentThreadRetryDiagnostics = currentThreadMeta?.diagnostics?.retry;
  const fallbackSuppressionRatioPct =
    typeof currentThreadRetryDiagnostics?.suppression_ratio_pct === "number"
      ? currentThreadRetryDiagnostics.suppression_ratio_pct
      : 0;
  const fallbackSuppressedCount =
    typeof currentThreadRetryDiagnostics?.fallback_suppressed === "number"
      ? currentThreadRetryDiagnostics.fallback_suppressed
      : 0;
  const fallbackUsedCount =
    typeof currentThreadRetryDiagnostics?.fallback_used === "number"
      ? currentThreadRetryDiagnostics.fallback_used
      : 0;
  const fallbackRetryEventsCount =
    typeof currentThreadRetryDiagnostics?.retry_event_count === "number"
      ? currentThreadRetryDiagnostics.retry_event_count
      : 0;
  const fallbackSuppressedReasonLabel = formatFallbackSuppressedReasonLabel(
    locale,
    currentThreadRetryDiagnostics?.last_suppressed_reason ?? null,
  );
  const fallbackRetryStrategyLabel = formatRetryStrategyLabel(
    locale,
    currentThreadRetryDiagnostics?.last_retry_strategy ?? undefined,
  );
  const fallbackInvestigateCommand = useMemo(
    () => (currentThreadMeta ? buildThreadRiskInvestigationPrompt(currentThreadMeta) : ""),
    [currentThreadMeta],
  );
  const fallbackInvestigateQueued = useMemo(
    () =>
      Boolean(fallbackInvestigateCommand) &&
      queuedQueries.some((item) => item.query.trim() === fallbackInvestigateCommand.trim()),
    [queuedQueries, fallbackInvestigateCommand],
  );
  const fallbackDiagnosisVisible = useMemo(() => {
    if (!currentThreadRetryDiagnostics) {
      return false;
    }
    return (
      fallbackSuppressedCount > 0 ||
      fallbackSuppressionRatioPct >= 20 ||
      fallbackRetryEventsCount >= 2
    );
  }, [
    currentThreadRetryDiagnostics,
    fallbackSuppressedCount,
    fallbackSuppressionRatioPct,
    fallbackRetryEventsCount,
  ]);
  const cockpitQueuePressure = useMemo(
    () => deriveQueuePressure(queuedCount, queueLimit),
    [queuedCount, queueLimit],
  );
  const cockpitQueuePressureLabel = useMemo(() => {
    switch (cockpitQueuePressure) {
      case "saturated":
        return tracePanelText.queuePressureSaturated;
      case "congested":
        return tracePanelText.queuePressureCongested;
      case "busy":
        return tracePanelText.queuePressureBusy;
      case "idle":
      default:
        return tracePanelText.queuePressureIdle;
    }
  }, [cockpitQueuePressure, tracePanelText]);
  const cockpitQueueDepthLabel = useMemo(
    () => (queueLimit > 0 ? `Q${queuedCount}/${queueLimit}` : `Q${queuedCount}`),
    [queueLimit, queuedCount],
  );
  const cockpitQueueDiagnosisVisible = useMemo(
    () =>
      traceQueueDiagnosisVisible ||
      cockpitQueuePressure === "busy" ||
      cockpitQueuePressure === "congested" ||
      cockpitQueuePressure === "saturated",
    [traceQueueDiagnosisVisible, cockpitQueuePressure],
  );
  const diagnosisCockpitVisible =
    cockpitQueueDiagnosisVisible ||
    traceHotspotDiagnosisVisible ||
    fallbackDiagnosisVisible ||
    queuedQueries.some((item) => {
      const query = item.query.trim();
      return (
        query.startsWith("/trace summary") ||
        query.startsWith("/trace hotspots") ||
        query.startsWith("/trace investigate") ||
        query.startsWith("/doctor fallback investigate")
      );
    }) ||
    Boolean(lastDiagnosisActivity);
  const inferDiagnosisKindFromCommand = useCallback((command: string): TraceQuickCommandKind | null => {
    const trimmed = command.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("/doctor fallback investigate")) {
      return "fallback_investigate";
    }
    if (trimmed.startsWith("/trace investigate")) {
      return "investigate";
    }
    if (trimmed.startsWith("/trace summary")) {
      return "summary";
    }
    if (trimmed.startsWith("/trace hotspots")) {
      if (trimmed.includes("queue warnings failure runs=3")) {
        return "queue_diagnostics";
      }
      return "hotspots";
    }
    return null;
  }, []);
  const getTraceQuickCommandStatusLabel = useCallback(
    (status: TraceQuickCommandStatus) => {
      if (status === "queued") return tracePanelText.commandStatusQueued;
      if (status === "started") return tracePanelText.commandStatusStarted;
      if (status === "prepared") return tracePanelText.commandStatusPrepared;
      if (status === "completed") return tracePanelText.commandStatusCompleted;
      if (status === "failed") return tracePanelText.commandStatusFailed;
      if (status === "aborted") return tracePanelText.commandStatusAborted;
      return translate(locale, "agent.queue.full", { count: queuedCount, limit: queueLimit });
    },
    [tracePanelText, locale, queuedCount, queueLimit],
  );
  const diagnosisQueuedItems = useMemo(
    () =>
      queuedQueries
        .map((item) => {
          const kind = inferDiagnosisKindFromCommand(item.query);
          if (!kind) {
            return null;
          }
          return {
            ...item,
            kind,
          };
        })
        .filter((item): item is QueuedQueryItem & { kind: TraceQuickCommandKind } => Boolean(item)),
    [queuedQueries, inferDiagnosisKindFromCommand],
  );
  useEffect(() => {
    if (diagnosisQueuedItems.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setDiagnosisQueueTick((prev) => prev + 1);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [diagnosisQueuedItems.length]);
  const diagnosisQueuedTrackRows = useMemo(() => {
    void diagnosisQueueTick;
    const now = Date.now();
    return diagnosisQueuedItems.map((item) => ({
      ...item,
      kindLabel:
        item.kind === "summary"
          ? tracePanelText.hotspotRunSummary
          : item.kind === "hotspots"
            ? tracePanelText.hotspotRunHotspots
            : item.kind === "queue_diagnostics"
              ? tracePanelText.hotspotRunQueueDiagnostics
              : item.kind === "fallback_investigate"
                ? diffPanelText.diagnosisFallbackRun
                : tracePanelText.hotspotInvestigate,
      priorityLabel: translate(locale, `agent.queue.priority.${item.priority}`),
      waitSeconds: Math.max(0, Math.floor((now - item.queuedAt) / 1000)),
    }));
  }, [diagnosisQueuedItems, diagnosisQueueTick, tracePanelText, diffPanelText, locale]);
  const diagnosisHistoryStatusFilterOptions = useMemo(
    () =>
      [
        { value: "all" as const, label: diffPanelText.diagnosisFilterAll },
        { value: "active" as const, label: diffPanelText.diagnosisFilterActive },
        { value: "failed" as const, label: diffPanelText.diagnosisFilterFailed },
      ] satisfies Array<{ value: DiagnosisHistoryStatusFilter; label: string }>,
    [
      diffPanelText.diagnosisFilterActive,
      diffPanelText.diagnosisFilterAll,
      diffPanelText.diagnosisFilterFailed,
    ],
  );
  const diagnosisHistoryKindFilterOptions = useMemo(
    () =>
      [
        { value: "all" as const, label: diffPanelText.diagnosisFilterKindAll },
        { value: "summary" as const, label: tracePanelText.hotspotRunSummary },
        { value: "hotspots" as const, label: tracePanelText.hotspotRunHotspots },
        { value: "queue_diagnostics" as const, label: tracePanelText.hotspotRunQueueDiagnostics },
        { value: "investigate" as const, label: tracePanelText.hotspotInvestigate },
        { value: "fallback_investigate" as const, label: diffPanelText.diagnosisFallbackRun },
      ] satisfies Array<{ value: DiagnosisHistoryKindFilter; label: string }>,
    [
      diffPanelText.diagnosisFallbackRun,
      diffPanelText.diagnosisFilterKindAll,
      tracePanelText.hotspotInvestigate,
      tracePanelText.hotspotRunHotspots,
      tracePanelText.hotspotRunQueueDiagnostics,
      tracePanelText.hotspotRunSummary,
    ],
  );
  const diagnosisHistorySortOptions = useMemo(
    () =>
      [
        { value: "recent" as const, label: diffPanelText.diagnosisSortRecent },
        { value: "risk" as const, label: diffPanelText.diagnosisSortRisk },
      ] satisfies Array<{ value: DiagnosisHistorySortMode; label: string }>,
    [diffPanelText.diagnosisSortRecent, diffPanelText.diagnosisSortRisk],
  );
  const diagnosisHistoryFiltered = useMemo(
    () =>
      diagnosisHistory.filter((item) => {
        const matchesStatus =
          diagnosisHistoryStatusFilter === "all"
            ? true
            : diagnosisHistoryStatusFilter === "failed"
              ? DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(item.status)
              : DIAGNOSIS_HISTORY_ACTIVE_STATUS_SET.has(item.status);
        const matchesKind = diagnosisHistoryKindFilter === "all" ? true : item.kind === diagnosisHistoryKindFilter;
        return matchesStatus && matchesKind;
      }),
    [diagnosisHistory, diagnosisHistoryStatusFilter, diagnosisHistoryKindFilter],
  );
  const diagnosisHistorySorted = useMemo(() => {
    if (diagnosisHistorySortMode === "recent") {
      return diagnosisHistoryFiltered;
    }
    return [...diagnosisHistoryFiltered].sort((a, b) => {
      const scoreDiff = getDiagnosisHistoryRiskScore(b) - getDiagnosisHistoryRiskScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.at - a.at;
    });
  }, [diagnosisHistoryFiltered, diagnosisHistorySortMode]);
  const latestFailedDiagnosisHistoryEntry = useMemo(
    () =>
      diagnosisHistory.find(
        (item) => DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(item.status) && item.command.trim().length > 0,
      ) ?? null,
    [diagnosisHistory],
  );
  const diagnosisHistoryRows = useMemo(
    () =>
      diagnosisHistorySorted.slice(0, DIAGNOSIS_HISTORY_PREVIEW_LIMIT).map((item) => ({
        ...item,
        kindLabel:
          item.kind === "summary"
            ? tracePanelText.hotspotRunSummary
            : item.kind === "hotspots"
              ? tracePanelText.hotspotRunHotspots
              : item.kind === "queue_diagnostics"
                ? tracePanelText.hotspotRunQueueDiagnostics
                : item.kind === "fallback_investigate"
                  ? diffPanelText.diagnosisFallbackRun
                  : tracePanelText.hotspotInvestigate,
        statusLabel: getTraceQuickCommandStatusLabel(item.status),
        atText: new Date(item.at).toLocaleTimeString(locale, { hour12: false }),
      })),
    [
      diagnosisHistorySorted,
      tracePanelText,
      diffPanelText,
      getTraceQuickCommandStatusLabel,
      locale,
    ],
  );
  const diagnosisLifecycleRows = useMemo(() => {
    const ascending = [...diagnosisHistorySorted].sort((a, b) => a.at - b.at);
    const groups: Array<{
      key: string;
      kind: TraceQuickCommandKind;
      command: string;
      statuses: TraceQuickCommandStatus[];
      events: Array<{
        status: TraceQuickCommandStatus;
        at: number;
        commandId?: string | null;
      }>;
      firstAt: number;
      lastAt: number;
      finalStatus: TraceQuickCommandStatus;
      riskScore: number;
      count: number;
    }> = [];

    for (const item of ascending) {
      const command = item.command.trim();
      if (!command) continue;
      let targetIndex = -1;
      const lastGroup = groups[groups.length - 1];
      if (
        lastGroup &&
        lastGroup.kind === item.kind &&
        lastGroup.command === command &&
        item.at - lastGroup.lastAt <= 2 * 60 * 1000
      ) {
        targetIndex = groups.length - 1;
      }
      if (targetIndex < 0) {
        groups.push({
          key: `${item.kind}:${command}:${item.at}`,
          kind: item.kind,
          command,
          statuses: [item.status],
          events: [{ status: item.status, at: item.at, commandId: item.commandId ?? null }],
          firstAt: item.at,
          lastAt: item.at,
          finalStatus: item.status,
          riskScore: getDiagnosisHistoryRiskScore(item),
          count: 1,
        });
        continue;
      }
      const group = groups[targetIndex];
      if (group.statuses[group.statuses.length - 1] !== item.status) {
        group.statuses.push(item.status);
      }
      group.events.push({
        status: item.status,
        at: item.at,
        commandId: item.commandId ?? null,
      });
      group.lastAt = Math.max(group.lastAt, item.at);
      group.finalStatus = item.status;
      group.riskScore = Math.max(group.riskScore, getDiagnosisHistoryRiskScore(item));
      group.count += 1;
    }

    const rows = groups.map((group) => {
      const kindLabel =
        group.kind === "summary"
          ? tracePanelText.hotspotRunSummary
          : group.kind === "hotspots"
            ? tracePanelText.hotspotRunHotspots
            : group.kind === "queue_diagnostics"
              ? tracePanelText.hotspotRunQueueDiagnostics
              : group.kind === "fallback_investigate"
                ? diffPanelText.diagnosisFallbackRun
                : tracePanelText.hotspotInvestigate;
      const finalStatusLabel = getTraceQuickCommandStatusLabel(group.finalStatus);
      const trailText = group.statuses.map((status) => getTraceQuickCommandStatusLabel(status)).join(" -> ");
      const eventRows = [...group.events]
        .sort((a, b) => a.at - b.at)
        .map((event) => ({
          ...event,
          statusLabel: getTraceQuickCommandStatusLabel(event.status),
          atText: new Date(event.at).toLocaleTimeString(locale, { hour12: false }),
        }));
      return {
        ...group,
        kindLabel,
        finalStatusLabel,
        trailText,
        eventRows,
        isFailed: DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(group.finalStatus),
        atText: new Date(group.lastAt).toLocaleTimeString(locale, { hour12: false }),
      };
    });

    if (diagnosisHistorySortMode === "risk") {
      rows.sort((a, b) => b.riskScore - a.riskScore || b.lastAt - a.lastAt);
    } else {
      rows.sort((a, b) => b.lastAt - a.lastAt);
    }
    return rows.slice(0, DIAGNOSIS_HISTORY_PREVIEW_LIMIT);
  }, [
    diagnosisHistorySorted,
    diagnosisHistorySortMode,
    tracePanelText,
    diffPanelText.diagnosisFallbackRun,
    getTraceQuickCommandStatusLabel,
    locale,
  ]);
  const diagnosisRootSummary = useMemo(() => {
    if (cockpitQueuePressure === "congested" || cockpitQueuePressure === "saturated") {
      return {
        rootCause: tracePanelText.diagnosisQueueRootCause,
        minimalFix: tracePanelText.diagnosisQueueFix,
        verify: tracePanelText.diagnosisQueueVerify,
      };
    }
    if (traceHotspotDiagnosisVisible && topTraceHotspot) {
      return {
        rootCause: tracePanelText.diagnosisHotspotRootCause,
        minimalFix: tracePanelText.diagnosisHotspotFix,
        verify: tracePanelText.diagnosisHotspotVerify,
      };
    }
    if (fallbackDiagnosisVisible) {
      return {
        rootCause: translate(locale, "agent.command.doctor.fallbackSuppressed", {
          count: fallbackSuppressedCount,
          reason: fallbackSuppressedReasonLabel,
          strategy: fallbackRetryStrategyLabel,
        }),
        minimalFix: translate(locale, "agent.command.doctor.fallbackInvestigateFixPolicy"),
        verify: translate(locale, "agent.command.doctor.fallbackInvestigateVerifyOutcome"),
      };
    }
    return {
      rootCause: diffPanelText.diagnosisNoSignals,
      minimalFix: tracePanelText.diagnosisQueueFix,
      verify: tracePanelText.diagnosisQueueVerify,
    };
  }, [
    cockpitQueuePressure,
    tracePanelText,
    traceHotspotDiagnosisVisible,
    topTraceHotspot,
    fallbackDiagnosisVisible,
    locale,
    fallbackSuppressedCount,
    fallbackSuppressedReasonLabel,
    fallbackRetryStrategyLabel,
    diffPanelText.diagnosisNoSignals,
  ]);
  const setDiagnosisRunbookActionStatus = useCallback(
    (actionId: string, nextState: DiagnosisRunbookActionExecutionState) => {
      setDiagnosisRunbookActionStateById((prev) => {
        const current = prev[actionId];
        if (
          current &&
          current.status === nextState.status &&
          current.at === nextState.at &&
          current.command === nextState.command &&
          current.commandId === nextState.commandId
        ) {
          return prev;
        }
        return {
          ...prev,
          [actionId]: nextState,
        };
      });
    },
    [],
  );
  useEffect(() => {
    if (!traceQuickCommandState) {
      return;
    }
    const actionId = getDiagnosisRunbookActionIdFromKind(traceQuickCommandState.kind);
    setDiagnosisRunbookActionStatus(actionId, {
      status: traceQuickCommandState.status,
      at: traceQuickCommandState.at,
      command: traceQuickCommandState.command,
      commandId: traceQuickCommandState.commandId ?? null,
    });
  }, [traceQuickCommandState, setDiagnosisRunbookActionStatus]);
  useEffect(() => {
    const validKeys = new Set(diagnosisLifecycleRows.map((item) => item.key));
    setExpandedDiagnosisLifecycleKeys((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [key, expanded] of Object.entries(prev)) {
        if (validKeys.has(key)) {
          next[key] = expanded;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [diagnosisLifecycleRows]);
  const toggleDiagnosisLifecycleExpanded = useCallback((key: string) => {
    setExpandedDiagnosisLifecycleKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);
  useEffect(() => {
    if (!selectedTraceTool) {
      return;
    }
    const stillVisible = traceToolHotspots.some((item) => item.tool === selectedTraceTool);
    if (!stillVisible) {
      setSelectedTraceTool(null);
    }
  }, [selectedTraceTool, traceToolHotspots]);
  const buildTraceScopeTokens = useCallback(
    (options?: {
      includeTool?: boolean;
      includeRunWindow?: boolean;
      forceFailure?: boolean;
    }) => {
      const includeTool = options?.includeTool ?? true;
      const includeRunWindow = options?.includeRunWindow ?? true;
      const forceFailure = options?.forceFailure ?? false;
      const parts: string[] = [];

      if (traceFilter !== "all") {
        parts.push(traceFilter);
      }
      if (traceWarningsOnly) {
        parts.push("warnings");
      }
      if (forceFailure || traceFailureFocus) {
        parts.push("failure");
      }
      if (includeRunWindow) {
        parts.push(
          traceHotspotWindow === "all" ? "runs=all" : traceHotspotWindow === "runs3" ? "runs=3" : "runs=6",
        );
      }
      if (includeTool && selectedTraceTool) {
        parts.push(`tool=${selectedTraceTool}`);
      }
      if (traceRiskFilter !== "all") {
        parts.push(`risk=${traceRiskFilter}`);
      }
      if (traceReversibilityFilter !== "all") {
        parts.push(`reversibility=${traceReversibilityFilter}`);
      }
      if (traceBlastRadiusFilter !== "all") {
        parts.push(`blast=${traceBlastRadiusFilter}`);
      }

      return parts;
    },
    [
      traceFilter,
      traceWarningsOnly,
      traceFailureFocus,
      traceHotspotWindow,
      selectedTraceTool,
      traceRiskFilter,
      traceReversibilityFilter,
      traceBlastRadiusFilter,
    ],
  );
  const buildTraceSummaryCommand = useCallback(() => {
    const parts = ["/trace", "summary", ...buildTraceScopeTokens()];
    return parts.join(" ");
  }, [buildTraceScopeTokens]);
  const buildTraceHotspotsCommand = useCallback(() => {
    const parts = ["/trace", "hotspots", ...buildTraceScopeTokens()];
    return parts.join(" ");
  }, [buildTraceScopeTokens]);
  const buildTraceQueueDiagnosticsCommand = useCallback(() => {
    return "/trace hotspots queue warnings failure runs=3";
  }, []);
  const buildTraceInvestigateCommand = useCallback(
    (includeExecute = false) => {
      const targetTool = selectedTraceTool ?? traceToolHotspots[0]?.tool ?? null;
      if (!targetTool) {
        return null;
      }
      const parts = [
        "/trace",
        "investigate",
        "runbook",
        "workflow",
        ...buildTraceScopeTokens({ includeTool: false, forceFailure: true }),
        `tool=${targetTool}`,
      ];
      if (includeExecute) {
        parts.push("execute");
      }
      return {
        targetTool,
        command: parts.join(" "),
      };
    },
    [selectedTraceTool, traceToolHotspots, buildTraceScopeTokens],
  );
  const buildDiagnosisFixProposalCommand = useCallback(
    (item: (typeof diagnosisLifecycleRows)[number]) => {
      const scopeTokens = buildTraceScopeTokens({ includeTool: false, forceFailure: true });
      const commandId = [...item.eventRows].reverse().find((event) => event.commandId)?.commandId ?? null;
      const lifecycleText =
        item.eventRows.map((event) => `${event.statusLabel}@${event.atText}`).join(" -> ") || item.trailText;
      const commandParts = [
        "/trace",
        "investigate",
        "fix",
        ...scopeTokens,
        `kind=${item.kind}`,
        `status=${item.finalStatus}`,
      ];
      if (commandId) {
        commandParts.push(`command_id=${commandId}`);
      }
      const lines = [
        commandParts.join(" "),
        `failed_command: ${item.command}`,
        `lifecycle: ${lifecycleText}`,
        `root_cause: ${diagnosisRootSummary.rootCause}`,
        `minimal_fix: ${diagnosisRootSummary.minimalFix}`,
        `verify: ${diagnosisRootSummary.verify}`,
        "return: root_cause -> minimal_patch_plan -> verify_steps -> rerun_command",
      ];
      return lines.join("\n");
    },
    [buildTraceScopeTokens, diagnosisRootSummary],
  );
  const diagnosisRunbookPayload = useMemo(() => {
    if (!currentThreadMeta) {
      return "";
    }
    const investigateCommand = buildTraceInvestigateCommand(false)?.command ?? "";
    const lines: string[] = [];
    lines.push("# Diagnosis Runbook");
    lines.push(`generated_at: ${new Date().toISOString()}`);
    lines.push(`thread_id: ${currentThreadMeta.id}`);
    lines.push(`thread_name: ${currentThreadMeta.name || "-"}`);
    lines.push(`workspace: ${currentThreadMeta.working_dir || "-"}`);
    lines.push("");
    lines.push("## Risk Snapshot");
    lines.push(`queue_pressure: ${cockpitQueuePressure}`);
    lines.push(`queue_depth: ${cockpitQueueDepthLabel}`);
    lines.push(`fallback_suppression_ratio_pct: ${fallbackSuppressionRatioPct}`);
    lines.push(`fallback_suppressed: ${fallbackSuppressedCount}`);
    lines.push(`fallback_used: ${fallbackUsedCount}`);
    lines.push(`retry_events: ${fallbackRetryEventsCount}`);
    lines.push(`last_reason: ${currentThreadRetryDiagnostics?.last_suppressed_reason ?? "-"}`);
    lines.push(`last_strategy: ${currentThreadRetryDiagnostics?.last_retry_strategy ?? "-"}`);
    if (topTraceHotspot) {
      lines.push(`top_hotspot_tool: ${topTraceHotspot.tool}`);
      lines.push(
        `top_hotspot_signals: total=${topTraceHotspot.total}, errors=${topTraceHotspot.errors}, rejected=${topTraceHotspot.rejected}, denied=${topTraceHotspot.denied}`,
      );
    }
    if (lastDiagnosisActivity) {
      lines.push(`latest_diagnosis: ${lastDiagnosisActivity.kind}/${lastDiagnosisActivity.status}`);
      lines.push(`latest_diagnosis_command: ${lastDiagnosisActivity.command}`);
    }
    lines.push("");
    lines.push("## Suggested Commands");
    lines.push("1. /status");
    lines.push(`2. ${buildTraceSummaryCommand()}`);
    lines.push(`3. ${buildTraceQueueDiagnosticsCommand()}`);
    if (investigateCommand) {
      lines.push(`4. ${investigateCommand}`);
    }
    if (fallbackInvestigateCommand) {
      lines.push(`5. ${fallbackInvestigateCommand}`);
    }
    if (diagnosisQueuedItems.length > 0) {
      lines.push("");
      lines.push("## Diagnosis Queue");
      for (const item of diagnosisQueuedItems.slice(0, 8)) {
        lines.push(`- [${item.priority}] ${item.query}`);
      }
    }
    const historyRows = diagnosisHistorySorted.slice(0, 8);
    if (historyRows.length > 0) {
      lines.push("");
      lines.push("## Recent Diagnosis History");
      for (const entry of historyRows) {
        lines.push(`- [${entry.status}] ${entry.kind} @${new Date(entry.at).toISOString()} | ${entry.command}`);
      }
    }
    return lines.join("\n");
  }, [
    currentThreadMeta,
    buildTraceInvestigateCommand,
    cockpitQueuePressure,
    cockpitQueueDepthLabel,
    fallbackSuppressionRatioPct,
    fallbackSuppressedCount,
    fallbackUsedCount,
    fallbackRetryEventsCount,
    currentThreadRetryDiagnostics?.last_suppressed_reason,
    currentThreadRetryDiagnostics?.last_retry_strategy,
    topTraceHotspot,
    lastDiagnosisActivity,
    buildTraceSummaryCommand,
    buildTraceQueueDiagnosticsCommand,
    fallbackInvestigateCommand,
    diagnosisQueuedItems,
    diagnosisHistorySorted,
  ]);
  const handleCopyDiagnosisRunbook = useCallback(async () => {
    if (!diagnosisRunbookPayload.trim()) {
      toast.warning(diffPanelText.diagnosisRunbookCopyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(diagnosisRunbookPayload);
      toast.success(diffPanelText.diagnosisRunbookCopied);
    } catch (error) {
      console.warn("Failed to copy diagnosis runbook:", error);
      toast.error(diffPanelText.diagnosisRunbookCopyFailed);
    }
  }, [
    diagnosisRunbookPayload,
    diffPanelText.diagnosisRunbookCopied,
    diffPanelText.diagnosisRunbookCopyFailed,
  ]);
  const focusComposerWithCommand = useCallback((command: string) => {
    setInput(command);
    requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) return;
      target.focus();
      target.style.height = "auto";
      target.style.height = `${target.scrollHeight}px`;
      const caret = target.value.length;
      target.setSelectionRange(caret, caret);
    });
  }, []);
  const handlePrepareDiagnosisFixProposal = useCallback(
    (item: (typeof diagnosisLifecycleRows)[number]) => {
      const proposal = buildDiagnosisFixProposalCommand(item);
      focusComposerWithCommand(proposal);
      toast.success(diffPanelText.diagnosisFixProposalPrepared);
    },
    [buildDiagnosisFixProposalCommand, focusComposerWithCommand, diffPanelText.diagnosisFixProposalPrepared],
  );
  const buildReplayTemplateCommandWithContext = useCallback(
    (template: { kind: TraceQuickCommandKind; command: string }) => {
      const command = template.command.trim();
      if (!command) {
        return "";
      }
      const lines = [command];
      if (latestFailedDiagnosisHistoryEntry) {
        lines.push(
          `context_last_failed: ${latestFailedDiagnosisHistoryEntry.kind}/${latestFailedDiagnosisHistoryEntry.status} @${new Date(
            latestFailedDiagnosisHistoryEntry.at,
          ).toISOString()}`,
        );
        lines.push(`context_last_failed_command: ${latestFailedDiagnosisHistoryEntry.command}`);
      }
      lines.push(`context_root_cause: ${diagnosisRootSummary.rootCause}`);
      lines.push(`context_minimal_fix: ${diagnosisRootSummary.minimalFix}`);
      lines.push(`context_verify: ${diagnosisRootSummary.verify}`);
      lines.push("request: compare current execution with failure context and propose minimal recovery steps.");
      return lines.join("\n");
    },
    [latestFailedDiagnosisHistoryEntry, diagnosisRootSummary],
  );
  const traceSummaryCommand = useMemo(() => buildTraceSummaryCommand(), [buildTraceSummaryCommand]);
  const traceHotspotsCommand = useMemo(() => buildTraceHotspotsCommand(), [buildTraceHotspotsCommand]);
  const traceQueueDiagnosticsCommand = useMemo(
    () => buildTraceQueueDiagnosticsCommand(),
    [buildTraceQueueDiagnosticsCommand],
  );
  const traceInvestigateQueued = useMemo(() => {
    const built = buildTraceInvestigateCommand(true);
    if (!built) return false;
    return queuedQueries.some((item) => item.query.trim() === built.command.trim());
  }, [buildTraceInvestigateCommand, queuedQueries]);
  const traceSummaryQueued = useMemo(
    () => queuedQueries.some((item) => item.query.trim() === traceSummaryCommand.trim()),
    [queuedQueries, traceSummaryCommand],
  );
  const traceHotspotsQueued = useMemo(
    () => queuedQueries.some((item) => item.query.trim() === traceHotspotsCommand.trim()),
    [queuedQueries, traceHotspotsCommand],
  );
  const traceQueueDiagnosticsQueued = useMemo(
    () => queuedQueries.some((item) => item.query.trim() === traceQueueDiagnosticsCommand.trim()),
    [queuedQueries, traceQueueDiagnosticsCommand],
  );
  const traceQueueDiagnosticsPresetActive = useMemo(
    () =>
      traceFilter === "queue" &&
      traceWarningsOnly &&
      traceFailureFocus &&
      traceHotspotWindow === "runs3" &&
      selectedTraceTool === null &&
      traceRiskFilter === "all" &&
      traceReversibilityFilter === "all" &&
      traceBlastRadiusFilter === "all",
    [
      traceFilter,
      traceWarningsOnly,
      traceFailureFocus,
      traceHotspotWindow,
      selectedTraceTool,
      traceRiskFilter,
      traceReversibilityFilter,
      traceBlastRadiusFilter,
    ],
  );
  useEffect(() => {
    if (!traceQuickCommandState?.commandId || !activeTraceQuickLifecycle) {
      return;
    }
    const trackedId = traceQuickCommandState.commandId;
    if (activeTraceQuickLifecycle.commandId !== trackedId) {
      return;
    }
    const nextStatus: TraceQuickCommandStatus =
      activeTraceQuickLifecycle.state === "queued"
        ? "queued"
        : activeTraceQuickLifecycle.state === "started"
          ? "started"
          : activeTraceQuickLifecycle.state === "completed"
            ? "completed"
            : activeTraceQuickLifecycle.state === "aborted"
              ? "aborted"
              : "failed";
    setTraceQuickCommandState((prev) => {
      if (!prev || prev.commandId !== trackedId) {
        return prev;
      }
      if (prev.status === nextStatus && prev.at === activeTraceQuickLifecycle.at) {
        return prev;
      }
      return {
        ...prev,
        status: nextStatus,
        at: activeTraceQuickLifecycle.at,
      };
    });
  }, [traceQuickCommandState?.commandId, activeTraceQuickLifecycle]);
  useEffect(() => {
    if (!traceQuickCommandState) {
      return;
    }
    const snapshot = { ...traceQuickCommandState };
    setLastDiagnosisActivity((prev) => {
      if (
        prev &&
        prev.kind === snapshot.kind &&
        prev.status === snapshot.status &&
        prev.command === snapshot.command &&
        prev.at === snapshot.at &&
        prev.commandId === snapshot.commandId
      ) {
        return prev;
      }
      return snapshot;
    });
    setDiagnosisHistory((prev) => {
      const sameAsHead =
        prev[0] &&
        prev[0].kind === snapshot.kind &&
        prev[0].status === snapshot.status &&
        prev[0].command === snapshot.command &&
        prev[0].at === snapshot.at &&
        prev[0].commandId === snapshot.commandId;
      if (sameAsHead) {
        return prev;
      }
      const next = [snapshot, ...prev];
      return next.slice(0, MAX_DIAGNOSIS_HISTORY_ITEMS);
    });
  }, [traceQuickCommandState]);
  useEffect(() => {
    if (!traceQuickCommandState || traceQuickCommandState.commandId) {
      return;
    }
    const trackedCommand = traceQuickCommandState.command.trim();
    if (!trackedCommand) {
      return;
    }
    const queuedNow = queuedQueries.some((item) => item.query.trim() === trackedCommand);
    if (traceQuickCommandState.status === "queued" && !queuedNow && isThinking) {
      setTraceQuickCommandState((prev) => {
        if (!prev) return prev;
        if (prev.command.trim() !== trackedCommand || prev.status !== "queued") return prev;
        return {
          ...prev,
          status: "started",
          at: Date.now(),
        };
      });
      return;
    }
    if (
      (traceQuickCommandState.status === "queued" || traceQuickCommandState.status === "started") &&
      !queuedNow &&
      !isThinking
    ) {
      setTraceQuickCommandState((prev) => {
        if (!prev) return prev;
        if (prev.command.trim() !== trackedCommand) return prev;
        if (prev.status !== "queued" && prev.status !== "started") return prev;
        return {
          ...prev,
          status: "completed",
          at: Date.now(),
        };
      });
    }
  }, [traceQuickCommandState, queuedQueries, isThinking]);
  useEffect(() => {
    if (!traceQuickCommandState) {
      return;
    }
    if (
      traceQuickCommandState.status === "prepared" ||
      traceQuickCommandState.status === "queued" ||
      traceQuickCommandState.status === "started"
    ) {
      return;
    }
    const expiresInMs = traceQuickCommandState.status === "completed" ? 8_000 : 12_000;
    const at = traceQuickCommandState.at;
    const command = traceQuickCommandState.command;
    const status = traceQuickCommandState.status;
    const timer = window.setTimeout(() => {
      setTraceQuickCommandState((prev) => {
        if (!prev) return prev;
        if (prev.at !== at || prev.command !== command || prev.status !== status) {
          return prev;
        }
        return null;
      });
    }, expiresInMs);
    return () => window.clearTimeout(timer);
  }, [traceQuickCommandState]);
  const getTraceQuickCommandKindLabel = useCallback(
    (kind: TraceQuickCommandKind) =>
      kind === "summary"
        ? tracePanelText.hotspotRunSummary
        : kind === "hotspots"
          ? tracePanelText.hotspotRunHotspots
          : kind === "queue_diagnostics"
            ? tracePanelText.hotspotRunQueueDiagnostics
            : kind === "fallback_investigate"
              ? diffPanelText.diagnosisFallbackRun
              : tracePanelText.hotspotInvestigate,
    [tracePanelText, diffPanelText],
  );
  const traceQuickCommandStatusLabel = useMemo(() => {
    if (!traceQuickCommandState) {
      return null;
    }
    const kindLabel = getTraceQuickCommandKindLabel(traceQuickCommandState.kind);
    const statusLabel =
      traceQuickCommandState.status === "queued"
        ? tracePanelText.commandStatusQueued
        : traceQuickCommandState.status === "started"
          ? tracePanelText.commandStatusStarted
          : traceQuickCommandState.status === "prepared"
            ? tracePanelText.commandStatusPrepared
            : traceQuickCommandState.status === "completed"
              ? tracePanelText.commandStatusCompleted
              : traceQuickCommandState.status === "failed"
                ? tracePanelText.commandStatusFailed
                : traceQuickCommandState.status === "aborted"
                  ? tracePanelText.commandStatusAborted
              : translate(locale, "agent.queue.full", { count: queuedCount, limit: queueLimit });
    return `${kindLabel} | ${statusLabel}`;
  }, [traceQuickCommandState, getTraceQuickCommandKindLabel, tracePanelText, locale, queuedCount, queueLimit]);
  const lastDiagnosisActivityStatusLabel = useMemo(() => {
    if (!lastDiagnosisActivity) {
      return null;
    }
    const kindLabel = getTraceQuickCommandKindLabel(lastDiagnosisActivity.kind);
    const statusLabel = getTraceQuickCommandStatusLabel(lastDiagnosisActivity.status);
    return `${kindLabel} | ${statusLabel}`;
  }, [lastDiagnosisActivity, getTraceQuickCommandKindLabel, getTraceQuickCommandStatusLabel]);
  const lastDiagnosisActivityAtText = useMemo(
    () =>
      lastDiagnosisActivity
        ? new Date(lastDiagnosisActivity.at).toLocaleTimeString(locale, { hour12: false })
        : null,
    [lastDiagnosisActivity, locale],
  );
  const handlePrepareTraceSummaryCommand = useCallback(() => {
    focusComposerWithCommand(traceSummaryCommand);
    setTraceQuickCommandState({
      kind: "summary",
      status: "prepared",
      command: traceSummaryCommand,
      at: Date.now(),
    });
    toast.success(translate(locale, "agent.trace.hotspotPrepareSummaryReady"));
  }, [focusComposerWithCommand, locale, traceSummaryCommand]);
  const handleRunTraceSummaryCommand = useCallback(() => {
    const submitResult = submitAgentQuery(traceSummaryCommand, {
      clearComposer: false,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
    if (submitResult.accepted) {
      setTraceQuickCommandState({
        kind: "summary",
        status: submitResult.queued ? "queued" : "started",
        command: traceSummaryCommand,
        at: Date.now(),
        commandId: submitResult.commandId,
      });
      if (submitResult.queued) {
        toast.info(translate(locale, "agent.trace.hotspotRunSummaryQueued"));
      } else {
        toast.success(translate(locale, "agent.trace.hotspotRunSummaryStarted"));
      }
    } else if (submitResult.reason === "queue_full") {
      setTraceQuickCommandState({
        kind: "summary",
        status: "queue_full",
        command: traceSummaryCommand,
        at: Date.now(),
      });
    }
  }, [locale, submitAgentQuery, traceSummaryCommand]);
  const handlePrepareTraceHotspotsCommand = useCallback(() => {
    focusComposerWithCommand(traceHotspotsCommand);
    setTraceQuickCommandState({
      kind: "hotspots",
      status: "prepared",
      command: traceHotspotsCommand,
      at: Date.now(),
    });
    toast.success(translate(locale, "agent.trace.hotspotPrepareHotspotsReady"));
  }, [focusComposerWithCommand, locale, traceHotspotsCommand]);
  const handleRunTraceHotspotsCommand = useCallback(() => {
    const submitResult = submitAgentQuery(traceHotspotsCommand, {
      clearComposer: false,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
    if (submitResult.accepted) {
      setTraceQuickCommandState({
        kind: "hotspots",
        status: submitResult.queued ? "queued" : "started",
        command: traceHotspotsCommand,
        at: Date.now(),
        commandId: submitResult.commandId,
      });
      if (submitResult.queued) {
        toast.info(translate(locale, "agent.trace.hotspotRunHotspotsQueued"));
      } else {
        toast.success(translate(locale, "agent.trace.hotspotRunHotspotsStarted"));
      }
    } else if (submitResult.reason === "queue_full") {
      setTraceQuickCommandState({
        kind: "hotspots",
        status: "queue_full",
        command: traceHotspotsCommand,
        at: Date.now(),
      });
    }
  }, [locale, submitAgentQuery, traceHotspotsCommand]);
  const handleApplyTraceQueueDiagnosticsPreset = useCallback(() => {
    setTraceFilter("queue");
    setTraceWarningsOnly(true);
    setTraceFailureFocus(true);
    setTraceHotspotWindow("runs3");
    setSelectedTraceTool(null);
    setTraceRiskFilter("all");
    setTraceReversibilityFilter("all");
    setTraceBlastRadiusFilter("all");
    toast.success(translate(locale, "agent.trace.hotspotQueueDiagnosticsApplied"));
  }, [locale]);
  const handlePrepareTraceQueueDiagnosticsCommand = useCallback(() => {
    handleApplyTraceQueueDiagnosticsPreset();
    focusComposerWithCommand(traceQueueDiagnosticsCommand);
    setTraceQuickCommandState({
      kind: "queue_diagnostics",
      status: "prepared",
      command: traceQueueDiagnosticsCommand,
      at: Date.now(),
    });
    toast.success(tracePanelText.hotspotPrepareQueueDiagnosticsReady);
  }, [handleApplyTraceQueueDiagnosticsPreset, focusComposerWithCommand, traceQueueDiagnosticsCommand, tracePanelText]);
  const handleRunTraceQueueDiagnosticsCommand = useCallback(() => {
    handleApplyTraceQueueDiagnosticsPreset();
    const submitResult = submitAgentQuery(traceQueueDiagnosticsCommand, {
      clearComposer: false,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
    if (submitResult.accepted) {
      setTraceQuickCommandState({
        kind: "queue_diagnostics",
        status: submitResult.queued ? "queued" : "started",
        command: traceQueueDiagnosticsCommand,
        at: Date.now(),
        commandId: submitResult.commandId,
      });
      if (submitResult.queued) {
        toast.info(tracePanelText.hotspotRunQueueDiagnosticsQueued);
      } else {
        toast.success(tracePanelText.hotspotRunQueueDiagnosticsStarted);
      }
    } else if (submitResult.reason === "queue_full") {
      setTraceQuickCommandState({
        kind: "queue_diagnostics",
        status: "queue_full",
        command: traceQueueDiagnosticsCommand,
        at: Date.now(),
      });
    }
  }, [handleApplyTraceQueueDiagnosticsPreset, submitAgentQuery, traceQueueDiagnosticsCommand, tracePanelText]);
  const handlePrepareFallbackInvestigateCommand = useCallback(() => {
    if (!currentThreadMeta || !fallbackInvestigateCommand) {
      toast.warning(diffPanelText.diagnosisFallbackMissingThread);
      return;
    }
    focusComposerWithCommand(fallbackInvestigateCommand);
    setTraceQuickCommandState({
      kind: "fallback_investigate",
      status: "prepared",
      command: fallbackInvestigateCommand,
      at: Date.now(),
    });
    toast.success(diffPanelText.diagnosisFallbackPrepared);
  }, [
    currentThreadMeta,
    fallbackInvestigateCommand,
    focusComposerWithCommand,
    diffPanelText.diagnosisFallbackMissingThread,
    diffPanelText.diagnosisFallbackPrepared,
  ]);
  const handleRunFallbackInvestigateCommand = useCallback(() => {
    if (!currentThreadMeta || !fallbackInvestigateCommand) {
      toast.warning(diffPanelText.diagnosisFallbackMissingThread);
      return;
    }
    const submitResult = submitAgentQuery(fallbackInvestigateCommand, {
      clearComposer: false,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
    if (submitResult.accepted) {
      setTraceQuickCommandState({
        kind: "fallback_investigate",
        status: submitResult.queued ? "queued" : "started",
        command: fallbackInvestigateCommand,
        at: Date.now(),
        commandId: submitResult.commandId,
      });
      if (submitResult.queued) {
        toast.info(diffPanelText.diagnosisFallbackQueued);
      } else {
        toast.success(diffPanelText.diagnosisFallbackStarted);
      }
    } else if (submitResult.reason === "queue_full") {
      setTraceQuickCommandState({
        kind: "fallback_investigate",
        status: "queue_full",
        command: fallbackInvestigateCommand,
        at: Date.now(),
      });
    }
  }, [
    currentThreadMeta,
    fallbackInvestigateCommand,
    submitAgentQuery,
    diffPanelText.diagnosisFallbackMissingThread,
    diffPanelText.diagnosisFallbackQueued,
    diffPanelText.diagnosisFallbackStarted,
  ]);
  const submitDiagnosisReplay = useCallback(
    (entry: Pick<TraceQuickCommandState, "kind" | "command">) => {
      const command = entry.command.trim();
      if (!command) {
        toast.warning(diffPanelText.diagnosisReplayMissing);
        return;
      }
      const submitResult = submitAgentQuery(command, {
        clearComposer: false,
        restoreComposerOnQueueReject: true,
        focusComposerOnQueueReject: true,
      });
      if (submitResult.accepted) {
        setTraceQuickCommandState({
          kind: entry.kind,
          status: submitResult.queued ? "queued" : "started",
          command,
          at: Date.now(),
          commandId: submitResult.commandId,
        });
        if (submitResult.queued) {
          toast.info(diffPanelText.diagnosisReplayQueued);
        } else {
          toast.success(diffPanelText.diagnosisReplayStarted);
        }
      } else if (submitResult.reason === "queue_full") {
        setTraceQuickCommandState({
          kind: entry.kind,
          status: "queue_full",
          command,
          at: Date.now(),
        });
      }
    },
    [
      submitAgentQuery,
      diffPanelText.diagnosisReplayMissing,
      diffPanelText.diagnosisReplayQueued,
      diffPanelText.diagnosisReplayStarted,
    ],
  );
  const handleReplayLastDiagnosisCommand = useCallback(() => {
    if (!lastDiagnosisActivity) {
      toast.warning(diffPanelText.diagnosisReplayMissing);
      return;
    }
    submitDiagnosisReplay(lastDiagnosisActivity);
  }, [lastDiagnosisActivity, submitDiagnosisReplay, diffPanelText.diagnosisReplayMissing]);
  const handleReplayFailedDiagnosisCommand = useCallback(() => {
    if (!latestFailedDiagnosisHistoryEntry) {
      toast.warning(diffPanelText.diagnosisReplayFailedMissing);
      return;
    }
    submitDiagnosisReplay(latestFailedDiagnosisHistoryEntry);
  }, [
    latestFailedDiagnosisHistoryEntry,
    submitDiagnosisReplay,
    diffPanelText.diagnosisReplayFailedMissing,
  ]);
  const handlePrepareTraceInvestigateCommand = useCallback(() => {
    const built = buildTraceInvestigateCommand(false);
    if (!built) {
      toast.warning(translate(locale, "agent.trace.hotspotFocusEmpty"));
      return;
    }
    focusComposerWithCommand(built.command);
    setTraceQuickCommandState({
      kind: "investigate",
      status: "prepared",
      command: built.command,
      at: Date.now(),
    });
    toast.success(translate(locale, "agent.trace.hotspotPrepareCommandReady", { tool: built.targetTool }));
  }, [buildTraceInvestigateCommand, focusComposerWithCommand, locale]);
  const handleFocusHottestTraceTool = useCallback(() => {
    const hottest = traceToolHotspots[0];
    if (!hottest) {
      toast.warning(translate(locale, "agent.trace.hotspotFocusEmpty"));
      return;
    }
    setTraceFailureFocus(true);
    setSelectedTraceTool(hottest.tool);
    toast.success(translate(locale, "agent.trace.hotspotFocusApplied", { tool: hottest.tool }));
  }, [locale, traceToolHotspots]);
  const handleInvestigateHottestTraceTool = useCallback(() => {
    const hottest = traceToolHotspots[0];
    if (!hottest) {
      toast.warning(translate(locale, "agent.trace.hotspotFocusEmpty"));
      return;
    }
    setTraceFailureFocus(true);
    setSelectedTraceTool(hottest.tool);
    const built = buildTraceInvestigateCommand(true);
    if (!built) {
      toast.warning(translate(locale, "agent.trace.hotspotFocusEmpty"));
      return;
    }
    const command = built.command;
    const submitResult = submitAgentQuery(command, {
      clearComposer: false,
      restoreComposerOnQueueReject: true,
      focusComposerOnQueueReject: true,
    });
    if (submitResult.accepted) {
      setTraceQuickCommandState({
        kind: "investigate",
        status: submitResult.queued ? "queued" : "started",
        command,
        at: Date.now(),
        commandId: submitResult.commandId,
      });
      if (submitResult.queued) {
        toast.info(translate(locale, "agent.trace.hotspotInvestigateQueued", { tool: hottest.tool }));
      } else {
        toast.success(translate(locale, "agent.trace.hotspotInvestigateSubmitted", { tool: hottest.tool }));
      }
    } else if (submitResult.reason === "queue_full") {
      setTraceQuickCommandState({
        kind: "investigate",
        status: "queue_full",
        command,
        at: Date.now(),
      });
    }
  }, [buildTraceInvestigateCommand, locale, submitAgentQuery, traceToolHotspots]);
  const diagnosisQueuedCommandSet = useMemo(
    () => new Set(diagnosisQueuedItems.map((item) => item.query.trim())),
    [diagnosisQueuedItems],
  );
  const buildDiagnosisRunbookActionHandler = useCallback(
    (actionId: string, command: string, nextStatus: "prepared" | "started", handler: () => void) => {
      return () => {
        const normalizedCommand = command.trim();
        if (normalizedCommand) {
          const optimisticStatus: TraceQuickCommandStatus =
            nextStatus === "started" && diagnosisQueuedCommandSet.has(normalizedCommand) ? "queued" : nextStatus;
          setDiagnosisRunbookActionStatus(actionId, {
            status: optimisticStatus,
            at: Date.now(),
            command: normalizedCommand,
            commandId: null,
          });
        }
        handler();
      };
    },
    [diagnosisQueuedCommandSet, setDiagnosisRunbookActionStatus],
  );
  const diagnosisRunbookActions = useMemo(() => {
    const investigateCommand = buildTraceInvestigateCommand(false)?.command ?? "";
    return [
      {
        id: "summary",
        kind: "summary" as const,
        label: tracePanelText.hotspotRunSummary,
        command: traceSummaryCommand,
        canRun: traceSummaryCommand.trim().length > 0,
        onPrepare: buildDiagnosisRunbookActionHandler(
          "summary",
          traceSummaryCommand,
          "prepared",
          handlePrepareTraceSummaryCommand,
        ),
        onRun: buildDiagnosisRunbookActionHandler("summary", traceSummaryCommand, "started", handleRunTraceSummaryCommand),
      },
      {
        id: "hotspots",
        kind: "hotspots" as const,
        label: tracePanelText.hotspotRunHotspots,
        command: traceHotspotsCommand,
        canRun: traceHotspotsCommand.trim().length > 0,
        onPrepare: buildDiagnosisRunbookActionHandler(
          "hotspots",
          traceHotspotsCommand,
          "prepared",
          handlePrepareTraceHotspotsCommand,
        ),
        onRun: buildDiagnosisRunbookActionHandler(
          "hotspots",
          traceHotspotsCommand,
          "started",
          handleRunTraceHotspotsCommand,
        ),
      },
      {
        id: "queue_diagnostics",
        kind: "queue_diagnostics" as const,
        label: tracePanelText.hotspotRunQueueDiagnostics,
        command: traceQueueDiagnosticsCommand,
        canRun: traceQueueDiagnosticsCommand.trim().length > 0,
        onPrepare: buildDiagnosisRunbookActionHandler(
          "queue_diagnostics",
          traceQueueDiagnosticsCommand,
          "prepared",
          handlePrepareTraceQueueDiagnosticsCommand,
        ),
        onRun: buildDiagnosisRunbookActionHandler(
          "queue_diagnostics",
          traceQueueDiagnosticsCommand,
          "started",
          handleRunTraceQueueDiagnosticsCommand,
        ),
      },
      {
        id: "investigate",
        kind: "investigate" as const,
        label: tracePanelText.hotspotInvestigate,
        command: investigateCommand,
        canRun: investigateCommand.trim().length > 0,
        onPrepare: buildDiagnosisRunbookActionHandler(
          "investigate",
          investigateCommand,
          "prepared",
          handlePrepareTraceInvestigateCommand,
        ),
        onRun: buildDiagnosisRunbookActionHandler(
          "investigate",
          investigateCommand,
          "started",
          handleInvestigateHottestTraceTool,
        ),
      },
      {
        id: "fallback_investigate",
        kind: "fallback_investigate" as const,
        label: diffPanelText.diagnosisFallbackRun,
        command: fallbackInvestigateCommand,
        canRun: fallbackInvestigateCommand.trim().length > 0,
        onPrepare: buildDiagnosisRunbookActionHandler(
          "fallback_investigate",
          fallbackInvestigateCommand,
          "prepared",
          handlePrepareFallbackInvestigateCommand,
        ),
        onRun: buildDiagnosisRunbookActionHandler(
          "fallback_investigate",
          fallbackInvestigateCommand,
          "started",
          handleRunFallbackInvestigateCommand,
        ),
      },
    ] as const;
  }, [
    buildTraceInvestigateCommand,
    tracePanelText.hotspotRunSummary,
    tracePanelText.hotspotRunHotspots,
    tracePanelText.hotspotRunQueueDiagnostics,
    tracePanelText.hotspotInvestigate,
    traceSummaryCommand,
    traceHotspotsCommand,
    traceQueueDiagnosticsCommand,
    diffPanelText.diagnosisFallbackRun,
    fallbackInvestigateCommand,
    buildDiagnosisRunbookActionHandler,
    handlePrepareTraceSummaryCommand,
    handleRunTraceSummaryCommand,
    handlePrepareTraceHotspotsCommand,
    handleRunTraceHotspotsCommand,
    handlePrepareTraceQueueDiagnosticsCommand,
    handleRunTraceQueueDiagnosticsCommand,
    handlePrepareTraceInvestigateCommand,
    handleInvestigateHottestTraceTool,
    handlePrepareFallbackInvestigateCommand,
    handleRunFallbackInvestigateCommand,
  ]);
  const diagnosisRecommendations = useMemo(() => {
    const rows: Array<{
      id: string;
      label: string;
      reason: string;
      severity: "high" | "medium" | "low";
      reversibility: PermissionReversibilityLevel;
      blastRadius: PermissionBlastRadiusLevel;
      matrixScore: number;
      trendWeight: number;
      priorityScore: number;
      command: string;
      canRun: boolean;
      onPrepare: () => void;
      onRun: () => void;
    }> = [];
    const dominantReversibility =
      getDominantTracePermissionReversibility(traceReversibilityCounts) ??
      (currentThreadPermissionDiagnostics
        ? getDominantTracePermissionReversibility(currentThreadPermissionDiagnostics.profile)
        : null) ??
      "mixed";
    const dominantBlastRadius =
      getDominantTracePermissionBlastRadius(traceBlastRadiusCounts) ??
      (currentThreadPermissionDiagnostics
        ? getDominantTracePermissionBlastRadius(currentThreadPermissionDiagnostics.profile)
        : null) ??
      "workspace";
    const getRecommendationTrendWeight = (kind: TraceQuickCommandKind, command: string): number => {
      const normalizedCommand = command.trim();
      if (!normalizedCommand) {
        return 0;
      }
      const tool = extractTraceToolFromCommand(normalizedCommand);
      const related = diagnosisHistory
        .filter((item) => {
          if (item.kind !== kind) return false;
          if (!tool) return true;
          return extractTraceToolFromCommand(item.command) === tool;
        })
        .sort((a, b) => b.at - a.at)
        .slice(0, 3);
      if (related.length < 2) {
        return 0;
      }
      const latest = related[0];
      const previous = related[1];
      const latestFailed = DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(latest.status);
      const previousFailed = DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(previous.status);
      if (latestFailed && previousFailed) return 2;
      if (!latestFailed && previousFailed) return -1;
      if (latestFailed && !previousFailed) return 1;
      return 0;
    };
    const getPriorityScore = (
      severity: "high" | "medium" | "low",
      matrixScore: number,
      trendWeight: number,
    ): number => {
      const severityWeight = severity === "high" ? 3 : severity === "medium" ? 2 : 1;
      return severityWeight * 5 + matrixScore * 2 + trendWeight;
    };

    if (cockpitQueuePressure === "saturated" || cockpitQueuePressure === "congested" || cockpitQueuePressure === "busy") {
      const reversibility: PermissionReversibilityLevel = "reversible";
      const blastRadius: PermissionBlastRadiusLevel = "local";
      const trendWeight = getRecommendationTrendWeight("queue_diagnostics", traceQueueDiagnosticsCommand);
      const matrixScore = getReversibilityMatrixScore(reversibility) + getBlastRadiusMatrixScore(blastRadius);
      const severity: "high" | "medium" | "low" = cockpitQueuePressure === "busy" ? "medium" : "high";
      rows.push({
        id: "queue",
        label: tracePanelText.hotspotRunQueueDiagnostics,
        reason: diffPanelText.diagnosisRecommendationQueueReason,
        severity,
        reversibility,
        blastRadius,
        matrixScore,
        trendWeight,
        priorityScore: getPriorityScore(severity, matrixScore, trendWeight),
        command: traceQueueDiagnosticsCommand,
        canRun: traceQueueDiagnosticsCommand.trim().length > 0,
        onPrepare: handlePrepareTraceQueueDiagnosticsCommand,
        onRun: handleRunTraceQueueDiagnosticsCommand,
      });
    }

    if (traceHotspotDiagnosisVisible && topTraceHotspot) {
      const investigateCommand = buildTraceInvestigateCommand(false)?.command ?? "";
      const reversibility = dominantReversibility;
      const blastRadius = dominantBlastRadius;
      const severity: "high" | "medium" | "low" =
        topTraceHotspot.errors > 0 || topTraceHotspot.denied > 0 ? "high" : "medium";
      const matrixScore = getReversibilityMatrixScore(reversibility) + getBlastRadiusMatrixScore(blastRadius);
      const trendWeight = getRecommendationTrendWeight("investigate", investigateCommand);
      rows.push({
        id: "hotspot",
        label: tracePanelText.hotspotInvestigate,
        reason: diffPanelText.diagnosisRecommendationHotspotReason.replace("{tool}", topTraceHotspot.tool),
        severity,
        reversibility,
        blastRadius,
        matrixScore,
        trendWeight,
        priorityScore: getPriorityScore(severity, matrixScore, trendWeight),
        command: investigateCommand,
        canRun: investigateCommand.trim().length > 0,
        onPrepare: handlePrepareTraceInvestigateCommand,
        onRun: handleInvestigateHottestTraceTool,
      });
    }

    if (fallbackDiagnosisVisible) {
      const reversibility = dominantReversibility;
      const blastRadius = dominantBlastRadius;
      const severity: "high" | "medium" | "low" = fallbackSuppressionRatioPct >= 50 ? "high" : "medium";
      const matrixScore = getReversibilityMatrixScore(reversibility) + getBlastRadiusMatrixScore(blastRadius);
      const trendWeight = getRecommendationTrendWeight("fallback_investigate", fallbackInvestigateCommand);
      rows.push({
        id: "fallback",
        label: diffPanelText.diagnosisFallbackRun,
        reason: diffPanelText.diagnosisRecommendationFallbackReason,
        severity,
        reversibility,
        blastRadius,
        matrixScore,
        trendWeight,
        priorityScore: getPriorityScore(severity, matrixScore, trendWeight),
        command: fallbackInvestigateCommand,
        canRun: fallbackInvestigateCommand.trim().length > 0,
        onPrepare: handlePrepareFallbackInvestigateCommand,
        onRun: handleRunFallbackInvestigateCommand,
      });
    }

    if (latestFailedDiagnosisHistoryEntry) {
      const failedCommand = latestFailedDiagnosisHistoryEntry.command.trim();
      const reversibility: PermissionReversibilityLevel =
        latestFailedDiagnosisHistoryEntry.kind === "summary" ? "reversible" : dominantReversibility;
      const blastRadius: PermissionBlastRadiusLevel =
        latestFailedDiagnosisHistoryEntry.kind === "summary" ? "local" : dominantBlastRadius;
      const matrixScore = getReversibilityMatrixScore(reversibility) + getBlastRadiusMatrixScore(blastRadius);
      const trendWeight = getRecommendationTrendWeight(latestFailedDiagnosisHistoryEntry.kind, failedCommand);
      rows.push({
        id: "replay_failed",
        label: diffPanelText.diagnosisReplayFailed,
        reason: diffPanelText.diagnosisRecommendationFailedReason,
        severity: "high",
        reversibility,
        blastRadius,
        matrixScore,
        trendWeight,
        priorityScore: getPriorityScore("high", matrixScore, trendWeight),
        command: failedCommand,
        canRun: failedCommand.length > 0,
        onPrepare: () => {
          if (!failedCommand) {
            toast.warning(diffPanelText.diagnosisReplayFailedMissing);
            return;
          }
          const contextualCommand = buildReplayTemplateCommandWithContext({
            kind: latestFailedDiagnosisHistoryEntry.kind,
            command: failedCommand,
          });
          focusComposerWithCommand(contextualCommand);
          setTraceQuickCommandState({
            kind: latestFailedDiagnosisHistoryEntry.kind,
            status: "prepared",
            command: failedCommand,
            at: Date.now(),
          });
          toast.success(diffPanelText.diagnosisReplayTemplateContextReady);
        },
        onRun: () => {
          submitDiagnosisReplay(latestFailedDiagnosisHistoryEntry);
        },
      });
    }

    rows.sort((a, b) => b.priorityScore - a.priorityScore || b.matrixScore - a.matrixScore || b.trendWeight - a.trendWeight);
    return rows.slice(0, 4);
  }, [
    cockpitQueuePressure,
    tracePanelText.hotspotRunQueueDiagnostics,
    traceQueueDiagnosticsCommand,
    handlePrepareTraceQueueDiagnosticsCommand,
    handleRunTraceQueueDiagnosticsCommand,
    traceReversibilityCounts,
    traceBlastRadiusCounts,
    currentThreadPermissionDiagnostics,
    diagnosisHistory,
    traceHotspotDiagnosisVisible,
    topTraceHotspot,
    buildTraceInvestigateCommand,
    tracePanelText.hotspotInvestigate,
    diffPanelText.diagnosisRecommendationQueueReason,
    diffPanelText.diagnosisRecommendationFallbackReason,
    diffPanelText.diagnosisRecommendationHotspotReason,
    diffPanelText.diagnosisRecommendationFailedReason,
    diffPanelText.diagnosisFallbackRun,
    diffPanelText.diagnosisReplayFailed,
    diffPanelText.diagnosisReplayFailedMissing,
    diffPanelText.diagnosisReplayTemplateContextReady,
    fallbackDiagnosisVisible,
    fallbackSuppressionRatioPct,
    fallbackInvestigateCommand,
    handlePrepareTraceInvestigateCommand,
    handleInvestigateHottestTraceTool,
    handlePrepareFallbackInvestigateCommand,
    handleRunFallbackInvestigateCommand,
    latestFailedDiagnosisHistoryEntry,
    focusComposerWithCommand,
    buildReplayTemplateCommandWithContext,
    submitDiagnosisReplay,
  ]);
  const diagnosisFailureClusters = useMemo(() => {
    const clusters = new Map<
      string,
      {
        key: string;
        kind: TraceQuickCommandKind;
        kindLabel: string;
        tool: string | null;
        status: TraceQuickCommandStatus;
        statusLabel: string;
        failureCount: number;
        successCount: number;
        totalCount: number;
        trend: "improving" | "degrading" | "flaky" | "stable";
        recoveryRatePct: number;
        firstAt: number;
        firstAtText: string;
        lastAt: number;
        lastAtText: string;
        durationMinutes: number;
        command: string;
        events: Array<{ status: TraceQuickCommandStatus; at: number }>;
      }
    >();

    for (const item of diagnosisHistory) {
      const tool = extractTraceToolFromCommand(item.command);
      const key = `${item.kind}:${tool ?? "-"}`;
      const existing = clusters.get(key);
      if (!existing) {
        clusters.set(key, {
          key,
          kind: item.kind,
          kindLabel: getTraceQuickCommandKindLabel(item.kind),
          tool,
          status: item.status,
          statusLabel: getTraceQuickCommandStatusLabel(item.status),
          failureCount: DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(item.status) ? 1 : 0,
          successCount: item.status === "completed" ? 1 : 0,
          totalCount: 1,
          trend: "stable",
          recoveryRatePct: 0,
          firstAt: item.at,
          firstAtText: new Date(item.at).toLocaleTimeString(locale, { hour12: false }),
          lastAt: item.at,
          lastAtText: new Date(item.at).toLocaleTimeString(locale, { hour12: false }),
          durationMinutes: 0,
          command: item.command,
          events: [{ status: item.status, at: item.at }],
        });
        continue;
      }
      existing.totalCount += 1;
      if (DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(item.status)) {
        existing.failureCount += 1;
      }
      if (item.status === "completed") {
        existing.successCount += 1;
      }
      if (item.at <= existing.firstAt) {
        existing.firstAt = item.at;
        existing.firstAtText = new Date(item.at).toLocaleTimeString(locale, { hour12: false });
      }
      if (item.at >= existing.lastAt) {
        existing.lastAt = item.at;
        existing.lastAtText = new Date(item.at).toLocaleTimeString(locale, { hour12: false });
        existing.command = item.command;
        existing.status = item.status;
        existing.statusLabel = getTraceQuickCommandStatusLabel(item.status);
      }
      existing.events.push({ status: item.status, at: item.at });
    }

    return [...clusters.values()]
      .filter((item) => item.failureCount > 0)
      .map((item) => {
        const sortedEvents = [...item.events].sort((a, b) => a.at - b.at);
        const tail = sortedEvents.slice(-3);
        const lastStatus = tail[tail.length - 1]?.status ?? item.status;
        const tailHasFailure = tail.some((event) => DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(event.status));
        const tailHasSuccess = tail.some((event) => event.status === "completed");
        const trend: "improving" | "degrading" | "flaky" | "stable" =
          lastStatus === "completed" && tailHasFailure
            ? "improving"
            : DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(lastStatus) && tailHasSuccess
              ? "flaky"
              : DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(lastStatus)
                ? "degrading"
                : tailHasFailure && tailHasSuccess
                  ? "flaky"
                  : "stable";
        const recoveryRatePct = Math.round((item.successCount / Math.max(1, item.successCount + item.failureCount)) * 100);
        return {
          ...item,
          trend,
          recoveryRatePct,
          durationMinutes: Math.max(0, Math.round((item.lastAt - item.firstAt) / 60_000)),
        };
      })
      .sort((a, b) => b.failureCount - a.failureCount || b.lastAt - a.lastAt)
      .slice(0, 6);
  }, [diagnosisHistory, getTraceQuickCommandKindLabel, getTraceQuickCommandStatusLabel, locale]);
  const diagnosisReplayTemplates = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{
      key: string;
      kind: TraceQuickCommandKind;
      kindLabel: string;
      statusLabel: string;
      command: string;
      at: number;
      atText: string;
      riskScore: number;
    }> = [];

    for (const item of diagnosisHistorySorted) {
      const command = item.command.trim();
      if (!command) continue;
      const key = `${item.kind}:${command.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        kind: item.kind,
        kindLabel: getTraceQuickCommandKindLabel(item.kind),
        statusLabel: getTraceQuickCommandStatusLabel(item.status),
        command,
        at: item.at,
        atText: new Date(item.at).toLocaleTimeString(locale, { hour12: false }),
        riskScore: getDiagnosisHistoryRiskScore(item),
      });
      if (rows.length >= 8) {
        break;
      }
    }

    return rows.sort((a, b) => b.riskScore - a.riskScore || b.at - a.at).slice(0, 6);
  }, [diagnosisHistorySorted, getTraceQuickCommandKindLabel, getTraceQuickCommandStatusLabel, locale]);
  const diagnosisReplayCompareReport = useMemo(() => {
    const grouped = new Map<string, TraceQuickCommandState[]>();
    for (const item of diagnosisHistory) {
      const command = item.command.trim();
      if (!command) continue;
      const key = `${item.kind}:${command.toLowerCase()}`;
      const list = grouped.get(key);
      if (list) {
        list.push(item);
      } else {
        grouped.set(key, [item]);
      }
    }

    let candidate: {
      key: string;
      kindLabel: string;
      command: string;
      beforeStatusLabel: string;
      afterStatusLabel: string;
      beforeAtText: string;
      afterAtText: string;
      deltaSeconds: number;
      outcome: "improved" | "regressed" | "flaky" | "unchanged";
      at: number;
    } | null = null;

    for (const [key, list] of grouped.entries()) {
      const sorted = [...list].sort((a, b) => b.at - a.at);
      if (sorted.length < 2) continue;
      const after = sorted[0];
      const before =
        sorted.find(
          (item) =>
            item.at < after.at ||
            item.status !== after.status ||
            item.command !== after.command ||
            item.commandId !== after.commandId,
        ) ?? sorted[1];
      if (!before) continue;

      const beforeFailed = DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(before.status);
      const afterFailed = DIAGNOSIS_HISTORY_FAILED_STATUS_SET.has(after.status);
      const outcome: "improved" | "regressed" | "flaky" | "unchanged" =
        beforeFailed && !afterFailed
          ? "improved"
          : !beforeFailed && afterFailed
            ? "regressed"
            : beforeFailed && afterFailed
              ? "flaky"
              : "unchanged";

      const row = {
        key,
        kindLabel: getTraceQuickCommandKindLabel(after.kind),
        command: after.command,
        beforeStatusLabel: getTraceQuickCommandStatusLabel(before.status),
        afterStatusLabel: getTraceQuickCommandStatusLabel(after.status),
        beforeAtText: new Date(before.at).toLocaleTimeString(locale, { hour12: false }),
        afterAtText: new Date(after.at).toLocaleTimeString(locale, { hour12: false }),
        deltaSeconds: Math.max(0, Math.floor((after.at - before.at) / 1000)),
        outcome,
        at: after.at,
      };
      if (!candidate || row.at > candidate.at) {
        candidate = row;
      }
    }

    return candidate;
  }, [diagnosisHistory, getTraceQuickCommandKindLabel, getTraceQuickCommandStatusLabel, locale]);
  const displayTraceRuns = useMemo(
    () => {
      if (!selectedTraceTool) {
        return failureFocusedTraceRuns;
      }
      const next: VisibleTraceRun[] = [];
      for (const run of failureFocusedTraceRuns) {
        const visibleEvents = run.visibleEvents.filter((event) =>
          includeTraceEventForToolFocus(event, selectedTraceTool),
        );
        const hasMatchedToolEvent = visibleEvents.some((event) =>
          isTraceEventToolMatched(event, selectedTraceTool),
        );
        if (visibleEvents.length === 0 || !hasMatchedToolEvent) {
          continue;
        }
        const aggregates = computeTraceAggregates(visibleEvents);
        next.push({
          ...run,
          visibleEvents,
          ...aggregates,
        });
      }
      return next;
    },
    [failureFocusedTraceRuns, selectedTraceTool],
  );
  const visibleTraceEventCount = useMemo(
    () => displayTraceRuns.reduce((count, run) => count + run.visibleEvents.length, 0),
    [displayTraceRuns],
  );
  const visibleTraceRunIds = useMemo(
    () => displayTraceRuns.map((run) => run.id),
    [displayTraceRuns],
  );
  const traceForceExpandRuns = traceFailureFocus || Boolean(selectedTraceTool);
  const hasExpandedTraceRuns = useMemo(
    () =>
      displayTraceRuns.some((run) =>
        traceForceExpandRuns
          ? run.visibleWarningCount > 0 || run.visibleErrorCount > 0 || run.visibleEvents.length > 0
          : Boolean(expandedTraceRuns[run.id]),
      ),
    [displayTraceRuns, expandedTraceRuns, traceForceExpandRuns],
  );

  useEffect(() => {
    if (traceRunGroups.length === 0) {
      setExpandedTraceRuns((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const validIds = new Set(traceRunGroups.map((run) => run.id));
    setExpandedTraceRuns((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, expanded] of Object.entries(prev)) {
        if (validIds.has(id)) {
          next[id] = expanded;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [traceRunGroups]);

  return (
    <div className="relative flex h-full w-full flex-col bg-background text-foreground selection:bg-primary/10 overflow-hidden font-sans">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-4 bg-background/95">
        <div className="flex items-center gap-3">
          <Terminal size={14} className="text-muted-foreground/70" />
          <h1 className="text-[13px] font-medium text-foreground/85">
            {translate(locale, "agent.headerTitle")} 鐠?<span className="text-foreground/95" title={currentThreadName}>{compactThreadName}</span>{" "}
            {effectiveWorkingDir && (
              <span className="text-[11px] text-muted-foreground/70 ml-1">@{effectiveWorkingDir}</span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge variant="outline" className="h-6 text-[11px] px-2 border-border/50 text-muted-foreground/90 bg-background cursor-default">
            {translate(locale, "agent.engineBadge")}
          </Badge>
          {toolCallCount > 0 && (
            <Badge variant="outline" className="h-6 text-[11px] px-2 border-green-500/30 text-green-600 bg-green-500/5">
              <Wrench size={11} className="mr-1" /> {toolCallCount} {translate(locale, "agent.toolRuns")}
            </Badge>
          )}
          <ActivityStatusBadges
            hasConnection={hasConnection}
            hasActiveWork={hasActiveWork}
            queuedCount={queuedCount}
            queueLimit={queueLimit}
            queueByPriority={queueByPriority}
            runningTaskCount={runningTaskCount}
            statusLabel={statusLabel}
            queuePriorityCaption={translate(locale, "agent.metricQueuePriority")}
            queuePriorityNowLabel={translate(locale, "agent.queue.priority.now")}
            queuePriorityNextLabel={translate(locale, "agent.queue.priority.next")}
            queuePriorityLaterLabel={translate(locale, "agent.queue.priority.later")}
            queuePressureCaption={tracePanelText.queuePressureTitle}
            queuePressureIdleLabel={tracePanelText.queuePressureIdle}
            queuePressureBusyLabel={tracePanelText.queuePressureBusy}
            queuePressureCongestedLabel={tracePanelText.queuePressureCongested}
            queuePressureSaturatedLabel={tracePanelText.queuePressureSaturated}
            lastActivityAt={lastUiActivityAtRef.current}
            stalledLabel={translate(locale, "agent.trace.stall")}
            continueLabel={lastContinueReasonLabel}
            continueCaption={translate(locale, "agent.metricContinue")}
            retryDiagnosticLabel={latestRetryDiagnosticLabel}
            retryDiagnosticCaption={translate(locale, "agent.metricRetry")}
            retryDiagnosticWarn={latestRetryDiagnosticWarn}
            retryDiagnosticHint={translate(locale, "agent.trace.openRetryDiagnostics")}
            onRetryDiagnosticClick={handleOpenRetryTraceDiagnostics}
            latestEventLabel={latestStreamEventLabel}
            latestEventCaption={translate(locale, "agent.trace.latest")}
          />
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-md border border-border/50 bg-background hover:bg-muted",
              isTracePanelOpen && "border-primary/35 text-primary",
            )}
            onClick={handleToggleTracePanel}
            title={isTracePanelOpen ? tracePanelText.close : tracePanelText.open}
          >
            <ListTree size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-md border border-border/50 bg-background hover:bg-muted",
              isConsolePanelOpen && "border-primary/35 text-primary",
            )}
            onClick={handleToggleConsolePanel}
            title={isConsolePanelOpen ? consoleText.close : consoleText.open}
          >
            <Terminal size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-md border border-border/50 bg-background hover:bg-muted",
              isSidebarPanelOpen && "border-primary/35 text-primary",
            )}
            onClick={toggleSidebarPanel}
            title={isSidebarPanelOpen ? translate(locale, "agent.sidebarCollapse") : translate(locale, "agent.sidebarTitle")}
          >
            {isSidebarPanelOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-border/50 bg-background hover:bg-muted"
            onClick={toggleDiffPanel}
            title={isDiffPanelOpen ? diffPanelText.close : diffPanelText.open}
          >
            {isDiffPanelOpen ? <SquareMinus size={14} /> : <SquarePlus size={14} />}
          </Button>
        </div>
      </header>
      {isTracePanelOpen && (
        <div className="shrink-0 border-b border-border/40 bg-background/90">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="text-[11px] font-medium text-muted-foreground/85">
              {tracePanelText.recent} ({visibleTraceEventCount}/{rawTraceEventCount})
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-muted-foreground"
                onClick={() => handleExpandAllTraceRuns(visibleTraceRunIds)}
                disabled={visibleTraceRunIds.length === 0 || traceForceExpandRuns}
              >
                {tracePanelText.runExpandAll}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-muted-foreground"
                onClick={() => handleCollapseAllTraceRuns(visibleTraceRunIds)}
                disabled={visibleTraceRunIds.length === 0 || !hasExpandedTraceRuns || traceForceExpandRuns}
              >
                {tracePanelText.runCollapseAll}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-[10px] text-muted-foreground"
                onClick={handleClearTraceEvents}
                disabled={rawTraceEventCount === 0}
              >
                {tracePanelText.clear}
              </Button>
            </div>
          </div>
          <div className="mx-4 mb-2 rounded border border-border/35 bg-background/70 px-2.5 py-2 text-[10px] text-muted-foreground/85">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground/85">{tracePanelText.promptInspectorTitle}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded border border-border/35 bg-background/70 px-2 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                  onClick={() => setIsPromptGovernanceExpanded((prev) => !prev)}
                  disabled={!latestPromptCompiled || latestPromptSectionRows.length === 0}
                >
                  {isPromptGovernanceExpanded
                    ? tracePanelText.promptInspectorCollapse
                    : tracePanelText.promptInspectorExpand}
                </button>
                <button
                  type="button"
                  className="rounded border border-border/35 bg-background/70 px-2 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                  onClick={() => {
                    void handleCopyPromptInspector();
                  }}
                  disabled={!latestPromptCompiled}
                >
                  {tracePanelText.promptInspectorCopy}
                </button>
              </div>
            </div>
            {latestPromptCompiled ? (
              <div className="mt-1 space-y-1">
                <div>
                  {tracePanelText.promptInspectorSections}: {latestPromptCompiled.staticSections} +{" "}
                  {latestPromptCompiled.dynamicSections}
                </div>
                <div>
                  {tracePanelText.promptInspectorChars}: {latestPromptCompiled.staticChars} +{" "}
                  {latestPromptCompiled.dynamicChars} = {latestPromptCompiled.totalChars}
                </div>
                {latestPromptCompiled.staticHash && latestPromptCompiled.dynamicHash && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorHashes}: {latestPromptCompiled.staticHash} /{" "}
                    {latestPromptCompiled.dynamicHash}
                  </div>
                )}
                {latestPromptModelLaunchTags.length > 0 && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorTags}: {latestPromptModelLaunchTags.join(", ")}
                  </div>
                )}
                {latestPromptGovernance && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorGovernance}:{" "}
                    {`core=${latestPromptGovernance.ownerCounts.core}, safeguards=${latestPromptGovernance.ownerCounts.safeguards}, runtime=${latestPromptGovernance.ownerCounts.runtime}, immutable=${latestPromptGovernance.immutableCount}, launch=${latestPromptGovernance.modelLaunchCount}`}
                  </div>
                )}
                {latestPromptStaticIds.length > 0 && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorStaticIds}: {latestPromptStaticIds.join(", ")}
                  </div>
                )}
                {latestPromptDynamicIds.length > 0 && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorDynamicIds}: {latestPromptDynamicIds.join(", ")}
                  </div>
                )}
                {latestPromptSectionMetaPreview.length > 0 && (
                  <div className="break-all">
                    {tracePanelText.promptInspectorSectionMeta}: {latestPromptSectionMetaPreview.join(", ")}
                  </div>
                )}
                {isPromptGovernanceExpanded && latestPromptSectionRows.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded border border-border/35 bg-background/75">
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-left text-[9px]">
                        <thead className="sticky top-0 z-[1] bg-muted/40 text-muted-foreground/85">
                          <tr>
                            <th className="px-2 py-1 font-medium">{tracePanelText.promptInspectorSectionMeta}</th>
                            <th className="px-2 py-1 font-medium">{tracePanelText.promptInspectorColumnKind}</th>
                            <th className="px-2 py-1 font-medium">{tracePanelText.promptInspectorColumnOwner}</th>
                            <th className="px-2 py-1 font-medium">{tracePanelText.promptInspectorColumnMutable}</th>
                            <th className="px-2 py-1 font-medium">{tracePanelText.promptInspectorColumnLaunchTag}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestPromptSectionRows.map((section) => (
                            <tr key={`${section.id}-${section.index}`} className="border-t border-border/25 align-top">
                              <td className="px-2 py-1 font-mono text-[9px] text-foreground/85">{section.id}</td>
                              <td className="px-2 py-1 text-muted-foreground/90">{section.kind}</td>
                              <td className="px-2 py-1 text-muted-foreground/90">{section.owner}</td>
                              <td className="px-2 py-1 text-muted-foreground/90">
                                {section.mutable
                                  ? tracePanelText.promptInspectorMutableYes
                                  : tracePanelText.promptInspectorMutableNo}
                              </td>
                              <td className="px-2 py-1 font-mono text-[9px] text-muted-foreground/85">
                                {section.modelLaunchTag ?? tracePanelText.promptInspectorLaunchTagNone}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-1 text-muted-foreground/70">{tracePanelText.promptInspectorEmpty}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 px-4 pb-2">
            {traceFilterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={cn(
                  "rounded border px-2 py-1 text-[10px] transition-colors",
                  traceFilter === option.key
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
                )}
                onClick={() => setTraceFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "rounded border px-2 py-1 text-[10px] transition-colors",
                traceWarningsOnly
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
              )}
              onClick={() => setTraceWarningsOnly((prev) => !prev)}
            >
              {tracePanelText.warningsOnly}
            </button>
            <button
              type="button"
              className={cn(
                "rounded border px-2 py-1 text-[10px] transition-colors",
                traceFailureFocus
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
              )}
              onClick={() => setTraceFailureFocus((prev) => !prev)}
            >
              {tracePanelText.failureFocus}
            </button>
            <span className="ml-1 text-[9px] text-muted-foreground/65">{tracePanelText.riskLabel}</span>
            {traceRiskFilterOptions.map((option) => (
              <button
                key={`trace-risk-${option.key}`}
                type="button"
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                  traceRiskFilter === option.key
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
                )}
                onClick={() => setTraceRiskFilter(option.key)}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 px-4 pb-1">
            <span className="ml-1 text-[9px] text-muted-foreground/65">{tracePanelText.riskReversibilityLabel}</span>
            {traceReversibilityFilterOptions.map((option) => (
              <button
                key={`trace-reversibility-${option.key}`}
                type="button"
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                  traceReversibilityFilter === option.key
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
                )}
                onClick={() => setTraceReversibilityFilter(option.key)}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 px-4 pb-2">
            <span className="ml-1 text-[9px] text-muted-foreground/65">{tracePanelText.riskBlastRadiusLabel}</span>
            {traceBlastRadiusFilterOptions.map((option) => (
              <button
                key={`trace-blast-radius-${option.key}`}
                type="button"
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                  traceBlastRadiusFilter === option.key
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
                )}
                onClick={() => setTraceBlastRadiusFilter(option.key)}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
          {traceHotspotQueuePriorityVisible && (
            <div className="flex flex-wrap items-center gap-1 px-4 pb-1">
              <span className="text-[10px] text-muted-foreground/70">{tracePanelText.queuePriorityTitle}</span>
              <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85">
                {translate(locale, "agent.queue.priority.now")} +{traceHotspotQueuePriorityStats.queued.now}/-
                {traceHotspotQueuePriorityStats.dequeued.now}/!{traceHotspotQueuePriorityStats.rejected.now}
              </span>
              <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85">
                {translate(locale, "agent.queue.priority.next")} +{traceHotspotQueuePriorityStats.queued.next}/-
                {traceHotspotQueuePriorityStats.dequeued.next}/!{traceHotspotQueuePriorityStats.rejected.next}
              </span>
              <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85">
                {translate(locale, "agent.queue.priority.later")} +{traceHotspotQueuePriorityStats.queued.later}/-
                {traceHotspotQueuePriorityStats.dequeued.later}/!{traceHotspotQueuePriorityStats.rejected.later}
              </span>
              <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/75">
                {queueLimit > 0
                  ? `Q${traceHotspotQueuePriorityStats.latestQueueDepth}/${queueLimit}`
                  : `Q${traceHotspotQueuePriorityStats.latestQueueDepth}`}
              </span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px]",
                  traceHotspotQueuePriorityStats.pressure === "saturated"
                    ? "border-red-500/45 bg-red-500/10 text-red-600 dark:text-red-300"
                    : traceHotspotQueuePriorityStats.pressure === "congested"
                      ? "border-amber-500/45 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                      : traceHotspotQueuePriorityStats.pressure === "busy"
                        ? "border-yellow-500/45 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300"
                        : "border-emerald-500/45 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                )}
              >
                {traceHotspotQueuePressureLabel}
              </span>
            </div>
          )}
          {(traceQueueDiagnosisVisible || traceHotspotDiagnosisVisible) && (
            <div className="space-y-1 px-4 pb-1">
              <span className="text-[10px] text-muted-foreground/70">{tracePanelText.diagnosisTitle}</span>
              {traceQueueDiagnosisVisible && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {tracePanelText.diagnosisQueueTitle}
                    </span>
                    <span className="font-mono text-[9px] text-amber-700/80 dark:text-amber-300/90">
                      {traceQueueDiagnosisSummary}
                    </span>
                  </div>
                  <div className="mt-1 grid gap-0.5 text-muted-foreground/90">
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                      {tracePanelText.diagnosisQueueRootCause}
                    </p>
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                      {tracePanelText.diagnosisQueueFix}
                    </p>
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                      {tracePanelText.diagnosisQueueVerify}
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                      onClick={handlePrepareTraceQueueDiagnosticsCommand}
                    >
                      {tracePanelText.hotspotPrepareQueueDiagnostics}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                      onClick={handleRunTraceQueueDiagnosticsCommand}
                    >
                      {tracePanelText.hotspotRunQueueDiagnostics}
                    </button>
                    {traceQueueDiagnosticsQueued && (
                      <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                        {tracePanelText.commandStatusQueued}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {traceHotspotDiagnosisVisible && topTraceHotspot && (
                <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[10px]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-medium text-red-700 dark:text-red-300">
                      {tracePanelText.diagnosisHotspotTitle.replace("{tool}", topTraceHotspot.tool)}
                    </span>
                    <span className="font-mono text-[9px] text-red-700/80 dark:text-red-300/90">
                      {tracePanelText.diagnosisHotspotSummary
                        .replace("{total}", String(topTraceHotspot.total))
                        .replace("{errors}", String(topTraceHotspot.errors))
                        .replace("{rejected}", String(topTraceHotspot.rejected))
                        .replace("{denied}", String(topTraceHotspot.denied))}
                    </span>
                  </div>
                  <div className="mt-1 grid gap-0.5 text-muted-foreground/90">
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                      {tracePanelText.diagnosisHotspotRootCause}
                    </p>
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                      {tracePanelText.diagnosisHotspotFix}
                    </p>
                    <p>
                      <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                      {tracePanelText.diagnosisHotspotVerify}
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                      onClick={handlePrepareTraceInvestigateCommand}
                    >
                      {tracePanelText.hotspotPrepareCommand}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                      onClick={handleInvestigateHottestTraceTool}
                    >
                      {tracePanelText.hotspotInvestigate}
                    </button>
                    {traceInvestigateQueued && (
                      <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                        {tracePanelText.commandStatusQueued}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 px-4 pb-1">
            <span className="text-[10px] text-muted-foreground/70">{tracePanelText.hotspots}</span>
            <span className="text-[9px] text-muted-foreground/60">{tracePanelText.hotspotWindow}</span>
            <button
              type="button"
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                traceQueueDiagnosticsPresetActive
                  ? "border-primary/45 bg-primary/10 text-primary"
                  : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
              )}
              onClick={handleApplyTraceQueueDiagnosticsPreset}
            >
              {tracePanelText.hotspotQueueDiagnostics}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handlePrepareTraceQueueDiagnosticsCommand}
            >
              {tracePanelText.hotspotPrepareQueueDiagnostics}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handleRunTraceQueueDiagnosticsCommand}
            >
              {tracePanelText.hotspotRunQueueDiagnostics}
            </button>
            {traceQueueDiagnosticsQueued && (
              <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-300">
                {tracePanelText.commandStatusQueued}
              </span>
            )}
            {TRACE_HOTSPOT_WINDOW_OPTIONS.map((option) => {
              const optionLabel =
                option.key === "runs3"
                  ? tracePanelText.hotspotRuns3
                  : option.key === "runs6"
                    ? tracePanelText.hotspotRuns6
                    : tracePanelText.hotspotAll;
              return (
                <button
                  key={`trace-hotspot-window-${option.key}`}
                  type="button"
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                    traceHotspotWindow === option.key
                      ? "border-primary/45 bg-primary/10 text-primary"
                      : "border-border/35 bg-background/70 text-muted-foreground/80 hover:text-foreground",
                  )}
                  onClick={() => setTraceHotspotWindow(option.key)}
                >
                  {optionLabel}
                </button>
              );
            })}
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handlePrepareTraceSummaryCommand}
            >
              {tracePanelText.hotspotPrepareSummary}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handleRunTraceSummaryCommand}
            >
              {tracePanelText.hotspotRunSummary}
            </button>
            {traceSummaryQueued && (
              <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-300">
                {tracePanelText.commandStatusQueued}
              </span>
            )}
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handlePrepareTraceHotspotsCommand}
            >
              {tracePanelText.hotspotPrepareHotspots}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handleRunTraceHotspotsCommand}
            >
              {tracePanelText.hotspotRunHotspots}
            </button>
            {traceHotspotsQueued && (
              <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-300">
                {tracePanelText.commandStatusQueued}
              </span>
            )}
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handleFocusHottestTraceTool}
            >
              {tracePanelText.hotspotFocusHottest}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handleInvestigateHottestTraceTool}
            >
              {tracePanelText.hotspotInvestigate}
            </button>
            <button
              type="button"
              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={handlePrepareTraceInvestigateCommand}
            >
              {tracePanelText.hotspotPrepareCommand}
            </button>
            {traceInvestigateQueued && (
              <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-300">
                {tracePanelText.commandStatusQueued}
              </span>
            )}
            {selectedTraceTool && (
              <button
                type="button"
                className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary transition-colors hover:border-primary/55"
                onClick={() => setSelectedTraceTool(null)}
                title={tracePanelText.toolFocusClear}
              >
                {tracePanelText.toolFocusActive.replace("{tool}", selectedTraceTool)}
              </button>
            )}
            {traceQuickCommandStatusLabel && (
              <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">
                {traceQuickCommandStatusLabel}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 px-4 pb-2">
            {traceToolHotspots.length === 0 ? (
              <span className="text-[10px] text-muted-foreground/60">{tracePanelText.hotspotsEmpty}</span>
            ) : (
              traceToolHotspots.map((item) => {
                const selected = selectedTraceTool === item.tool;
                return (
                  <button
                    key={`trace-hotspot-${item.tool}`}
                    type="button"
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                      selected
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : item.errors > 0
                          ? "border-destructive/45 bg-destructive/10 text-destructive"
                          : item.denied > 0 || item.rejected > 0
                            ? "border-amber-500/45 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                            : "border-border/35 bg-background/70 text-muted-foreground/85",
                    )}
                    title={`${item.tool} total=${item.total} error=${item.errors} rejected=${item.rejected} denied=${item.denied}`}
                    onClick={() =>
                      setSelectedTraceTool((prev) => (prev === item.tool ? null : item.tool))
                    }
                  >
                    {item.tool} {item.total}
                  </button>
                );
              })
            )}
          </div>
          <div className="max-h-[220px] overflow-y-auto px-4 pb-2">
            {displayTraceRuns.length === 0 ? (
              <div className="py-2 text-[11px] text-muted-foreground/70">{tracePanelText.empty}</div>
            ) : (
              <div className="space-y-2">
                {displayTraceRuns.map((run) => {
                  const expanded = traceForceExpandRuns
                    ? run.visibleWarningCount > 0 || run.visibleErrorCount > 0 || run.visibleEvents.length > 0
                    : Boolean(expandedTraceRuns[run.id]);
                  const runLabel = translate(locale, "agent.trace.run", { index: run.runIndex });
                  const runStatusLabel = run.terminalReason
                    ? formatTerminalReason(locale, run.terminalReason)
                    : tracePanelText.runStatusOngoing;
                  const runStart = formatTraceEventTime(locale, run.startedAt);
                  const runEnd = formatTraceEventTime(locale, run.endedAt);
                  const runDuration = Math.max(0, ((run.endedAt - run.startedAt) / 1000)).toFixed(1);
                  return (
                    <div
                      key={run.id}
                      className="rounded border border-border/30 bg-muted/10"
                    >
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-1.5 text-left"
                          onClick={() => {
                            if (traceForceExpandRuns) return;
                            handleToggleTraceRun(run.id);
                          }}
                          title={
                            traceForceExpandRuns
                              ? selectedTraceTool
                                ? tracePanelText.toolFocusActive.replace("{tool}", selectedTraceTool)
                                : tracePanelText.failureFocus
                              : expanded
                                ? tracePanelText.runCollapse
                                : tracePanelText.runExpand
                          }
                        >
                          <ChevronRight
                            size={12}
                            className={cn(
                              "shrink-0 text-muted-foreground/75 transition-transform",
                              expanded && "rotate-90",
                            )}
                          />
                          <span className="truncate text-[10px] font-medium text-foreground/85">
                            {runLabel}
                          </span>
                        </button>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">
                            {tracePanelText.runStatus}: {runStatusLabel}
                          </span>
                          <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">
                            {translate(locale, "agent.trace.runDuration", { seconds: runDuration })}
                          </span>
                          <span className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">
                            {translate(locale, "agent.trace.runEvents", { count: run.visibleEvents.length })}
                          </span>
                          {run.visibleWarningCount > 0 && (
                            <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-300">
                              {translate(locale, "agent.trace.runWarnings", { count: run.visibleWarningCount })}
                            </span>
                          )}
                          {run.visibleErrorCount > 0 && (
                            <span className="rounded border border-destructive/45 bg-destructive/10 px-1.5 py-0.5 text-[9px] text-destructive">
                              {translate(locale, "agent.trace.runErrors", { count: run.visibleErrorCount })}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[9px] text-muted-foreground/85"
                            onClick={() => {
                              void handleCopyTraceRun(run);
                            }}
                          >
                            <Copy size={11} className="mr-1" />
                            {tracePanelText.copyRun}
                          </Button>
                        </div>
                      </div>
                      <div className="px-2 pb-1 text-[9px] text-muted-foreground/70">
                        {tracePanelText.runRange}: {runStart} {"->"} {runEnd}
                      </div>
                      <div className="px-2 pb-1.5">
                        <div className="flex h-1.5 overflow-hidden rounded bg-border/35">
                          {TRACE_CATEGORY_ORDER.map((category) => {
                            const count = run.categoryCounts[category];
                            if (count <= 0) {
                              return null;
                            }
                            const widthPercent = (count / Math.max(1, run.visibleEvents.length)) * 100;
                            const categoryLabel = translate(locale, `agent.trace.bucket.${category}`);
                            return (
                              <span
                                key={`${run.id}:${category}`}
                                className={getTraceCategoryBarClass(category)}
                                style={{ width: `${widthPercent}%` }}
                                title={`${categoryLabel}: ${count}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5">
                        {TRACE_CATEGORY_ORDER.map((category) => {
                          const count = run.categoryCounts[category];
                          if (count <= 0) {
                            return null;
                          }
                          const categoryLabel = translate(locale, `agent.trace.bucket.${category}`);
                          return (
                            <span
                              key={`${run.id}:chip:${category}`}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[9px]",
                                getTraceCategoryChipClass(category),
                              )}
                            >
                              {categoryLabel} {count}
                            </span>
                          );
                        })}
                      </div>
                      {expanded && (
                        <div className="space-y-1 border-t border-border/30 px-2 py-1.5">
                          {run.visibleEvents.map((event, index) => {
                            const label =
                              formatLatestTraceEventLabel(locale, event) ??
                              translate(locale, "agent.trace.event.unknown");
                            const at = formatTraceEventTime(locale, event.at);
                            const severity = getTraceEventSeverity(event);
                            const severityLabel =
                              severity === "error"
                                ? tracePanelText.levelError
                                : severity === "warn"
                                  ? tracePanelText.levelWarn
                                  : tracePanelText.levelInfo;
                            const permissionRisk = getTracePermissionRisk(event);
                            const permissionRiskLabel = permissionRisk
                              ? translate(locale, `agent.trace.permissionRisk.${permissionRisk}`)
                              : null;
                            const permissionReversibility = getTracePermissionReversibility(event);
                            const permissionReversibilityLabel = permissionReversibility
                              ? translate(locale, `agent.permission.prompt.reversibility.${permissionReversibility}`)
                              : null;
                            const permissionBlastRadius = getTracePermissionBlastRadius(event);
                            const permissionBlastRadiusLabel = permissionBlastRadius
                              ? translate(locale, `agent.permission.prompt.blastRadius.${permissionBlastRadius}`)
                              : null;
                            return (
                              <div
                                key={`${run.id}:${event.type}:${event.at}:${index}`}
                                className={cn(
                                  "flex items-start gap-2 rounded border px-2 py-1.5 text-[10px]",
                                  getTraceSeverityRowClass(severity),
                                )}
                              >
                                <span className="font-mono text-muted-foreground/60">{at}</span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
                                    getTraceSeverityBadgeClass(severity),
                                  )}
                                >
                                  {severityLabel}
                                </span>
                                <span className="rounded border border-border/30 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/80">
                                  {event.type}
                                </span>
                                {permissionRisk && permissionRiskLabel && (
                                  <span
                                    className={cn(
                                      "rounded border px-1.5 py-0.5 text-[9px]",
                                      getTracePermissionRiskBadgeClass(permissionRisk),
                                    )}
                                  >
                                    {permissionRiskLabel}
                                  </span>
                                )}
                                {permissionReversibility && permissionReversibilityLabel && (
                                  <span
                                    className={cn(
                                      "rounded border px-1.5 py-0.5 text-[9px]",
                                      getTracePermissionReversibilityBadgeClass(permissionReversibility),
                                    )}
                                  >
                                    {permissionReversibilityLabel}
                                  </span>
                                )}
                                {permissionBlastRadius && permissionBlastRadiusLabel && (
                                  <span
                                    className={cn(
                                      "rounded border px-1.5 py-0.5 text-[9px]",
                                      getTracePermissionBlastRadiusBadgeClass(permissionBlastRadius),
                                    )}
                                  >
                                    {permissionBlastRadiusLabel}
                                  </span>
                                )}
                                <span className="break-all text-foreground/80">{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1"
          key={currentThreadId || "default"}
          resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
        >

          {/* Sidebar: thread history */}
          <ResizablePanel
            panelRef={panelRef}
            id="agent-sidebar"
            defaultSize="26"
            minSize={isSidebarPanelOpen ? "22" : "0"}
            maxSize={isSidebarPanelOpen ? "38" : "0"}
            disabled={!isSidebarPanelOpen}
            onResize={handleSidebarResize}
            className={cn(
              "flex flex-col bg-muted/10 border-r border-border/30",
              !isSidebarPanelOpen && "border-r-0"
            )}
          >
            <ThreadSidebar
              threads={threads}
              currentThreadId={currentThreadId}
              selectedWorkspacePath={effectiveWorkingDir}
              editingId={editingId}
              editingName={editingName}
              onEditingNameChange={setEditingName}
              onSelectWorkspace={handleSelectWorkspace}
              onNewThread={handleNewThread}
              onLoadThread={handleLoadThreadFromSidebar}
              onStartRename={handleStartRename}
              onConfirmRename={handleConfirmRenameFromSidebar}
              onCancelRename={handleCancelRename}
              onDeleteThread={handleDeleteThreadFromSidebar}
              onInvestigateThread={handleInvestigateThreadFromSidebar}
              onRunDiagnosisThread={handleRunThreadDiagnosisFromSidebar}
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            disableDoubleClick
            className={cn(
              "bg-transparent hover:bg-primary/10",
              !isSidebarPanelOpen && "pointer-events-none opacity-0 w-0 before:hidden"
            )}
          />

          {/* Main panel: messages and input */}
          <ResizablePanel
            id="agent-main-content"
            defaultSize="62"
            minSize={isDiffPanelExpanded ? "0" : "36"}
            className="relative flex flex-col bg-background"
          >
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden"
              ref={scrollRef}
              onScroll={handleScroll}
              onWheel={handleWheel}
            >
              <div className="max-w-3xl mx-auto px-6 py-10">
                <VirtualMessageList
                  items={messages}
                  itemKey={(message) => message.id}
                  scrollParentRef={scrollRef}
                  estimateHeight={virtualEstimateHeight}
                  overscan={virtualListOverscan}
                  enabled={messages.length > 20}
                  className="space-y-12"
                  renderItem={renderVirtualMessageItem}
                />

                <ThinkingIndicator
                  isThinking={isThinking}
                  lastActivityAt={lastUiActivityAtRef.current}
                  label={translate(locale, "agent.thinking")}
                  stalledLabel={translate(locale, "agent.trace.stalled", { seconds: "{seconds}" })}
                />
              </div>
            </div>

            {activePermissionItem && (
              <div className="border-t border-border/30 bg-muted/10 px-6 py-3">
                <div className="mx-auto max-w-3xl rounded-lg border border-amber-500/30 bg-background/90 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-medium text-amber-600">
                      {translate(locale, "agent.permission.prompt.title")}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleOpenPermissionTraceDiagnostics}
                        className="rounded-md border border-border/40 bg-background px-2 py-1 text-[10px] text-muted-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                        title={translate(locale, "agent.permission.prompt.openTraceHint")}
                      >
                        {translate(locale, "agent.permission.prompt.openTrace")}
                      </button>
                      {pendingPermissionCount > 1 && (
                        <Badge variant="outline" className="h-5 border-border/40 text-[10px]">
                          {translate(locale, "agent.permission.prompt.queue", { count: pendingPermissionCount })}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-[12px] text-foreground/90">
                    <p>
                      <span className="text-muted-foreground/80">{translate(locale, "agent.toolPrefix")}:</span>{" "}
                      <span>{activePermissionItem.request.tool}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground/80">{translate(locale, "agent.permission.prompt.reason")}:</span>{" "}
                      {activePermissionItem.request.reason}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activePermissionRiskClass && activePermissionRiskLabel && (
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            getTracePermissionRiskBadgeClass(activePermissionRiskClass),
                          )}
                        >
                          {translate(locale, "agent.permission.prompt.risk")}: {activePermissionRiskLabel}
                        </span>
                      )}
                      <span className="rounded border border-border/45 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground/90">
                        {translate(locale, "agent.permission.prompt.reversibility")}: {activePermissionReversibility}
                      </span>
                      <span className="rounded border border-border/45 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground/90">
                        {translate(locale, "agent.permission.prompt.blastRadius")}: {activePermissionBlastRadius}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/85">{activePermissionRiskAdvice}</p>
                    {activePermissionSuggestionSummary && (
                      <p className="text-muted-foreground/85">
                        <span className="text-muted-foreground/80">
                          {translate(locale, "agent.permission.prompt.suggestion")}:
                        </span>{" "}
                        {activePermissionSuggestionSummary}
                      </p>
                    )}
                    {activePermissionScopeReminder && (
                      <p className="text-amber-700/90 dark:text-amber-300/90">
                        {activePermissionScopeReminder}
                      </p>
                    )}
                    {activePermissionWorkspaceHint && (
                      <p className="text-amber-700/90 dark:text-amber-300/90">
                        {activePermissionWorkspaceHint}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      disabled={!permissionDelayReady}
                      onClick={() => resolveActivePermission("allow_once")}
                      className="rounded-md border border-border/50 bg-background px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {translate(locale, "agent.permission.prompt.allowOnce")}
                    </button>
                    <button
                      disabled={!permissionDelayReady}
                      onClick={() => resolveActivePermission("allow_session")}
                      className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {translate(locale, "agent.permission.prompt.allowSession")}
                    </button>
                    <button
                      disabled={!permissionDelayReady}
                      onClick={() => resolveActivePermission("deny")}
                      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {translate(locale, "agent.permission.prompt.deny")}
                    </button>
                    {!permissionDelayReady && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {translate(locale, "agent.permission.prompt.delay")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <ComposerPanel
              input={input}
              isThinking={isThinking}
              isEngineReady={isEngineReady}
              currentModel={currentModel}
              availableModels={availableModels}
              onInputChange={(value, target) => {
                setInput(value);
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onClear={handleClear}
              onModelChange={setCurrentModel}
              onStop={handleStop}
              onSend={handleSend}
              inputRef={inputRef}
              toolNames={toolNames}
              slashCommands={slashCommands}
              queuedItems={queuedQueries}
              onRemoveQueuedItem={handleRemoveQueuedQuery}
              onEditQueuedItem={handleEditQueuedQuery}
              queuedCount={queuedCount}
              queueLimit={queueLimit}
              queueByPriority={queueByPriority}
              permissionMode={permissionMode}
              permissionLabel={permissionLabelForUi}
              permissionRuleCount={permissionRuleCount}
              onPermissionChange={setPermissionMode}
              onClearPermissionRules={handleClearPermissionRules}
              onAllowWorkspaceWrite={handleAllowWorkspaceWrite}
              canAllowWorkspaceWrite={Boolean(effectiveWorkingDir)}
              showUserPopover={showUserPopover}
              onUserPopoverChange={setShowUserPopover}
              userInfo={userInfo}
              onRequestUserInfoRefresh={onRefreshUserInfo}
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            disableDoubleClick
            className={cn(
              "bg-transparent hover:bg-primary/10",
              !isDiffPanelOpen && "pointer-events-none opacity-0 w-0 before:hidden"
            )}
          />
          <ResizablePanel
            panelRef={diffPanelRef}
            id="agent-diff-panel"
            defaultSize="30"
            minSize={isDiffPanelOpen ? "20" : "0"}
            maxSize={isDiffPanelOpen ? (isDiffPanelExpanded ? "100" : "55") : "0"}
            disabled={!isDiffPanelOpen}
            onResize={handleDiffPanelResize}
            className={cn(
              "flex min-w-0 flex-col border-l border-border/40 bg-card/20",
              !isDiffPanelOpen && "border-l-0"
            )}
          >
            <div className="flex h-11 shrink-0 items-center justify-between px-3">
              <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-foreground/85">
                <DropdownMenu open={isDiffScopeMenuOpen} onOpenChange={setIsDiffScopeMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 max-w-[170px] gap-1 px-2 text-[12px] font-medium text-foreground/85"
                    >
                      <span className="truncate">{diffScopeLabel}</span>
                      {isDiffScopeMenuOpen ? (
                        <ChevronRight size={12} className="shrink-0 text-muted-foreground/70" />
                      ) : (
                        <ChevronDown size={12} className="shrink-0 text-muted-foreground/70" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[180px]">
                    <DropdownMenuRadioGroup
                      value={diffScope}
                      onValueChange={(value) => setDiffScope(value as typeof diffScope)}
                    >
                      <DropdownMenuRadioItem value="unstaged">
                        {diffPanelText.scopeUnstaged}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="staged">
                        {diffPanelText.scopeStaged}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="allBranches">
                        {diffPanelText.scopeAllBranches}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="lastRound">
                        {diffPanelText.scopeLastRound}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md text-muted-foreground/80 hover:text-foreground"
                  onClick={() => {
                    void loadGitSnapshot();
                  }}
                  title={diffPanelText.refresh}
                  disabled={gitSnapshotLoading}
                >
                  <RefreshCw
                    size={13}
                    className={cn(gitSnapshotLoading && "animate-spin")}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md text-muted-foreground/80 hover:text-foreground"
                  onClick={() => {
                    void handleOpenRewindPreview();
                  }}
                  title={diffPanelText.rewindPreview}
                  disabled={!effectiveWorkingDir || !currentThreadId || rewindPreviewLoading}
                >
                  <AlertTriangle
                    size={13}
                    className={cn(rewindPreviewLoading && "animate-pulse")}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md text-muted-foreground/80 hover:text-foreground"
                  onClick={toggleDiffPanelExpand}
                  title={isDiffPanelExpanded ? diffPanelText.restore : diffPanelText.expand}
                >
                  {isDiffPanelExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md text-muted-foreground/80 hover:text-foreground data-[state=open]:text-foreground"
                      title={diffPanelText.menu}
                    >
                      <MoreHorizontal size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[220px]">
                    <DropdownMenuItem onSelect={() => { void loadGitSnapshot(); }}>
                      {diffPanelText.refresh}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!effectiveWorkingDir || !currentThreadId || rewindPreviewLoading}
                      onSelect={() => {
                        void handleOpenRewindPreview();
                      }}
                    >
                      {diffPanelText.rewindPreview}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffSplitViewEnabled((prev) => !prev);
                      }}
                    >
                      {diffPanelText.splitView}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffWordWrapEnabled((prev) => !prev);
                      }}
                    >
                      {diffPanelText.disableWrap}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffCollapsedAll((prev) => !prev);
                      }}
                    >
                      {diffPanelText.collapseAll}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffLoadFullFileEnabled((prev) => !prev);
                      }}
                    >
                      {diffPanelText.noFullFile}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffRichTextPreviewEnabled((prev) => !prev);
                      }}
                    >
                      {diffPanelText.richPreview}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDiffTextDiffEnabled((prev) => !prev);
                      }}
                    >
                      {diffPanelText.disableTextDiff}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!canCopyGitApplyCommand}
                      onSelect={() => {
                        void handleCopyGitApplyCommand();
                      }}
                    >
                      {diffPanelText.copyGitApply}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3">
              {!effectiveWorkingDir ? (
                <div className="flex h-full min-h-[220px] items-center justify-center bg-background/60 p-4 text-center">
                  <div className="max-w-[260px] space-y-3">
                    <FilePlus2 size={46} className="mx-auto text-muted-foreground/45" />
                    <div className="text-[16px] font-medium text-foreground/90">{diffPanelText.initRepo}</div>
                    <div className="text-[12px] text-muted-foreground/80">{diffPanelText.initRepoHint}</div>
                    <div className="text-[12px] text-muted-foreground/70">{diffPanelText.noWorkspace}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-xl bg-muted/55 px-3.5 text-[12px]"
                      onClick={() => {
                        void handleCreateGitRepository();
                      }}
                    >
                      {diffPanelText.initRepo}
                    </Button>
                  </div>
                </div>
              ) : gitSnapshotLoading ? (
                <div className="rounded-lg border border-border/40 bg-background/70 p-3 text-[12px] text-muted-foreground/85">
                  {diffPanelText.loading}
                </div>
              ) : gitSnapshotError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
                  {gitSnapshotError}
                </div>
              ) : !gitSnapshot?.is_git_repo ? (
                <div className="flex h-full min-h-[220px] items-center justify-center bg-background/60 p-4 text-center">
                  <div className="max-w-[260px] space-y-3">
                    <FilePlus2 size={46} className="mx-auto text-muted-foreground/45" />
                    <div className="text-[16px] font-medium text-foreground/90">{diffPanelText.initRepo}</div>
                    <div className="text-[12px] text-muted-foreground/80">{diffPanelText.initRepoHint}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-xl bg-muted/55 px-3.5 text-[12px]"
                      onClick={() => {
                        void handleCreateGitRepository();
                      }}
                    >
                      {diffPanelText.initRepo}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="min-w-0 space-y-3">
                  {diagnosisCockpitVisible && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground/75">{diffPanelText.diagnosisCockpit}</div>
                        <div className="flex items-center gap-1.5">
                          {lastDiagnosisActivityAtText && (
                            <span className="font-mono text-[10px] text-muted-foreground/75">
                              {lastDiagnosisActivityAtText}
                            </span>
                          )}
                          <button
                            type="button"
                            className="inline-flex items-center rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                            onClick={() => {
                              void handleCopyDiagnosisRunbook();
                            }}
                          >
                            <Copy size={10} className="mr-1" />
                            {diffPanelText.diagnosisRunbookCopy}
                          </button>
                        </div>
                      </div>
                      {lastDiagnosisActivityStatusLabel && (
                        <div className="mt-1 rounded border border-border/35 bg-background/70 px-2 py-1 text-[10px]">
                          <span className="text-muted-foreground/70">{diffPanelText.diagnosisLatestActivity}: </span>
                          <span className="font-mono text-foreground/85">{lastDiagnosisActivityStatusLabel}</span>
                          {lastDiagnosisActivity && (
                            <div
                              className={cn(
                                "mt-0.5 font-mono text-[9px] text-muted-foreground/70",
                                diffWordWrapEnabled ? "break-all" : "truncate",
                              )}
                              title={!diffWordWrapEnabled ? lastDiagnosisActivity.command : undefined}
                            >
                              {lastDiagnosisActivity.command}
                            </div>
                          )}
                          <div className="mt-1">
                            <button
                              type="button"
                              className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                              onClick={handleReplayLastDiagnosisCommand}
                            >
                              {diffPanelText.diagnosisReplay}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisRootSummaryTitle}
                        </div>
                        <div className="grid gap-0.5 text-[10px] text-muted-foreground/90">
                          <p>
                            <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                            {diagnosisRootSummary.rootCause}
                          </p>
                          <p>
                            <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                            {diagnosisRootSummary.minimalFix}
                          </p>
                          <p>
                            <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                            {diagnosisRootSummary.verify}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisRecommendationsTitle}
                        </div>
                        {diagnosisRecommendations.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisRecommendationsEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisRecommendations.map((item) => {
                              const queued = diagnosisQueuedCommandSet.has(item.command.trim());
                              const reversibilityLabel = translate(
                                locale,
                                `agent.permission.prompt.reversibility.${item.reversibility}`,
                              );
                              const blastRadiusLabel = translate(
                                locale,
                                `agent.permission.prompt.blastRadius.${item.blastRadius}`,
                              );
                              const severityLabel =
                                item.severity === "high"
                                  ? diffPanelText.diagnosisSeverityHigh
                                  : item.severity === "medium"
                                    ? diffPanelText.diagnosisSeverityMedium
                                    : diffPanelText.diagnosisSeverityLow;
                              const severityClass =
                                item.severity === "high"
                                  ? "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-300"
                                  : item.severity === "medium"
                                    ? "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
                              return (
                                <div
                                  key={item.id}
                                  className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                        {item.label}
                                      </span>
                                      <span className={cn("rounded border px-1 py-0.5", severityClass)}>
                                        {severityLabel}
                                      </span>
                                      <span
                                        className={cn(
                                          "rounded border px-1 py-0.5",
                                          getTracePermissionReversibilityBadgeClass(item.reversibility),
                                        )}
                                      >
                                        {reversibilityLabel}
                                      </span>
                                      <span
                                        className={cn(
                                          "rounded border px-1 py-0.5",
                                          getTracePermissionBlastRadiusBadgeClass(item.blastRadius),
                                        )}
                                      >
                                        {blastRadiusLabel}
                                      </span>
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                        {diffPanelText.diagnosisRiskMatrix}: {item.matrixScore}
                                      </span>
                                      {queued && (
                                        <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1 py-0.5 text-amber-700 dark:text-amber-300">
                                          {tracePanelText.commandStatusQueued}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        className={cn(
                                          "rounded border px-1 py-0.5 text-[9px] transition-colors",
                                          item.canRun
                                            ? "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground"
                                            : "cursor-not-allowed border-border/20 bg-muted/40 text-muted-foreground/45",
                                        )}
                                        disabled={!item.canRun}
                                        onClick={item.onPrepare}
                                      >
                                        {diffPanelText.diagnosisActionPrepare}
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          "rounded border px-1 py-0.5 text-[9px] transition-colors",
                                          item.canRun
                                            ? "border-primary/45 bg-primary/10 text-foreground"
                                            : "cursor-not-allowed border-border/20 bg-muted/40 text-muted-foreground/45",
                                        )}
                                        disabled={!item.canRun}
                                        onClick={item.onRun}
                                      >
                                        {diffPanelText.diagnosisActionRun}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-muted-foreground/75">{item.reason}</div>
                                  <div
                                    className={cn(
                                      "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                      diffWordWrapEnabled ? "break-all" : "truncate",
                                    )}
                                    title={!diffWordWrapEnabled ? item.command : undefined}
                                  >
                                    {item.command}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                          <div className="flex min-w-0 items-center gap-1">
                            <div className="text-[10px] text-muted-foreground/70">
                              {diffPanelText.diagnosisHistoryTitle}
                            </div>
                            <span className="rounded border border-border/35 bg-muted/35 px-1 py-0.5 font-mono text-[9px] text-muted-foreground/80">
                              {diagnosisHistoryFiltered.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                              latestFailedDiagnosisHistoryEntry
                                ? "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground"
                                : "cursor-not-allowed border-border/20 bg-muted/40 text-muted-foreground/45",
                            )}
                            disabled={!latestFailedDiagnosisHistoryEntry}
                            onClick={handleReplayFailedDiagnosisCommand}
                          >
                            {diffPanelText.diagnosisReplayFailed}
                          </button>
                        </div>
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          {diagnosisHistoryStatusFilterOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                                diagnosisHistoryStatusFilter === option.value
                                  ? "border-primary/45 bg-primary/10 text-foreground"
                                  : "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground",
                              )}
                              onClick={() => {
                                setDiagnosisHistoryStatusFilter(option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          {diagnosisHistorySortOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                                diagnosisHistorySortMode === option.value
                                  ? "border-primary/45 bg-primary/10 text-foreground"
                                  : "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground",
                              )}
                              onClick={() => {
                                setDiagnosisHistorySortMode(option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1">
                          {diagnosisHistoryKindFilterOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                                diagnosisHistoryKindFilter === option.value
                                  ? "border-primary/45 bg-primary/10 text-foreground"
                                  : "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground",
                              )}
                              onClick={() => {
                                setDiagnosisHistoryKindFilter(option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        {diagnosisHistoryRows.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisHistoryEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisHistoryRows.map((item, index) => (
                              <div
                                key={`${item.kind}:${item.status}:${item.command}:${item.at}:${index}`}
                                className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                      {item.kindLabel}
                                    </span>
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                      {item.statusLabel}
                                    </span>
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                      {item.atText}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                    onClick={() => {
                                      submitDiagnosisReplay(item);
                                    }}
                                  >
                                    {diffPanelText.diagnosisReplay}
                                  </button>
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                    diffWordWrapEnabled ? "break-all" : "truncate",
                                  )}
                                  title={!diffWordWrapEnabled ? item.command : undefined}
                                >
                                  {item.command}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisLifecycleTitle}
                        </div>
                        {diagnosisLifecycleRows.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisLifecycleEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisLifecycleRows.map((item) => {
                              const expanded = Boolean(expandedDiagnosisLifecycleKeys[item.key]);
                              return (
                                <div
                                  key={item.key}
                                  className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                        {item.kindLabel}
                                      </span>
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                        {item.finalStatusLabel}
                                      </span>
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                        {item.atText}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {item.isFailed && (
                                        <button
                                          type="button"
                                          className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                          onClick={() => {
                                            handlePrepareDiagnosisFixProposal(item);
                                          }}
                                        >
                                          {diffPanelText.diagnosisFixProposal}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                        onClick={() => {
                                          toggleDiagnosisLifecycleExpanded(item.key);
                                        }}
                                      >
                                        {expanded
                                          ? diffPanelText.diagnosisLifecycleCollapse
                                          : diffPanelText.diagnosisLifecycleExpand}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                        onClick={() => {
                                          submitDiagnosisReplay(item);
                                        }}
                                      >
                                        {diffPanelText.diagnosisReplay}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-muted-foreground/75">{item.trailText}</div>
                                  <div
                                    className={cn(
                                      "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                      diffWordWrapEnabled ? "break-all" : "truncate",
                                    )}
                                    title={!diffWordWrapEnabled ? item.command : undefined}
                                  >
                                    {item.command}
                                  </div>
                                  {expanded && (
                                    <div className="mt-1 rounded border border-border/30 bg-background/60 px-1.5 py-1">
                                      <div className="mb-1 text-[9px] text-muted-foreground/70">
                                        {diffPanelText.diagnosisLifecycleEvents} ({item.eventRows.length})
                                      </div>
                                      <div className="space-y-0.5">
                                        {item.eventRows.map((event, eventIndex) => (
                                          <div
                                            key={`${item.key}:${event.status}:${event.at}:${eventIndex}`}
                                            className="flex flex-wrap items-center gap-1 text-[9px] text-muted-foreground/80"
                                          >
                                            <span className="rounded border border-border/35 bg-muted/35 px-1 py-0.5">
                                              {event.statusLabel}
                                            </span>
                                            <span className="rounded border border-border/35 bg-muted/35 px-1 py-0.5">
                                              {event.atText}
                                            </span>
                                            {event.commandId && (
                                              <span
                                                className="rounded border border-border/35 bg-muted/35 px-1 py-0.5 font-mono"
                                                title={event.commandId}
                                              >
                                                #{event.commandId.slice(0, 12)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisQueueTrack}
                        </div>
                        {diagnosisQueuedTrackRows.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisQueueTrackEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisQueuedTrackRows.map((item) => (
                              <div
                                key={item.id}
                                className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                              >
                                <div className="flex flex-wrap items-center gap-1 text-[9px]">
                                  <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                    {item.kindLabel}
                                  </span>
                                  <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                    {item.priorityLabel}
                                  </span>
                                  <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                    {translate(locale, "agent.queue.waiting", { seconds: item.waitSeconds })}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                    diffWordWrapEnabled ? "break-all" : "truncate",
                                  )}
                                  title={!diffWordWrapEnabled ? item.query : undefined}
                                >
                                  {item.query}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisRunbookActionsTitle}
                        </div>
                        <div className="space-y-1">
                          {diagnosisRunbookActions.map((item) => {
                            const queued = diagnosisQueuedCommandSet.has(item.command.trim());
                            const actionState = diagnosisRunbookActionStateById[item.id];
                            const actionStatusLabel = actionState
                              ? getTraceQuickCommandStatusLabel(actionState.status)
                              : null;
                            const actionAtText = actionState
                              ? new Date(actionState.at).toLocaleTimeString(locale, { hour12: false })
                              : null;
                            return (
                              <div
                                key={item.id}
                                className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                      {item.label}
                                    </span>
                                    {queued && (
                                      <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1 py-0.5 text-amber-700 dark:text-amber-300">
                                        {tracePanelText.commandStatusQueued}
                                      </span>
                                    )}
                                    {actionStatusLabel && (
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                        {actionStatusLabel}
                                      </span>
                                    )}
                                    {actionAtText && (
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/70">
                                        {actionAtText}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      className={cn(
                                        "rounded border px-1 py-0.5 text-[9px] transition-colors",
                                        item.canRun
                                          ? "border-border/35 bg-background/70 text-muted-foreground/85 hover:text-foreground"
                                          : "cursor-not-allowed border-border/20 bg-muted/40 text-muted-foreground/45",
                                      )}
                                      disabled={!item.canRun}
                                      onClick={item.onPrepare}
                                    >
                                      {diffPanelText.diagnosisActionPrepare}
                                    </button>
                                    <button
                                      type="button"
                                      className={cn(
                                        "rounded border px-1 py-0.5 text-[9px] transition-colors",
                                        item.canRun
                                          ? "border-primary/45 bg-primary/10 text-foreground"
                                          : "cursor-not-allowed border-border/20 bg-muted/40 text-muted-foreground/45",
                                      )}
                                      disabled={!item.canRun}
                                      onClick={item.onRun}
                                    >
                                      {diffPanelText.diagnosisActionRun}
                                    </button>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                    diffWordWrapEnabled ? "break-all" : "truncate",
                                  )}
                                  title={!diffWordWrapEnabled ? item.command : undefined}
                                >
                                  {item.command}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisFailureClustersTitle}
                        </div>
                        {diagnosisFailureClusters.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisFailureClustersEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisFailureClusters.map((cluster) => (
                              <div
                                key={cluster.key}
                                className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                              >
                                {(() => {
                                  const trendLabel =
                                    cluster.trend === "improving"
                                      ? diffPanelText.diagnosisTrendImproving
                                      : cluster.trend === "degrading"
                                        ? diffPanelText.diagnosisTrendDegrading
                                        : cluster.trend === "flaky"
                                          ? diffPanelText.diagnosisTrendFlaky
                                          : diffPanelText.diagnosisTrendStable;
                                  const trendClass =
                                    cluster.trend === "improving"
                                      ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : cluster.trend === "degrading"
                                        ? "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-300"
                                        : cluster.trend === "flaky"
                                          ? "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                          : "border-border/35 bg-muted/35 text-muted-foreground/80";
                                  return (
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                      {cluster.kindLabel}
                                    </span>
                                    {cluster.tool && (
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                        {cluster.tool}
                                      </span>
                                    )}
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                      {cluster.statusLabel}
                                    </span>
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                      {cluster.lastAtText}
                                    </span>
                                    <span className="rounded border border-red-500/45 bg-red-500/10 px-1 py-0.5 text-red-700 dark:text-red-300">
                                      {diffPanelText.diagnosisFailureClusterCount.replace(
                                        "{count}",
                                        String(cluster.failureCount),
                                      )}
                                    </span>
                                    <span className={cn("rounded border px-1 py-0.5", trendClass)}>
                                      {trendLabel}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                    onClick={() => {
                                      submitDiagnosisReplay({
                                        kind: cluster.kind,
                                        command: cluster.command,
                                      });
                                    }}
                                  >
                                    {diffPanelText.diagnosisReplay}
                                  </button>
                                </div>
                                  );
                                })()}
                                <div className="mt-0.5 text-[9px] text-muted-foreground/75">
                                  {diffPanelText.diagnosisClusterFirstSeen}: {cluster.firstAtText} |{" "}
                                  {diffPanelText.diagnosisClusterDuration}: {cluster.durationMinutes}m |{" "}
                                  {diffPanelText.diagnosisClusterRecovery}: {cluster.recoveryRatePct}% |{" "}
                                  {diffPanelText.diagnosisClusterTrend}:{" "}
                                  {cluster.trend === "improving"
                                    ? diffPanelText.diagnosisTrendImproving
                                    : cluster.trend === "degrading"
                                      ? diffPanelText.diagnosisTrendDegrading
                                      : cluster.trend === "flaky"
                                        ? diffPanelText.diagnosisTrendFlaky
                                        : diffPanelText.diagnosisTrendStable}
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                    diffWordWrapEnabled ? "break-all" : "truncate",
                                  )}
                                  title={!diffWordWrapEnabled ? cluster.command : undefined}
                                >
                                  {cluster.command}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisReplayTemplatesTitle}
                        </div>
                        {diagnosisReplayTemplates.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisReplayTemplatesEmpty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {diagnosisReplayTemplates.map((template) => {
                              const queued = diagnosisQueuedCommandSet.has(template.command);
                              return (
                                <div
                                  key={template.key}
                                  className="rounded border border-border/30 bg-background/70 px-1.5 py-1"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[9px]">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                        {template.kindLabel}
                                      </span>
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/80">
                                        {template.statusLabel}
                                      </span>
                                      <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                        {template.atText}
                                      </span>
                                      {queued && (
                                        <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1 py-0.5 text-amber-700 dark:text-amber-300">
                                          {tracePanelText.commandStatusQueued}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        className="rounded border border-border/35 bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                        onClick={() => {
                                          const contextualCommand = buildReplayTemplateCommandWithContext({
                                            kind: template.kind,
                                            command: template.command,
                                          });
                                          focusComposerWithCommand(contextualCommand);
                                          setTraceQuickCommandState({
                                            kind: template.kind,
                                            status: "prepared",
                                            command: template.command,
                                            at: Date.now(),
                                          });
                                          toast.success(diffPanelText.diagnosisReplayTemplateContextReady);
                                        }}
                                      >
                                        {diffPanelText.diagnosisActionPrepare}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded border border-primary/45 bg-primary/10 px-1 py-0.5 text-[9px] text-foreground transition-colors"
                                        onClick={() => {
                                          submitDiagnosisReplay({
                                            kind: template.kind,
                                            command: template.command,
                                          });
                                        }}
                                      >
                                        {diffPanelText.diagnosisActionRun}
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className={cn(
                                      "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                      diffWordWrapEnabled ? "break-all" : "truncate",
                                    )}
                                    title={!diffWordWrapEnabled ? template.command : undefined}
                                  >
                                    {template.command}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 rounded border border-border/30 bg-background/60 px-2 py-1.5">
                        <div className="mb-1 text-[10px] text-muted-foreground/70">
                          {diffPanelText.diagnosisReplayCompareTitle}
                        </div>
                        {!diagnosisReplayCompareReport ? (
                          <div className="text-[10px] text-muted-foreground/70">
                            {diffPanelText.diagnosisReplayCompareEmpty}
                          </div>
                        ) : (
                          <div className="rounded border border-border/30 bg-background/70 px-1.5 py-1">
                            {(() => {
                              const outcomeLabel =
                                diagnosisReplayCompareReport.outcome === "improved"
                                  ? diffPanelText.diagnosisReplayCompareOutcomeImproved
                                  : diagnosisReplayCompareReport.outcome === "regressed"
                                    ? diffPanelText.diagnosisReplayCompareOutcomeRegressed
                                    : diagnosisReplayCompareReport.outcome === "flaky"
                                      ? diffPanelText.diagnosisReplayCompareOutcomeFlaky
                                      : diffPanelText.diagnosisReplayCompareOutcomeUnchanged;
                              const outcomeClass =
                                diagnosisReplayCompareReport.outcome === "improved"
                                  ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : diagnosisReplayCompareReport.outcome === "regressed"
                                    ? "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-300"
                                    : diagnosisReplayCompareReport.outcome === "flaky"
                                      ? "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                      : "border-border/35 bg-muted/35 text-muted-foreground/80";
                              return (
                                <>
                                  <div className="flex flex-wrap items-center gap-1 text-[9px]">
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/85">
                                      {diagnosisReplayCompareReport.kindLabel}
                                    </span>
                                    <span className={cn("rounded border px-1 py-0.5", outcomeClass)}>
                                      {diffPanelText.diagnosisReplayCompareOutcome}: {outcomeLabel}
                                    </span>
                                    <span className="rounded border border-border/35 bg-muted/40 px-1 py-0.5 text-muted-foreground/75">
                                      {diffPanelText.diagnosisReplayCompareDelta}: {diagnosisReplayCompareReport.deltaSeconds}s
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-muted-foreground/75">
                                    {diffPanelText.diagnosisReplayCompareBefore}:{" "}
                                    {diagnosisReplayCompareReport.beforeStatusLabel} @
                                    {diagnosisReplayCompareReport.beforeAtText} |{" "}
                                    {diffPanelText.diagnosisReplayCompareAfter}:{" "}
                                    {diagnosisReplayCompareReport.afterStatusLabel} @
                                    {diagnosisReplayCompareReport.afterAtText}
                                  </div>
                                  <div
                                    className={cn(
                                      "mt-0.5 font-mono text-[9px] text-muted-foreground/75",
                                      diffWordWrapEnabled ? "break-all" : "truncate",
                                    )}
                                    title={!diffWordWrapEnabled ? diagnosisReplayCompareReport.command : undefined}
                                  >
                                    {diagnosisReplayCompareReport.command}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 space-y-2">
                        {cockpitQueueDiagnosisVisible && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px]">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                {diffPanelText.diagnosisQueueTitle}
                              </span>
                              <span className="font-mono text-[9px] text-amber-700/80 dark:text-amber-300/90">
                                {tracePanelText.diagnosisQueueSummary
                                  .replace("{pressure}", cockpitQueuePressureLabel)
                                  .replace("{depth}", cockpitQueueDepthLabel)}
                              </span>
                            </div>
                            <div className="mt-1 grid gap-0.5 text-muted-foreground/90">
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                                {tracePanelText.diagnosisQueueRootCause}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                                {tracePanelText.diagnosisQueueFix}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                                {tracePanelText.diagnosisQueueVerify}
                              </p>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handlePrepareTraceQueueDiagnosticsCommand}
                              >
                                {tracePanelText.hotspotPrepareQueueDiagnostics}
                              </button>
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handleRunTraceQueueDiagnosticsCommand}
                              >
                                {tracePanelText.hotspotRunQueueDiagnostics}
                              </button>
                              {traceQueueDiagnosticsQueued && (
                                <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                                  {tracePanelText.commandStatusQueued}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {traceHotspotDiagnosisVisible && topTraceHotspot && (
                          <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[10px]">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-medium text-red-700 dark:text-red-300">
                                {tracePanelText.diagnosisHotspotTitle.replace("{tool}", topTraceHotspot.tool)}
                              </span>
                              <span className="font-mono text-[9px] text-red-700/80 dark:text-red-300/90">
                                {tracePanelText.diagnosisHotspotSummary
                                  .replace("{total}", String(topTraceHotspot.total))
                                  .replace("{errors}", String(topTraceHotspot.errors))
                                  .replace("{rejected}", String(topTraceHotspot.rejected))
                                  .replace("{denied}", String(topTraceHotspot.denied))}
                              </span>
                            </div>
                            <div className="mt-1 grid gap-0.5 text-muted-foreground/90">
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                                {tracePanelText.diagnosisHotspotRootCause}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                                {tracePanelText.diagnosisHotspotFix}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                                {tracePanelText.diagnosisHotspotVerify}
                              </p>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handlePrepareTraceInvestigateCommand}
                              >
                                {tracePanelText.hotspotPrepareCommand}
                              </button>
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handleInvestigateHottestTraceTool}
                              >
                                {tracePanelText.hotspotInvestigate}
                              </button>
                              {traceInvestigateQueued && (
                                <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                                  {tracePanelText.commandStatusQueued}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {fallbackDiagnosisVisible && (
                          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1.5 text-[10px]">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-medium text-blue-700 dark:text-blue-300">
                                {diffPanelText.diagnosisFallbackTitle}
                              </span>
                              <span className="font-mono text-[9px] text-blue-700/80 dark:text-blue-300/90">
                                {diffPanelText.diagnosisFallbackSummary
                                  .replace("{suppressed}", String(fallbackSuppressedCount))
                                  .replace("{used}", String(fallbackUsedCount))
                                  .replace("{ratio}", String(fallbackSuppressionRatioPct))}
                              </span>
                            </div>
                            <div className="mt-1 grid gap-0.5 text-muted-foreground/90">
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisRootCause}</span>{" "}
                                {translate(locale, "agent.command.doctor.fallbackSuppressed", {
                                  count: fallbackSuppressedCount,
                                  reason: fallbackSuppressedReasonLabel,
                                  strategy: fallbackRetryStrategyLabel,
                                })}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisMinimalFix}</span>{" "}
                                {translate(locale, "agent.command.doctor.fallbackInvestigateFixPolicy")}
                              </p>
                              <p>
                                <span className="text-[9px] uppercase tracking-wide">{tracePanelText.diagnosisVerify}</span>{" "}
                                {translate(locale, "agent.command.doctor.fallbackInvestigateVerifyOutcome")}
                              </p>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handlePrepareFallbackInvestigateCommand}
                              >
                                {diffPanelText.diagnosisFallbackPrepare}
                              </button>
                              <button
                                type="button"
                                className="rounded border border-border/35 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground/85 transition-colors hover:text-foreground"
                                onClick={handleRunFallbackInvestigateCommand}
                              >
                                {diffPanelText.diagnosisFallbackRun}
                              </button>
                              {fallbackInvestigateQueued && (
                                <span className="rounded border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                                  {tracePanelText.commandStatusQueued}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {!cockpitQueueDiagnosisVisible &&
                        !traceHotspotDiagnosisVisible &&
                        !fallbackDiagnosisVisible && (
                          <div className="mt-2 text-[11px] text-muted-foreground/75">
                            {diffPanelText.diagnosisNoSignals}
                          </div>
                        )}
                    </div>
                  )}
                  <div className="rounded-lg border border-border/40 bg-background/70 p-3">
                    <div className="text-[11px] text-muted-foreground/70">{diffPanelText.branch}</div>
                    <div
                      className={cn(
                        "mt-1 min-w-0 font-mono text-[12px]",
                        diffWordWrapEnabled ? "break-all" : "truncate"
                      )}
                      title={!diffWordWrapEnabled ? diffBranch : undefined}
                    >
                      {diffBranch}
                      <span
                        className={cn(
                          "ml-2 text-muted-foreground/70",
                          diffWordWrapEnabled ? "break-all" : "truncate"
                        )}
                        title={!diffWordWrapEnabled ? diffBaseBranch : undefined}
                      >
                        ({diffBaseBranch})
                      </span>
                    </div>
                    {diffUpdatedText && (
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        {diffPanelText.updatedAt}: {diffUpdatedText}
                      </div>
                    )}
                  </div>

                  <div className={cn("grid gap-3", useTwoColumnDiffLayout ? "grid-cols-2" : "grid-cols-1")}>
                    <div className="rounded-lg border border-border/40 bg-background/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground/70">
                          {diffPanelText.changed} ({visibleDiffChangedFiles.length})
                        </div>
                        {!diffLoadFullFileEnabled && (
                          <div className="text-[10px] text-muted-foreground/60">{diffPanelText.noFullFile}</div>
                        )}
                      </div>
                      {!diffTextDiffEnabled ? (
                        <div className="text-[12px] text-muted-foreground/80">{diffPanelText.textDiffDisabledHint}</div>
                      ) : diffCollapsedAll ? (
                        <div className="text-[12px] text-muted-foreground/80">{diffPanelText.collapsedHint}</div>
                      ) : visibleDiffChangedFiles.length === 0 ? (
                        <div className="text-[12px] text-muted-foreground/80">
                          {diffScope === "lastRound" ? diffPanelText.noLastRoundChanges : diffPanelText.clean}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {visibleDiffChangedFiles.map((entry, index) => (
                            <div
                              key={`${entry.code}:${entry.path}:${index}`}
                              className="flex min-w-0 items-start gap-2 rounded-md border border-border/30 px-2 py-1.5"
                            >
                              <span className="w-6 shrink-0 font-mono text-[11px] text-primary/80">
                                {entry.code}
                              </span>
                              <span
                                className={cn(
                                  "min-w-0 font-mono text-[11px] text-foreground/85",
                                  diffWordWrapEnabled ? "break-all" : "truncate"
                                )}
                                title={!diffWordWrapEnabled ? entry.path : undefined}
                              >
                                {entry.path}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-border/40 bg-background/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground/70">{diffPanelText.commits}</div>
                        {diffRichTextPreviewEnabled && (
                          <div className="text-[10px] text-muted-foreground/60">{diffPanelText.richPreview}</div>
                        )}
                      </div>
                      {diffCollapsedAll ? (
                        <div className="text-[12px] text-muted-foreground/80">{diffPanelText.collapsedHint}</div>
                      ) : (
                        <div className="space-y-1.5">
                          {(gitSnapshot.recent_commits.length > 0
                            ? gitSnapshot.recent_commits
                            : [diffPanelText.noCommits]
                          ).map((line, index) => {
                            const trimmed = line.trim();
                            const [hash, ...restParts] = trimmed.split(" ");
                            const message = restParts.join(" ").trim();
                            if (diffRichTextPreviewEnabled && hash && message) {
                              return (
                                <div
                                  key={`${line}:${index}`}
                                  className="rounded-md border border-border/30 bg-background/60 px-2 py-1.5"
                                >
                                  <div className="font-mono text-[10px] text-primary/80">{hash}</div>
                                  <div
                                    className={cn(
                                      "text-[11px] text-foreground/85",
                                      diffWordWrapEnabled ? "break-all" : "truncate"
                                    )}
                                    title={!diffWordWrapEnabled ? message : undefined}
                                  >
                                    {message}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={`${line}:${index}`}
                                className={cn(
                                  "font-mono text-[11px] text-foreground/80",
                                  diffWordWrapEnabled ? "break-all" : "truncate"
                                )}
                                title={!diffWordWrapEnabled ? line : undefined}
                              >
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {isConsolePanelOpen && (
        <div className="shrink-0 border-t border-border/40 bg-background/95">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground/85">
              <Terminal size={13} className="text-primary/70" />
              <span>{consoleText.title}</span>
              <span className="rounded border border-border/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/80">
                {consoleText.shell}: {terminalShellType}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground"
              onClick={handleClearTerminalRuns}
            >
              {consoleText.clear}
            </Button>
          </div>

          <div className="h-[220px] overflow-y-auto border-t border-border/30 px-4 py-2 space-y-2">
            {terminalRuns.length === 0 ? (
              <div className="text-[11px] text-muted-foreground/70">{consoleText.empty}</div>
            ) : (
              terminalRuns.map((run) => (
                <div key={run.id} className="border border-border/40 bg-muted/10">
                  <button
                    className="flex w-full items-center justify-between px-2.5 py-2 text-left"
                    onClick={() => handleToggleTerminalRunExpanded(run.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-mono",
                          run.status === "running"
                            ? "text-amber-600"
                            : run.status === "error"
                              ? "text-destructive"
                              : "text-emerald-600",
                        )}
                      >
                        {consoleText.executed}
                      </span>
                      <span className="font-mono text-[11px] text-foreground/85 break-all">
                        {run.command}
                      </span>
                      {run.liveLogs.length > 0 && (
                        <span className="rounded border border-border/40 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/70">
                          {run.liveLogs.length} {consoleText.lines}
                        </span>
                      )}
                    </div>
                    <ChevronRight
                      size={12}
                      className={cn(
                        "text-muted-foreground/70 transition-transform",
                        run.expanded && "rotate-90",
                      )}
                    />
                  </button>
                  {run.expanded && (
                    <div className="border-t border-border/30 px-2.5 py-2 space-y-2">
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground/70 uppercase">
                          {consoleText.command}
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] font-mono text-foreground/85">
                          {run.command}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground/70 uppercase">
                          {consoleText.process}
                        </div>
                        <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all border border-border/30 bg-background/70 p-2 text-[11px] font-mono text-foreground/85">
                          {run.liveLogs.length > 0
                            ? run.liveLogs.join("\n")
                            : run.status === "running"
                              ? consoleText.running
                              : consoleText.emptyValue}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground/70 uppercase">
                          {consoleText.output}
                        </div>
                        <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all border border-border/30 bg-background/70 p-2 text-[11px] font-mono text-foreground/85">
                          {run.stdout || consoleText.emptyValue}
                        </pre>
                      </div>
                      {(run.stderr || run.status === "error") && (
                        <div>
                          <div className="text-[10px] font-mono text-destructive/80 uppercase">
                            {consoleText.error}
                          </div>
                          <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all border border-destructive/30 bg-destructive/10 p-2 text-[11px] font-mono text-destructive/90">
                            {run.stderr || consoleText.noneValue}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <input
                value={terminalInput}
                onChange={(event) => setTerminalInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleRunTerminalCommand();
                  }
                }}
                placeholder={consoleText.placeholder}
                className="h-8 flex-1 border border-border/50 bg-background/70 px-2 text-[12px] font-mono text-foreground/90 outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
              />
              <Button
                size="sm"
                className="h-8 px-3 text-[11px]"
                onClick={() => {
                  void handleRunTerminalCommand();
                }}
                disabled={!terminalInput.trim()}
              >
                {consoleText.run}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isRewindPreviewOpen} onOpenChange={setIsRewindPreviewOpen}>
        <DialogContent className="max-w-2xl rounded-lg border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base">{translate(locale, "agent.rewind.dialogTitle")}</DialogTitle>
            <DialogDescription className="text-xs">
              {translate(locale, "agent.rewind.dialogDesc")}
            </DialogDescription>
          </DialogHeader>

          {rewindPreview ? (
            <div className="space-y-3 text-[12px]">
              <div className="rounded border border-border/40 bg-muted/20 p-2">
                <div className="text-muted-foreground/80">
                  Turn: <span className="font-mono text-foreground/90">{rewindPreview.turnId}</span>
                </div>
                <div className="mt-1 text-muted-foreground/85">
                  {translate(locale, "agent.rewind.summaryRestore")}: {rewindPreview.restoreCount} |{" "}
                  {translate(locale, "agent.rewind.summaryRemove")}: {rewindPreview.removeCount} |{" "}
                  {translate(locale, "agent.rewind.summaryFiles")}: {rewindPreview.affectedPaths.length}
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto rounded border border-border/40 bg-background/70 p-2">
                {rewindPreview.affectedPaths.length === 0 ? (
                  <div className="text-muted-foreground/70">{translate(locale, "agent.rewind.previewEmpty")}</div>
                ) : (
                  <div className="space-y-1">
                    {rewindPreview.affectedPaths.map((path, index) => (
                      <div key={`${path}:${index}`} className="font-mono text-[11px] text-foreground/85 break-all">
                        {path}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {rewindPreview.warnings.length > 0 && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                  <div className="font-medium">
                    {translate(locale, "agent.command.rewind.previewWarnings", { count: rewindPreview.warnings.length })}
                  </div>
                  <div className="mt-1 space-y-1">
                    {rewindPreview.warnings.slice(0, 8).map((warn, index) => (
                      <div key={`${warn}:${index}`} className="break-all">
                        {warn}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded border border-border/40 bg-muted/20 p-3 text-[12px] text-muted-foreground/80">
              {translate(locale, "agent.rewind.previewing")}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setIsRewindPreviewOpen(false)}
              disabled={rewindApplying}
            >
              {translate(locale, "common.cancel")}
            </Button>
            <Button
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => {
                void handleApplyRewind();
              }}
              disabled={!rewindPreview || rewindApplying}
            >
              {rewindApplying ? translate(locale, "agent.rewind.applying") : diffPanelText.rewindApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
