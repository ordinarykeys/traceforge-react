import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Tool } from "./types";
import { ALL_TOOLS } from "./tools";
import { buildSystemPromptArtifact } from "./systemPrompt";
import type { PromptLocale } from "./cyberRiskInstruction";
import { runTools, type ToolCallLike } from "./services/tools/toolOrchestration";
import {
  formatToolExecutionError,
  formatToolValidationError,
  truncateToolOutput,
} from "./utils/toolErrors";
import { productionDeps, type QueryDeps } from "./query/deps";
import type { Continue, Terminal } from "./query/transitions";
import { buildQueryConfig } from "./query/config";
import type {
  PermissionRiskClass,
  QueryRetryStrategy,
  QueryStreamEvent,
  QueryStreamSnapshot,
  ToolFailureClass,
} from "./query/events";
import {
  checkTokenBudget,
  createBudgetTracker,
  estimateTokensFromText,
  type TokenBudgetDecision,
  type TokenBudgetConfig,
} from "./query/tokenBudget";
import { executeStopHooks, type StopHook } from "./query/stopHooks";
import { createDefaultStopHooks } from "./query/defaultStopHooks";
import {
  getPriorScopedApprovalsForTool,
  noteScopedAuthorizationApproval,
  updateToolFailureStreak,
} from "./query/guardrails";
import {
  decideToolPermission,
  getPermissionRiskProfile,
  type PermissionDecision,
  type PermissionRule,
  type PermissionRuleDraft,
  type PermissionSuggestion,
} from "./permissions/toolPermissions";
import { translate, type AppLocale } from "@/lib/i18n";
import {
  createDefaultCommandRegistry,
  parseSlashCommand,
  type CommandRegistry,
  type SlashCommandDescriptor,
} from "./commands";
import { AgentTaskManager } from "./tasks/TaskManager";
import type { AgentTask, TaskOutputChunk } from "./tasks/types";

function toPromptLocale(locale: AppLocale): PromptLocale {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

// ============================================================
// Types kept compatible with existing UI (AgentWorkstationView)
// ============================================================

export type AgentStepStatus = "pending" | "running" | "completed" | "rejected" | "error";

export type PermissionPromptDecision = "allow_once" | "allow_session" | "deny";

export interface PermissionPromptRequest {
  tool: string;
  reason: string;
  suggestions: PermissionSuggestion[];
  permissionMode: ToolPermissionMode;
  riskClass?: PermissionRiskClass;
  priorApprovals?: number;
  workspaceRoots?: string[];
}

export interface AgentToolRenderData {
  toolName: string;
  argsSummary: string;
  callArguments?: string;
  outcome: "none" | "result" | "rejected" | "error";
  outcomePreview?: string;
}

export interface AgentStepData {
  id: string;
  title: string;
  status: AgentStepStatus;
  logs: string[];
  toolRender?: AgentToolRenderData;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  steps?: AgentStepData[];
  status?: "pending" | "running" | "completed" | "rejected" | "error";
  report?: string;
}

// ============================================================
// Internal types for LLM API communication
// ============================================================

interface LLMToolCall extends ToolCallLike {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

interface RuntimeGitSnapshot {
  success: boolean;
  working_dir: string;
  is_git_repo: boolean;
  branch?: string | null;
  default_branch?: string | null;
  status_short: string[];
  recent_commits: string[];
  error?: string | null;
}

interface CompletionUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
}

export interface UsageByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
}

export interface UsageSnapshot {
  totals: UsageTotals;
  byModel: UsageByModel[];
}

export interface ToolCallBudgetPolicy {
  readOnlyBase: number;
  mutatingBase: number;
  shellBase: number;
  failureBackoffStep: number;
  minimum: number;
}

export type ToolBudgetGuardReason = "per_tool_limit" | "failure_backoff";

export const DEFAULT_TOOL_CALL_BUDGET_POLICY: ToolCallBudgetPolicy = {
  readOnlyBase: 28,
  mutatingBase: 18,
  shellBase: 12,
  failureBackoffStep: 2,
  minimum: 4,
};

// ============================================================
// Constants
// ============================================================

const MAX_TOOL_LOOP_ITERATIONS = 80;
const MAX_CONSECUTIVE_TOOL_FAILURE_BATCHES = 3;
const MAX_TOOL_CALLS_PER_QUERY = 120;
const MAX_QUEUED_QUERIES = 8;
const QUEUED_QUERY_MAX_AGE_MS = 10 * 60_000;
const DEFAULT_MAX_OUTPUT_CHARS = 30000;
const GIT_SNAPSHOT_CACHE_TTL_MS = 15_000;
type AbortSource = "manual_stop" | "engine_dispose" | "engine_clear" | "superseded_query" | "unknown";
const MAX_HISTORY_MESSAGES = 40;
const UI_FLUSH_INTERVAL_MS = 32;
const STEP_LOG_FLUSH_INTERVAL_MS = 80;
const MAX_STEP_LOG_LINES = 600;
const STEP_LOG_TRUNCATED_MARKER = "[system] older logs truncated to keep the session responsive.";
const STEP_LOG_HISTORY_HEAD_LINES = 60;
const STEP_LOG_HISTORY_TAIL_LINES = 120;
const STEP_LOG_HISTORY_MAX_LINES =
  1 + STEP_LOG_HISTORY_HEAD_LINES + STEP_LOG_HISTORY_TAIL_LINES + 1;
const MESSAGE_UPDATE_SIGNATURE_TEXT_SAMPLE_CHARS = 24;
const MAX_STOP_HOOK_CONTINUATIONS = 2;
const MAX_CONTEXT_MESSAGE_CHARS = 6_000;
const CONTEXT_HEAD_CHARS = 3_500;
const CONTEXT_TAIL_CHARS = 2_000;
const MAX_HISTORY_CONTEXT_TOKENS = 12_000;
const MAX_CONTEXT_TOOL_RESULT_CHARS = 4_000;
const CONTEXT_TOOL_RESULT_HEAD_CHARS = 2_500;
const CONTEXT_TOOL_RESULT_TAIL_CHARS = 1_000;
const REPEATED_TOOL_SIGNATURE_FAILURE_THRESHOLD = 3;
const MAX_TRACKED_COMMAND_LIFECYCLE = 160;
const QUEUE_PRIORITY_AGING_INTERVAL_MS = 90_000;
const MAX_CONSECUTIVE_NOW_DEQUEUES = 4;
const QUEUE_MAINTENANCE_INTERVAL_MS = 30_000;
const TOOL_FAILURE_FAST_GUARD_STREAK = 2;
const TOOL_FAILURE_FAST_GUARD_WINDOW_MS = 2 * 60_000;
const TOOL_FAILURE_DIAGNOSIS_MIN_BATCH_ERRORS = 2;
const TOOL_FAILURE_DIAGNOSIS_MIN_RATIO = 0.5;
const TOOL_FAILURE_DIAGNOSIS_MAX_CONTINUATIONS = 2;
const QUEUE_PRIORITY_RANK: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

function normalizeToolCallBudgetPolicy(
  policy?: Partial<ToolCallBudgetPolicy> | null,
): ToolCallBudgetPolicy {
  const base = DEFAULT_TOOL_CALL_BUDGET_POLICY;
  const readOnlyBase = clampInt(policy?.readOnlyBase, base.readOnlyBase, 1, 500);
  const mutatingBase = clampInt(policy?.mutatingBase, base.mutatingBase, 1, 500);
  const shellBase = clampInt(policy?.shellBase, base.shellBase, 1, 500);
  const failureBackoffStep = clampInt(policy?.failureBackoffStep, base.failureBackoffStep, 0, 200);
  const candidateMin = clampInt(policy?.minimum, base.minimum, 1, 500);
  const minBase = Math.min(readOnlyBase, mutatingBase, shellBase);
  const minimum = Math.min(candidateMin, minBase);
  return {
    readOnlyBase,
    mutatingBase,
    shellBase,
    failureBackoffStep,
    minimum,
  };
}

function areToolCallBudgetPoliciesEqual(left: ToolCallBudgetPolicy, right: ToolCallBudgetPolicy): boolean {
  return (
    left.readOnlyBase === right.readOnlyBase &&
    left.mutatingBase === right.mutatingBase &&
    left.shellBase === right.shellBase &&
    left.failureBackoffStep === right.failureBackoffStep &&
    left.minimum === right.minimum
  );
}

function computeEffectiveQueuePriorityRank(item: QueuedQueryItem, now = Date.now()): number {
  const baseRank = QUEUE_PRIORITY_RANK[item.priority];
  const waitedMs = Math.max(0, now - item.queuedAt);
  const promotions = Math.floor(waitedMs / QUEUE_PRIORITY_AGING_INTERVAL_MS);
  return Math.max(0, baseRank - promotions);
}

function compareQueueItemsByDispatchOrder(
  left: QueuedQueryItem,
  right: QueuedQueryItem,
  now = Date.now(),
): number {
  const leftRank = computeEffectiveQueuePriorityRank(left, now);
  const rightRank = computeEffectiveQueuePriorityRank(right, now);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.queuedAt !== right.queuedAt) {
    return left.queuedAt - right.queuedAt;
  }
  const leftBaseRank = QUEUE_PRIORITY_RANK[left.priority];
  const rightBaseRank = QUEUE_PRIORITY_RANK[right.priority];
  if (leftBaseRank !== rightBaseRank) {
    return leftBaseRank - rightBaseRank;
  }
  return left.id.localeCompare(right.id);
}

function normalizeQueuedQueryForFingerprint(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export type ToolPermissionMode = "default" | "full_access";
export type QueuePriority = "now" | "next" | "later";
type QueryExecutionLane = "foreground" | "background";

interface ToolFailureState {
  tool: string;
  failureClass: ToolFailureClass;
  streak: number;
  lastAt: number;
  sample: string;
}

interface RetryProfile {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  fallbackEnabled: boolean;
  strategy: QueryRetryStrategy;
}

function computeRetryProfile(options: {
  lane: QueryExecutionLane;
  queueDepth: number;
  fallbackEligible: boolean;
}): RetryProfile {
  const { lane, queueDepth, fallbackEligible } = options;
  if (lane === "background") {
    if (queueDepth >= 2) {
      return {
        maxRetries: 0,
        baseDelayMs: 350,
        maxDelayMs: 1200,
        fallbackEnabled: false,
        strategy: "background_load_shed",
      };
    }
    return {
      maxRetries: 1,
      baseDelayMs: queueDepth > 0 ? 500 : 650,
      maxDelayMs: queueDepth > 0 ? 1800 : 2500,
      fallbackEnabled: false,
      strategy: "background_conservative",
    };
  }

  if (queueDepth >= 5) {
    return {
      maxRetries: 1,
      baseDelayMs: 700,
      maxDelayMs: 3000,
      fallbackEnabled: false,
      strategy: "queue_pressure",
    };
  }
  if (queueDepth >= 2) {
    return {
      maxRetries: 2,
      baseDelayMs: 850,
      maxDelayMs: 5000,
      fallbackEnabled: fallbackEligible,
      strategy: "queue_pressure",
    };
  }
  return {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    fallbackEnabled: fallbackEligible,
    strategy: "balanced",
  };
}

function retryProfileChanged(previous: RetryProfile, next: RetryProfile): boolean {
  return (
    previous.maxRetries !== next.maxRetries ||
    previous.baseDelayMs !== next.baseDelayMs ||
    previous.maxDelayMs !== next.maxDelayMs ||
    previous.fallbackEnabled !== next.fallbackEnabled ||
    previous.strategy !== next.strategy
  );
}

function classifyFallbackSuppressionReason(options: {
  gateEnabled: boolean;
  fallbackModel?: string;
  currentModel: string;
  hasRetriedWithFallback: boolean;
  retryProfile: RetryProfile;
  fallbackCandidateAvailable: boolean;
}): "retry_strategy" | "gate_disabled" | "fallback_missing" | "same_model" | "already_retried" {
  if (options.fallbackCandidateAvailable && !options.retryProfile.fallbackEnabled) {
    return "retry_strategy";
  }
  if (!options.gateEnabled) {
    return "gate_disabled";
  }
  if (!options.fallbackModel) {
    return "fallback_missing";
  }
  if (options.fallbackModel === options.currentModel) {
    return "same_model";
  }
  if (options.hasRetriedWithFallback) {
    return "already_retried";
  }
  if (!options.retryProfile.fallbackEnabled) {
    return "retry_strategy";
  }
  return "fallback_missing";
}

export interface QueuedQueryItem {
  id: string;
  query: string;
  model: string;
  permissionMode: ToolPermissionMode;
  queuedAt: number;
  commandId: string;
  commandLabel: string;
  priority: QueuePriority;
}

export interface ProcessQueryResult {
  state: "handled_as_command" | "queued" | "rejected" | "completed" | "error";
  reason?: "queue_full";
  queueCount?: number;
  queueLimit?: number;
  commandId?: string;
}

export type CommandLifecycleSnapshot = Extract<QueryStreamEvent, { type: "command_lifecycle" }>;

export interface QueryRuntimeSnapshot {
  queueCount: number;
  queueLimit: number;
  queuedQueries: readonly QueuedQueryItem[];
  queueByPriority: Readonly<Record<QueuePriority, number>>;
  recentEvents: readonly QueryStreamEvent[];
  latestEvent: QueryStreamEvent | null;
  lastEventAt: number | null;
}

export function areRuntimeQueuePriorityCountersEqual(
  left: Readonly<Record<QueuePriority, number>>,
  right: Readonly<Record<QueuePriority, number>>,
): boolean {
  return (
    left.now === right.now &&
    left.next === right.next &&
    left.later === right.later
  );
}

export function areRuntimeQueuedQuerySnapshotsEqual(
  left: readonly QueuedQueryItem[],
  right: readonly QueuedQueryItem[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (!leftItem || !rightItem) {
      return false;
    }
    if (
      leftItem.id !== rightItem.id ||
      leftItem.query !== rightItem.query ||
      leftItem.model !== rightItem.model ||
      leftItem.permissionMode !== rightItem.permissionMode ||
      leftItem.queuedAt !== rightItem.queuedAt ||
      leftItem.commandId !== rightItem.commandId ||
      leftItem.commandLabel !== rightItem.commandLabel ||
      leftItem.priority !== rightItem.priority
    ) {
      return false;
    }
  }
  return true;
}

export function shouldPublishRuntimeSnapshot(
  previousSnapshot: QueryRuntimeSnapshot,
  nextSnapshotSeed: {
    queueCount: number;
    queueLimit: number;
    queueByPriority: Readonly<Record<QueuePriority, number>>;
    queuedQueries: readonly QueuedQueryItem[];
    recentEvents: readonly QueryStreamEvent[];
    latestEvent: QueryStreamEvent | null;
    lastEventAt: number | null;
  },
): boolean {
  if (previousSnapshot.queueCount !== nextSnapshotSeed.queueCount) {
    return true;
  }
  if (previousSnapshot.queueLimit !== nextSnapshotSeed.queueLimit) {
    return true;
  }
  if (previousSnapshot.recentEvents !== nextSnapshotSeed.recentEvents) {
    return true;
  }
  if (previousSnapshot.latestEvent !== nextSnapshotSeed.latestEvent) {
    return true;
  }
  if (previousSnapshot.lastEventAt !== nextSnapshotSeed.lastEventAt) {
    return true;
  }
  if (
    !areRuntimeQueuePriorityCountersEqual(
      previousSnapshot.queueByPriority,
      nextSnapshotSeed.queueByPriority,
    )
  ) {
    return true;
  }
  if (
    !areRuntimeQueuedQuerySnapshotsEqual(
      previousSnapshot.queuedQueries,
      nextSnapshotSeed.queuedQueries,
    )
  ) {
    return true;
  }
  return false;
}

interface CommandLifecycleContext {
  id: string;
  command: string;
  lane: QueryExecutionLane;
  queued: boolean;
}

type RuntimeSnapshotListener = (snapshot: QueryRuntimeSnapshot) => void;

interface ProcessQueryInputSeed {
  id?: string;
  command?: string;
  queued?: boolean;
  priority?: QueuePriority;
}

interface QueryEngineOptions {
  permissionMode?: ToolPermissionMode;
  deps?: QueryDeps;
  stopHooks?: StopHook[];
  tokenBudget?: TokenBudgetConfig;
  toolCallBudgetPolicy?: Partial<ToolCallBudgetPolicy> | null;
  fallbackModel?: string;
  workingDir?: string;
  threadId?: string;
  permissionRules?: PermissionRule[];
  additionalWorkingDirectories?: string[];
  locale?: AppLocale;
  onPermissionRequest?: (request: PermissionPromptRequest) => Promise<PermissionPromptDecision>;
  onToolCallBudgetPolicyChange?: (policy: ToolCallBudgetPolicy) => void;
}

function mapTerminalToCommandLifecycleState(
  terminal: Terminal | null,
): "completed" | "failed" | "aborted" {
  if (!terminal) {
    return "failed";
  }
  if (terminal.reason === "completed") {
    return "completed";
  }
  if (terminal.reason === "aborted") {
    return "aborted";
  }
  return "failed";
}

function coalesceTraceEvents(previous: QueryStreamEvent, next: QueryStreamEvent): QueryStreamEvent | null {
  if (
    previous.type === "queue_update" &&
    next.type === "queue_update" &&
    previous.action === next.action &&
    previous.priority === next.priority &&
    previous.reason === next.reason &&
    previous.queueCount === next.queueCount &&
    previous.queueLimit === next.queueLimit
  ) {
    return {
      ...previous,
      at: next.at,
    };
  }

  if (
    previous.type === "command_lifecycle" &&
    next.type === "command_lifecycle" &&
    previous.commandId === next.commandId &&
    previous.state === next.state &&
    previous.terminalReason === next.terminalReason &&
    previous.command === next.command
  ) {
    return {
      ...previous,
      at: next.at,
    };
  }

  return null;
}

// ============================================================
// QueryEngine: the core multi-turn tool-use reasoning loop
// ============================================================

export class QueryEngine {
  private messages: AgentMessage[] = [];
  private tools: Map<string, Tool> = new Map();
  private onUpdate: (messages: AgentMessage[]) => void;
  private baseUrl: string;
  private apiKey: string;
  private abortController: AbortController | null = null;
  private messageQueue: QueuedQueryItem[] = [];
  private isProcessing = false;
  private abortQueuedProcessing = false;
  private permissionMode: ToolPermissionMode;
  private unlistenAgentLog: null | (() => void) = null;
  private deps: QueryDeps;
  private lastTerminal: Terminal | null = null;
  private lastContinue: Continue | null = null;
  private queryEvents: QueryStreamEvent[] = [];
  private readonly maxQueryEvents = 240;
  private stopHooks: StopHook[];
  private useDefaultStopHooks = false;
  private tokenBudget: TokenBudgetConfig | null;
  private fallbackModel?: string;
  private workingDir?: string;
  private threadId?: string;
  private permissionRules: PermissionRule[] = [];
  private additionalWorkingDirectories: string[] = [];
  private toolCallBudgetPolicy: ToolCallBudgetPolicy = { ...DEFAULT_TOOL_CALL_BUDGET_POLICY };
  private readonly taskManager: AgentTaskManager;
  private readonly commandRegistry: CommandRegistry;
  private locale: AppLocale = "zh-CN";
  private currentModel?: string;
  private onPermissionRequest?: (request: PermissionPromptRequest) => Promise<PermissionPromptDecision>;
  private onToolCallBudgetPolicyChange?: (policy: ToolCallBudgetPolicy) => void;
  private uiFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private uiUpdatePending = false;
  private stepLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedStepLogs = new Map<string, { step: AgentStepData; lines: string[] }>();
  private lastPublishedMessageSignature: string | null = null;
  private pendingAbortSource: AbortSource | null = null;
  private activeTurnId?: string;
  private activeAssistantMessage: AgentMessage | null = null;
  private activeRunningStep: AgentStepData | null = null;
  private deniedToolCallSignatures = new Set<string>();
  private scopedApprovalCountsByTool = new Map<string, number>();
  private cachedGitSnapshot: RuntimeGitSnapshot | null = null;
  private cachedGitSnapshotDir?: string;
  private cachedGitSnapshotAt = 0;
  private usageByModel = new Map<string, UsageByModel>();
  private runtimeSnapshotListeners = new Set<RuntimeSnapshotListener>();
  private runtimeSnapshot: QueryRuntimeSnapshot = {
    queueCount: 0,
    queueLimit: MAX_QUEUED_QUERIES,
    queuedQueries: Object.freeze([] as QueuedQueryItem[]),
    queueByPriority: Object.freeze({
      now: 0,
      next: 0,
      later: 0,
    }),
    recentEvents: Object.freeze([] as QueryStreamEvent[]),
    latestEvent: null,
    lastEventAt: null,
  };
  private queryEventsVersion = 0;
  private recentEventsSnapshotVersion = -1;
  private recentEventsSnapshot: readonly QueryStreamEvent[] = Object.freeze([] as QueryStreamEvent[]);
  private commandLifecycleById = new Map<string, CommandLifecycleSnapshot>();
  private commandLifecycleOrder: string[] = [];
  private consecutiveNowDequeues = 0;
  private queueMaintenanceTimer: ReturnType<typeof setTimeout> | null = null;


  constructor(
    onUpdate: (messages: AgentMessage[]) => void,
    baseUrl: string,
    apiKey: string,
    options: QueryEngineOptions = {},
  ) {
    this.onUpdate = onUpdate;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.permissionMode = options.permissionMode ?? "default";
    this.deps = options.deps ?? productionDeps();
    if (options.stopHooks) {
      this.stopHooks = [...options.stopHooks];
    } else {
      this.stopHooks = createDefaultStopHooks(options.locale ?? "zh-CN");
      this.useDefaultStopHooks = true;
    }
    this.tokenBudget = options.tokenBudget ?? null;
    this.fallbackModel = options.fallbackModel;
    this.workingDir = options.workingDir;
    this.threadId = options.threadId;
    this.permissionRules = [...(options.permissionRules ?? [])];
    this.additionalWorkingDirectories = [...(options.additionalWorkingDirectories ?? [])];
    this.locale = options.locale ?? "zh-CN";
    this.onPermissionRequest = options.onPermissionRequest;
    this.toolCallBudgetPolicy = normalizeToolCallBudgetPolicy(options.toolCallBudgetPolicy);
    this.onToolCallBudgetPolicyChange = options.onToolCallBudgetPolicyChange;
    this.taskManager = new AgentTaskManager(() => {
      this.updateUI();
    });
    this.commandRegistry = createDefaultCommandRegistry();
    this.setupEventListeners();

    // Register all available tools
    for (const tool of ALL_TOOLS) {
      this.registerTool(tool);
    }
    this.refreshRuntimeSnapshot();
  }

  private async setupEventListeners() {
    const unlisten = await listen<{ source: string, line: string }>("agent-log", (event) => {
      console.log(`[Rust Stream] ${event.payload.source}: ${event.payload.line}`);
      if (!this.activeAssistantMessage?.steps) {
        return;
      }
      const activeStep =
        this.activeRunningStep ??
        this.activeAssistantMessage.steps.find((step) => step.status === "running");
      if (activeStep) {
        this.activeRunningStep = activeStep;
        this.enqueueStepLog(activeStep, `[${event.payload.source}] ${event.payload.line}`);
      }
    });
    this.unlistenAgentLog = unlisten;
  }

  public registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  private createStep(title: string, toolRender?: AgentToolRenderData): AgentStepData {
    return {
      id: Math.random().toString(36).substring(7),
      title,
      status: "pending",
      logs: [],
      toolRender,
    };
  }

  private sampleTextForMessageSignature(value: string | undefined): string {
    if (!value) {
      return "0";
    }
    const maxChars = MESSAGE_UPDATE_SIGNATURE_TEXT_SAMPLE_CHARS;
    const midIndex = Math.floor(value.length / 2);
    const midCode = value.charCodeAt(midIndex) || 0;
    const head = value.slice(0, maxChars);
    const tail = value.slice(-maxChars);
    return `${value.length}:${midCode}:${head}:${tail}`;
  }

  private mixMessageSignatureHash(hash: number, value: string): number {
    let next = hash >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      next ^= value.charCodeAt(index);
      next = Math.imul(next, 16777619);
      next >>>= 0;
    }
    return next;
  }

  private mixMessageSignatureNumber(hash: number, value: number): number {
    const normalized = Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
    let next = (hash ^ normalized) >>> 0;
    next = Math.imul(next, 16777619);
    return next >>> 0;
  }

  private computeMessageUpdateSignature(): string {
    if (this.messages.length === 0) {
      return "0";
    }
    let hash = 2166136261;
    hash = this.mixMessageSignatureNumber(hash, this.messages.length);
    for (let index = 0; index < this.messages.length; index += 1) {
      const message = this.messages[index];
      if (!message) {
        continue;
      }
      hash = this.mixMessageSignatureHash(hash, message.id);
      hash = this.mixMessageSignatureHash(hash, message.role);
      hash = this.mixMessageSignatureHash(hash, message.status ?? "");
      hash = this.mixMessageSignatureHash(hash, this.sampleTextForMessageSignature(message.content));
      hash = this.mixMessageSignatureHash(hash, this.sampleTextForMessageSignature(message.report));
      const steps = message.steps ?? [];
      hash = this.mixMessageSignatureNumber(hash, steps.length);
      if (steps.length > 0) {
        const sampledSteps = [steps[0], steps[steps.length - 1]].filter(
          (step, stepIndex, array): step is AgentStepData => Boolean(step) && array.indexOf(step) === stepIndex,
        );
        for (const step of sampledSteps) {
          hash = this.mixMessageSignatureHash(hash, step.id);
          hash = this.mixMessageSignatureHash(hash, step.status);
          const logs = step.logs ?? [];
          hash = this.mixMessageSignatureNumber(hash, logs.length);
          const lastLog = logs.length > 0 ? logs[logs.length - 1] : "";
          hash = this.mixMessageSignatureHash(hash, this.sampleTextForMessageSignature(lastLog));
          if (step.toolRender) {
            hash = this.mixMessageSignatureHash(hash, step.toolRender.toolName);
            hash = this.mixMessageSignatureHash(hash, step.toolRender.outcome);
            hash = this.mixMessageSignatureHash(
              hash,
              this.sampleTextForMessageSignature(step.toolRender.callArguments),
            );
            hash = this.mixMessageSignatureHash(
              hash,
              this.sampleTextForMessageSignature(step.toolRender.outcomePreview),
            );
          }
        }
      }
    }
    const tailMessage = this.messages[this.messages.length - 1];
    return [
      String(this.messages.length),
      hash.toString(16),
      tailMessage?.id ?? "",
      tailMessage?.status ?? "",
      this.sampleTextForMessageSignature(tailMessage?.content),
    ].join("#");
  }

  private scheduleUIUpdate() {
    this.uiUpdatePending = true;
    if (this.uiFlushTimer !== null) {
      return;
    }
    this.uiFlushTimer = setTimeout(() => {
      this.uiFlushTimer = null;
      this.flushUIUpdates();
    }, UI_FLUSH_INTERVAL_MS);
  }

  private flushUIUpdates() {
    if (!this.uiUpdatePending) {
      return;
    }
    this.uiUpdatePending = false;
    const nextSignature = this.computeMessageUpdateSignature();
    if (this.lastPublishedMessageSignature === nextSignature) {
      return;
    }
    this.lastPublishedMessageSignature = nextSignature;
    this.onUpdate([...this.messages]);
  }

  private updateUI(immediate = false) {
    if (immediate) {
      this.flushQueuedStepLogsCore();
      if (this.uiFlushTimer !== null) {
        clearTimeout(this.uiFlushTimer);
        this.uiFlushTimer = null;
      }
      this.uiUpdatePending = true;
      this.flushUIUpdates();
      return;
    }
    this.scheduleUIUpdate();
  }

  private enqueueStepLog(step: AgentStepData, line: string) {
    const key = step.id;
    const queued = this.queuedStepLogs.get(key);
    if (queued) {
      queued.lines.push(String(line));
    } else {
      this.queuedStepLogs.set(key, { step, lines: [String(line)] });
    }
    if (this.stepLogFlushTimer !== null) {
      return;
    }
    this.stepLogFlushTimer = setTimeout(() => {
      this.stepLogFlushTimer = null;
      this.flushQueuedStepLogs();
    }, STEP_LOG_FLUSH_INTERVAL_MS);
  }

  private flushQueuedStepLogsCore(): boolean {
    if (this.stepLogFlushTimer !== null) {
      clearTimeout(this.stepLogFlushTimer);
      this.stepLogFlushTimer = null;
    }
    if (this.queuedStepLogs.size === 0) {
      return false;
    }
    for (const { step, lines } of this.queuedStepLogs.values()) {
      for (const line of lines) {
        this.appendStepLog(step, line);
      }
    }
    this.queuedStepLogs.clear();
    return true;
  }

  private flushQueuedStepLogs(immediateUI = false) {
    if (!this.flushQueuedStepLogsCore()) {
      return;
    }
    this.updateUI(immediateUI);
  }

  private appendStepLog(step: AgentStepData, line: string) {
    const nextLine = String(line);
    const hasMarker = step.logs[0] === STEP_LOG_TRUNCATED_MARKER;

    if (!hasMarker && step.logs.length >= MAX_STEP_LOG_LINES) {
      const removeCount = Math.max(1, step.logs.length - (MAX_STEP_LOG_LINES - 2));
      step.logs.splice(0, removeCount);
      step.logs.unshift(STEP_LOG_TRUNCATED_MARKER);
    } else if (hasMarker) {
      const allowedEntries = MAX_STEP_LOG_LINES - 1;
      const existingEntries = step.logs.length - 1;
      if (existingEntries >= allowedEntries) {
        const removeCount = existingEntries - allowedEntries + 1;
        step.logs.splice(1, removeCount);
      }
    }

    step.logs.push(nextLine);

    if (step.logs.length > MAX_STEP_LOG_LINES) {
      if (step.logs[0] === STEP_LOG_TRUNCATED_MARKER) {
        step.logs.splice(1, step.logs.length - MAX_STEP_LOG_LINES);
      } else {
        step.logs.splice(0, step.logs.length - MAX_STEP_LOG_LINES);
      }
    }
  }

  private pushQueryEvent(event: QueryStreamEvent) {
    const previous = this.queryEvents.length > 0 ? this.queryEvents[this.queryEvents.length - 1] ?? null : null;
    if (previous) {
      const merged = coalesceTraceEvents(previous, event);
      if (merged) {
        this.queryEvents[this.queryEvents.length - 1] = merged;
        this.markQueryEventsChanged();
        this.refreshRuntimeSnapshot();
        return;
      }
    }
    this.queryEvents.push(event);
    if (this.queryEvents.length > this.maxQueryEvents) {
      this.queryEvents = this.queryEvents.slice(this.queryEvents.length - this.maxQueryEvents);
    }
    this.markQueryEventsChanged();
    this.refreshRuntimeSnapshot();
  }

  private markQueryEventsChanged() {
    this.queryEventsVersion += 1;
  }

  private getRecentEventsSnapshot(): readonly QueryStreamEvent[] {
    if (this.recentEventsSnapshotVersion === this.queryEventsVersion) {
      return this.recentEventsSnapshot;
    }
    const clonedEvents = this.queryEvents.map(
      (event) => Object.freeze({ ...event }) as QueryStreamEvent,
    );
    this.recentEventsSnapshot = Object.freeze(clonedEvents);
    this.recentEventsSnapshotVersion = this.queryEventsVersion;
    return this.recentEventsSnapshot;
  }

  private clearQueueMaintenanceTimer() {
    if (this.queueMaintenanceTimer !== null) {
      clearTimeout(this.queueMaintenanceTimer);
      this.queueMaintenanceTimer = null;
    }
  }

  private scheduleQueueMaintenance() {
    if (this.messageQueue.length === 0 || this.queueMaintenanceTimer !== null) {
      return;
    }
    this.queueMaintenanceTimer = setTimeout(() => {
      this.queueMaintenanceTimer = null;
      this.runQueueMaintenance();
    }, QUEUE_MAINTENANCE_INTERVAL_MS);
  }

  private runQueueMaintenance(now = Date.now()) {
    if (this.messageQueue.length === 0) {
      this.refreshRuntimeSnapshot();
      return;
    }
    const staleRemoved = this.pruneStaleQueuedQueries(now);
    if (staleRemoved > 0) {
      this.pushQueryEvent({
        type: "queue_update",
        action: "rejected",
        queueCount: this.messageQueue.length,
        queueLimit: MAX_QUEUED_QUERIES,
        reason: "stale",
        at: now,
      });
      return;
    }
    // No structural change, but effective queue rank ages with time; refresh ordering snapshot.
    this.refreshRuntimeSnapshot();
  }

  private refreshRuntimeSnapshot() {
    const recentEvents = this.getRecentEventsSnapshot();
    const latestEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] ?? null : null;
    const queueByPriority: Record<QueuePriority, number> = {
      now: 0,
      next: 0,
      later: 0,
    };
    for (const item of this.messageQueue) {
      queueByPriority[item.priority] += 1;
    }
    const snapshotNow = Date.now();
    const queuedByDispatchOrder = [...this.messageQueue]
      .sort((left, right) => compareQueueItemsByDispatchOrder(left, right, snapshotNow))
      .map((item) => ({ ...item }));
    const previousSnapshot = this.runtimeSnapshot;
    const lastEventAt = latestEvent?.at ?? null;
    const queueCount = this.messageQueue.length;
    const queueLimit = MAX_QUEUED_QUERIES;
    if (
      !shouldPublishRuntimeSnapshot(previousSnapshot, {
        queueCount,
        queueLimit,
        queueByPriority,
        queuedQueries: queuedByDispatchOrder,
        recentEvents,
        latestEvent,
        lastEventAt,
      })
    ) {
      if (this.messageQueue.length > 0) {
        this.scheduleQueueMaintenance();
      } else {
        this.clearQueueMaintenanceTimer();
      }
      return;
    }
    const nextSnapshot: QueryRuntimeSnapshot = {
      queueCount,
      queueLimit,
      queuedQueries: Object.freeze(queuedByDispatchOrder),
      queueByPriority: Object.freeze(queueByPriority),
      recentEvents,
      latestEvent,
      lastEventAt,
    };
    this.runtimeSnapshot = nextSnapshot;
    for (const listener of this.runtimeSnapshotListeners) {
      try {
        listener(nextSnapshot);
      } catch (error) {
        console.warn("[lumo-agent] runtimeSnapshot listener failed:", error);
      }
    }
    if (this.messageQueue.length > 0) {
      this.scheduleQueueMaintenance();
    } else {
      this.clearQueueMaintenanceTimer();
    }
  }

  public getRuntimeSnapshot(): QueryRuntimeSnapshot {
    return this.runtimeSnapshot;
  }

  public subscribeRuntimeSnapshot(listener: RuntimeSnapshotListener): () => void {
    this.runtimeSnapshotListeners.add(listener);
    listener(this.runtimeSnapshot);
    return () => {
      this.runtimeSnapshotListeners.delete(listener);
    };
  }

  public getCommandLifecycle(commandId: string): CommandLifecycleSnapshot | null {
    const hit = this.commandLifecycleById.get(commandId);
    if (!hit) {
      return null;
    }
    return { ...hit };
  }

  private emitCommandLifecycleEvent(
    context: CommandLifecycleContext,
    state: "queued" | "started" | "completed" | "failed" | "aborted",
    options?: {
      terminalReason?: Terminal["reason"] | "slash_command_error";
      at?: number;
    },
  ) {
    const command = context.command.trim();
    if (!command) {
      return;
    }
    const event: CommandLifecycleSnapshot = {
      type: "command_lifecycle",
      commandId: context.id,
      command,
      state,
      lane: context.lane,
      queued: context.queued,
      terminalReason: options?.terminalReason,
      at: options?.at ?? Date.now(),
    };
    if (!this.commandLifecycleById.has(context.id)) {
      this.commandLifecycleOrder.push(context.id);
    }
    this.commandLifecycleById.set(context.id, event);
    while (this.commandLifecycleOrder.length > MAX_TRACKED_COMMAND_LIFECYCLE) {
      const staleId = this.commandLifecycleOrder.shift();
      if (!staleId) {
        break;
      }
      this.commandLifecycleById.delete(staleId);
    }
    this.pushQueryEvent(event);
  }

  private makeId() {
    try {
      return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  private validateToolArgs(tool: Tool, args: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
    const parsed = tool.inputSchema.safeParse(args);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    return {
      ok: false,
      error: formatToolValidationError(tool.name, parsed.error),
    };
  }

  private canUseTool(
    tool: Tool,
    input: unknown,
    mode: ToolPermissionMode = this.permissionMode
  ): PermissionDecision {
    return decideToolPermission({
      tool,
      input,
      mode,
      rules: this.permissionRules,
      workingDir: this.workingDir,
      additionalWorkingDirectories: this.additionalWorkingDirectories,
    });
  }

  private classifyError(error: any): string {
    const errorStr = String(error).toLowerCase();
    const statusMatch = errorStr.match(/llm api (?:error)?\s*:?\s*(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    if (status === 401) return translate(this.locale, "agent.error.apiUnauthorized");
    if (status === 404 || errorStr.includes("model does not exist")) {
      return translate(this.locale, "agent.error.modelUnavailable", { error: String(error) });
    }
    if (status === 429) return translate(this.locale, "agent.error.rateLimit");
    if (status === 529 || errorStr.includes("overloaded")) {
      return translate(this.locale, "agent.error.overloaded");
    }
    if (errorStr.includes("abort") || errorStr.includes("aborted")) {
      return translate(this.locale, "agent.error.aborted");
    }
    return translate(this.locale, "agent.error.generic", { error: String(error) });
  }
  private ensureToolResultPairing(llmHistory: LLMMessage[], assistantMsg: AgentMessage) {
    const lastAssistantMsg = llmHistory[llmHistory.length - 1];
    if (lastAssistantMsg?.role !== "assistant" || !lastAssistantMsg.tool_calls) return;

    const existingToolResIds = new Set(
      llmHistory.slice(llmHistory.indexOf(lastAssistantMsg) + 1)
        .filter(m => m.role === "tool")
        .map(m => m.tool_call_id)
    );

    for (const toolCall of lastAssistantMsg.tool_calls) {
      if (!existingToolResIds.has(toolCall.id)) {
        llmHistory.push({
          role: "tool",
          content: translate(this.locale, "agent.runtime.turnInterrupted"),
          tool_call_id: toolCall.id
        });

        if (assistantMsg.steps) {
          const step = assistantMsg.steps.find(s => s.title.includes(toolCall.function.name));
          if (step && step.status === "running") this.setStepStatus(step, "error");
        }
      }
    }
  }

  /**
   * Build OpenAI-compatible tools array from registered tools.
   */
  private buildToolDefinitions(): any[] {
    const toolDefs: any[] = [];
    for (const tool of this.tools.values()) {
      toolDefs.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.jsonSchema || {
            type: "object",
            properties: {},
          }
        }
      });
    }
    return toolDefs;
  }

  /**
   * Build tool descriptions string for the system prompt.
   */
  private buildToolDescriptions(): string {
    const lines: string[] = [];
    for (const tool of this.tools.values()) {
      lines.push(`### ${tool.name}\n${tool.description}\n`);
    }
    return lines.join("\n");
  }

  private truncateMessageForContext(content: string): string {
    if (content.length <= MAX_CONTEXT_MESSAGE_CHARS) {
      return content;
    }
    const head = content.slice(0, CONTEXT_HEAD_CHARS);
    const tail = content.slice(-CONTEXT_TAIL_CHARS);
    const omitted = Math.max(0, content.length - CONTEXT_HEAD_CHARS - CONTEXT_TAIL_CHARS);
    return `${head}\n\n[... context truncated: ${omitted} chars omitted ...]\n\n${tail}`;
  }

  private truncateToolResultForContext(content: string): string {
    if (content.length <= MAX_CONTEXT_TOOL_RESULT_CHARS) {
      return content;
    }
    const head = content.slice(0, CONTEXT_TOOL_RESULT_HEAD_CHARS);
    const tail = content.slice(-CONTEXT_TOOL_RESULT_TAIL_CHARS);
    const omitted = Math.max(
      0,
      content.length - CONTEXT_TOOL_RESULT_HEAD_CHARS - CONTEXT_TOOL_RESULT_TAIL_CHARS,
    );
    return `${head}\n\n[... tool result truncated for context: ${omitted} chars omitted ...]\n\n${tail}`;
  }

  private pruneStaleQueuedQueries(now = Date.now()): number {
    if (this.messageQueue.length === 0) {
      return 0;
    }
    const kept: QueuedQueryItem[] = [];
    const dropped: QueuedQueryItem[] = [];
    for (const item of this.messageQueue) {
      if (now - item.queuedAt <= QUEUED_QUERY_MAX_AGE_MS) {
        kept.push(item);
      } else {
        dropped.push(item);
      }
    }
    this.messageQueue = kept;
    for (const item of dropped) {
      this.emitCommandLifecycleEvent(
        {
          id: item.commandId,
          command: item.commandLabel,
          lane: "background",
          queued: true,
        },
        "aborted",
        {
          terminalReason: "aborted",
          at: now,
        },
      );
    }
    return dropped.length;
  }

  private collectUsage(model: string, usage?: CompletionUsageLike) {
    if (!usage) return;
    const inputTokens = Number(usage.prompt_tokens ?? 0);
    const outputTokens = Number(usage.completion_tokens ?? 0);
    const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
    const cachedInputTokens = Number(usage.prompt_tokens_details?.cached_tokens ?? 0);

    if (
      !Number.isFinite(inputTokens) ||
      !Number.isFinite(outputTokens) ||
      !Number.isFinite(totalTokens) ||
      !Number.isFinite(cachedInputTokens)
    ) {
      return;
    }

    const current = this.usageByModel.get(model) ?? {
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    };

    current.inputTokens += Math.max(0, Math.round(inputTokens));
    current.outputTokens += Math.max(0, Math.round(outputTokens));
    current.totalTokens += Math.max(0, Math.round(totalTokens));
    current.cachedInputTokens += Math.max(0, Math.round(cachedInputTokens));
    this.usageByModel.set(model, current);
  }

  public getUsageSnapshot(): UsageSnapshot {
    const byModel = [...this.usageByModel.values()].sort((left, right) =>
      left.model.localeCompare(right.model),
    );
    const totals = byModel.reduce<UsageTotals>(
      (acc, item) => {
        acc.inputTokens += item.inputTokens;
        acc.outputTokens += item.outputTokens;
        acc.totalTokens += item.totalTokens;
        acc.cachedInputTokens += item.cachedInputTokens;
        return acc;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
      },
    );
    return { totals, byModel };
  }

  public resetUsageSnapshot() {
    this.usageByModel.clear();
  }

  private isToolConcurrencySafe(toolCall: LLMToolCall): boolean {
    const tool = this.tools.get(toolCall.function.name);
    return Boolean(tool?.isReadOnly);
  }

  private isToolResultError(result: string): boolean {
    const lower = result.toLowerCase();
    return (
      lower.startsWith("error:") ||
      lower.includes("execution failed") ||
      lower.includes("failed")
    );
  }

  private getToolResultStatus(result: string): AgentStepStatus {
    const lower = result.toLowerCase();
    if (
      lower.startsWith("permission ask:") ||
      lower.startsWith("permission deny:") ||
      lower.startsWith("permission denied")
    ) {
      return "rejected";
    }
    return this.isToolResultError(result) ? "error" : "completed";
  }

  private classifyToolFailure(result: string, status: AgentStepStatus): ToolFailureClass | null {
    if (status !== "error" && status !== "rejected") {
      return null;
    }
    const lower = result.toLowerCase();
    if (
      lower.includes("permission denied") ||
      lower.startsWith("permission ask:") ||
      lower.startsWith("permission deny:") ||
      lower.includes("denied by user")
    ) {
      return "permission";
    }
    if (lower.includes("[workspaceguard]") || lower.includes("outside workspace boundaries")) {
      return "workspace";
    }
    if (lower.includes("timeout") || lower.includes("interrupted due to timeout")) {
      return "timeout";
    }
    if (
      lower.includes("not found") ||
      lower.includes("unknown tool") ||
      lower.includes("cannot find") ||
      lower.includes("no such file")
    ) {
      return "not_found";
    }
    if (
      lower.includes("econn") ||
      lower.includes("enotfound") ||
      lower.includes("network") ||
      lower.includes("tls") ||
      lower.includes("certificate")
    ) {
      return "network";
    }
    if (lower.includes("[validation]") || lower.includes("invalid")) {
      return "validation";
    }
    return "runtime";
  }

  private summarizeFailureBreakdown(
    entries: Array<{ tool: string; failureClass: ToolFailureClass }>,
    maxItems = 6,
  ): string {
    if (entries.length === 0) {
      return "";
    }
    const counter = new Map<string, number>();
    for (const entry of entries) {
      const key = `${entry.tool}:${entry.failureClass}`;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, maxItems)
      .map(([key, count]) => `${key}x${count}`)
      .join(", ");
  }

  private buildFastFailureGuardResult(state: ToolFailureState): string {
    return translate(this.locale, "agent.runtime.fastGuardResult", {
      tool: state.tool,
      failureClass: translate(this.locale, `agent.trace.toolFailureClass.${state.failureClass}`),
      sample: state.sample || "(no sample)",
    });
  }

  private updateToolFailureState(
    stateBySignature: Map<string, ToolFailureState>,
    signature: string,
    toolName: string,
    failureClass: ToolFailureClass | null,
    status: AgentStepStatus,
    result: string,
    now = Date.now(),
  ): ToolFailureState | null {
    if (status === "completed" || !failureClass) {
      stateBySignature.delete(signature);
      return null;
    }
    const previous = stateBySignature.get(signature);
    const nextStreak =
      previous && previous.failureClass === failureClass
        ? previous.streak + 1
        : 1;
    const next: ToolFailureState = {
      tool: toolName,
      failureClass,
      streak: nextStreak,
      lastAt: now,
      sample: result.slice(0, 220),
    };
    stateBySignature.set(signature, next);
    return next;
  }

  private shouldFastGuardToolFailure(state: ToolFailureState | undefined, now = Date.now()): boolean {
    if (!state) {
      return false;
    }
    if (state.failureClass === "permission") {
      return false;
    }
    if (state.streak < TOOL_FAILURE_FAST_GUARD_STREAK) {
      return false;
    }
    return now - state.lastAt <= TOOL_FAILURE_FAST_GUARD_WINDOW_MS;
  }

  private shouldTriggerBatchFailureDiagnosis(
    toolCount: number,
    errorCount: number,
    continuationCount: number,
  ): boolean {
    if (toolCount <= 0) {
      return false;
    }
    if (continuationCount >= TOOL_FAILURE_DIAGNOSIS_MAX_CONTINUATIONS) {
      return false;
    }
    if (errorCount < TOOL_FAILURE_DIAGNOSIS_MIN_BATCH_ERRORS) {
      return false;
    }
    const ratio = errorCount / toolCount;
    return ratio >= TOOL_FAILURE_DIAGNOSIS_MIN_RATIO;
  }

  private buildBatchFailureDiagnosisContinuation(details: string, errorCount: number, toolCount: number): string {
    return translate(this.locale, "agent.runtime.batchFailureDiagnosisContinuation", {
      errorCount,
      toolCount,
      details: details || "unknown",
    });
  }

  private computeToolCallBudget(
    toolName: string,
    tool: Tool | undefined,
    consecutiveFailureBatches: number,
  ): { budget: number; reason: ToolBudgetGuardReason } {
    const normalizedName = toolName.trim().toLowerCase();
    const policy = this.toolCallBudgetPolicy;
    let baseBudget = tool?.isReadOnly ? policy.readOnlyBase : policy.mutatingBase;
    if (normalizedName === "shell") {
      baseBudget = policy.shellBase;
    }
    const backoffPenalty = Math.max(0, consecutiveFailureBatches) * policy.failureBackoffStep;
    const budget = Math.max(policy.minimum, baseBudget - backoffPenalty);
    return {
      budget,
      reason: backoffPenalty > 0 ? "failure_backoff" : "per_tool_limit",
    };
  }

  private buildToolBudgetGuardResult(
    toolName: string,
    count: number,
    budget: number,
    reason: ToolBudgetGuardReason,
  ): string {
    return translate(this.locale, "agent.runtime.toolBudgetGuardResult", {
      tool: toolName,
      count,
      budget,
      reason: translate(this.locale, `agent.runtime.toolBudgetReason.${reason}`),
    });
  }

  private createSessionPermissionRule(toolName: string, draft?: PermissionRuleDraft): PermissionRule {
    const fallback: PermissionRuleDraft = {
      tool: toolName,
      behavior: "allow",
      mode: "default",
      matcher: { type: "tool_only" },
      description: `Allow ${toolName} for current session`,
    };
    const selectedDraft = draft ?? fallback;
    return {
      ...selectedDraft,
      id: `session-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  private createToolCallSignature(toolName: string, input: unknown): string {
    try {
      return `${toolName}::${JSON.stringify(input)}`;
    } catch {
      return `${toolName}::${String(input)}`;
    }
  }

  private createToolCallSignatureFromArgsJson(toolName: string, argsJson: string): string {
    try {
      const parsed = JSON.parse(argsJson);
      return this.createToolCallSignature(toolName, parsed);
    } catch {
      return `${toolName}::${argsJson}`;
    }
  }

  private noteScopedAuthorization(toolName: string, riskClass: PermissionRiskClass | undefined, step: AgentStepData) {
    const noted = noteScopedAuthorizationApproval(
      this.scopedApprovalCountsByTool,
      toolName,
      riskClass,
    );
    if (!noted.trackedRiskClass) {
      return;
    }
    if (noted.previousApprovals <= 0) {
      return;
    }
    this.appendStepLog(
      step,
      translate(this.locale, "agent.runtime.authorizationScopeReminderLog", {
        tool: toolName,
        count: noted.previousApprovals,
      }),
    );
  }


  /**
   * Execute a single tool call.
   */
  private async executeTool(
    toolCall: LLMToolCall,
    step: AgentStepData,
    mode: ToolPermissionMode
  ): Promise<string> {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) {
      return translate(this.locale, "agent.runtime.unknownTool", {
        tool: toolCall.function.name,
        tools: [...this.tools.keys()].join(", "),
      });
    }

    let params: any;
    try {
      params = JSON.parse(toolCall.function.arguments);
    } catch {
      return translate(this.locale, "agent.runtime.invalidToolArgsJson", {
        args: toolCall.function.arguments,
      });
    }

    const validated = this.validateToolArgs(tool, params);
    if (!validated.ok) {
      this.appendStepLog(step, `[Validation] ${validated.error}`);
      return validated.error;
    }

    const toolCallSignature = this.createToolCallSignature(tool.name, validated.data);
    if (this.deniedToolCallSignatures.has(toolCallSignature)) {
      const blockedMessage = translate(this.locale, "agent.runtime.repeatedDeniedToolCall", {
        tool: tool.name,
      });
      this.appendStepLog(step, blockedMessage);
      this.updateUI();
      return blockedMessage;
    }

    if (tool.name === "shell" && mode !== "full_access") {
      const dedicatedToolHint = this.detectDedicatedToolHintFromShell(
        validated.data as Record<string, unknown>,
      );
      if (dedicatedToolHint) {
        this.appendStepLog(
          step,
          translate(this.locale, "agent.runtime.preferDedicatedToolLog", {
            tool: dedicatedToolHint.tool,
            command: dedicatedToolHint.command,
            reason: dedicatedToolHint.reason,
          }),
        );
        this.updateUI();
        return translate(this.locale, "agent.runtime.preferDedicatedToolError", {
          tool: dedicatedToolHint.tool,
          command: dedicatedToolHint.command,
          reason: dedicatedToolHint.reason,
        });
      }
    }

    const permission = this.canUseTool(tool, validated.data, mode);
    if (permission.behavior !== "allow") {
      const riskProfile = getPermissionRiskProfile(permission.riskClass);
      this.pushQueryEvent({
        type: "permission_risk_profile",
        tool: tool.name,
        riskClass: permission.riskClass,
        reason: permission.reason,
        reversibility: riskProfile.reversibility,
        blastRadius: riskProfile.blastRadius,
        at: Date.now(),
      });
      this.appendStepLog(
        step,
        translate(this.locale, "agent.runtime.permissionRiskProfileLog", {
          reversibility: translate(this.locale, `agent.permission.prompt.reversibility.${riskProfile.reversibility}`),
          blastRadius: translate(this.locale, `agent.permission.prompt.blastRadius.${riskProfile.blastRadius}`),
        }),
      );
      if (permission.behavior === "deny") {
        this.pushQueryEvent({
          type: "permission_decision",
          tool: tool.name,
          behavior: "deny",
          reason: permission.reason,
          riskClass: permission.riskClass,
          at: Date.now(),
        });
        this.appendStepLog(
          step,
          translate(this.locale, "agent.runtime.permissionDeniedLog", {
            reason: permission.reason,
          }),
        );
        this.deniedToolCallSignatures.add(toolCallSignature);
        this.updateUI();
        return translate(this.locale, "agent.runtime.permissionDeniedResult", {
          reason: permission.reason,
        });
      }

      const suggestions = permission.suggestions ?? [];
      this.pushQueryEvent({
        type: "permission_decision",
        tool: tool.name,
        behavior: "ask",
        reason: permission.reason,
        riskClass: permission.riskClass,
        at: Date.now(),
      });
      this.appendStepLog(
        step,
        translate(this.locale, "agent.runtime.permissionApprovalRequiredLog", {
          reason: permission.reason,
        }),
      );
      if (suggestions.length > 0) {
        this.appendStepLog(
          step,
          translate(this.locale, "agent.runtime.permissionSuggestionsLog", {
            suggestions: suggestions.map((s) => s.summary).join(" | "),
          }),
        );
      }
      const {
        trackedRiskClass: scopedRiskClass,
        priorApprovals: priorScopedApprovals,
      } = getPriorScopedApprovalsForTool(
        this.scopedApprovalCountsByTool,
        tool.name,
        permission.riskClass,
      );
      if (scopedRiskClass && priorScopedApprovals > 0) {
        this.pushQueryEvent({
          type: "authorization_scope_notice",
          tool: tool.name,
          riskClass: scopedRiskClass,
          priorApprovals: priorScopedApprovals,
          at: Date.now(),
        });
        this.appendStepLog(
          step,
          translate(this.locale, "agent.runtime.authorizationScopeReminderLog", {
            tool: tool.name,
            count: priorScopedApprovals,
          }),
        );
      }
      this.updateUI();

      if (!this.onPermissionRequest) {
        return translate(this.locale, "agent.runtime.permissionAskResult", {
          reason: permission.reason,
        });
      }

      let decision: PermissionPromptDecision = "deny";
      try {
        const workspaceRoots = [this.workingDir, ...this.additionalWorkingDirectories]
          .filter((value): value is string => Boolean(value && value.trim().length > 0));
        decision = await this.onPermissionRequest({
          tool: tool.name,
          reason: permission.reason,
          suggestions,
          permissionMode: mode,
          riskClass: scopedRiskClass,
          priorApprovals: priorScopedApprovals,
          workspaceRoots: [...new Set(workspaceRoots)],
        });
      } catch {
        decision = "deny";
      }

      if (decision === "deny") {
        this.pushQueryEvent({
          type: "permission_decision",
          tool: tool.name,
          behavior: "deny",
          reason: translate(this.locale, "agent.runtime.permissionReason.deniedByUser"),
          riskClass: permission.riskClass ?? "policy",
          at: Date.now(),
        });
        this.appendStepLog(step, translate(this.locale, "agent.runtime.permissionDeniedByUserLog"));
        this.deniedToolCallSignatures.add(toolCallSignature);
        this.updateUI();
        return translate(this.locale, "agent.runtime.permissionDeniedResult", {
          reason: permission.reason,
        });
      }

      if (decision === "allow_session") {
        const sessionRule = this.createSessionPermissionRule(tool.name, suggestions[0]?.draft);
        this.permissionRules = [...this.permissionRules, sessionRule];
        this.pushQueryEvent({
          type: "permission_decision",
          tool: tool.name,
          behavior: "allow",
          reason: translate(this.locale, "agent.runtime.permissionReason.allowedSession", {
            ruleId: sessionRule.id,
          }),
          riskClass: permission.riskClass ?? "policy",
          at: Date.now(),
        });
        this.appendStepLog(
          step,
          translate(this.locale, "agent.runtime.permissionAllowedSessionLog", {
            ruleId: sessionRule.id,
          }),
        );
        this.noteScopedAuthorization(tool.name, permission.riskClass, step);
        this.updateUI();
      } else {
        this.pushQueryEvent({
          type: "permission_decision",
          tool: tool.name,
          behavior: "allow",
          reason: translate(this.locale, "agent.runtime.permissionReason.allowedOnce"),
          riskClass: permission.riskClass ?? "policy",
          at: Date.now(),
        });
        this.appendStepLog(step, translate(this.locale, "agent.runtime.permissionAllowedOnceLog"));
        this.noteScopedAuthorization(tool.name, permission.riskClass, step);
        this.updateUI();
      }
    }

    const maxChars = tool.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

    // Create a simple ToolContext  
    const context = {
      log: (message: string) => {
        this.enqueueStepLog(step, message);
      },
      getAppState: () => ({
        permissionMode: mode,
        permissionRules: this.permissionRules,
        additionalWorkingDirectories: this.additionalWorkingDirectories,
        workingDir: this.workingDir,
        threadId: this.threadId,
      }),
      abortSignal: this.abortController?.signal ?? new AbortController().signal,
      workingDir: this.workingDir,
      threadId: this.threadId,
      turnId: this.activeTurnId,
    };

    try {
      const result = await tool.call(validated.data as never, context);
      const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return truncateToolOutput(output, maxChars);
    } catch (error) {
      return formatToolExecutionError(toolCall.function.name, error);
    }
  }

  /**
   * The core multi-turn tool-use loop.
   * Inspired by claude-code's queryLoop async generator pattern.
   */
  public getQueueCount(): number {
    return this.runtimeSnapshot.queueCount;
  }

  public getQueueLimit(): number {
    return MAX_QUEUED_QUERIES;
  }

  public getQueuedQueries(): QueuedQueryItem[] {
    return this.runtimeSnapshot.queuedQueries.map((item) => ({ ...item }));
  }

  public setQueuedQueryPriority(queueId: string, priority: QueuePriority): boolean {
    const index = this.messageQueue.findIndex((item) => item.id === queueId);
    if (index < 0) {
      return false;
    }
    const current = this.messageQueue[index];
    if (!current) {
      return false;
    }
    if (current.priority === priority) {
      return true;
    }
    this.messageQueue[index] = {
      ...current,
      priority,
    };
    this.updateUI(true);
    return true;
  }

  public removeQueuedQuery(queueId: string): boolean {
    const index = this.messageQueue.findIndex((item) => item.id === queueId);
    if (index < 0) {
      return false;
    }
    const [removedItem] = this.messageQueue.splice(index, 1);
    const removed = Boolean(removedItem);
    if (removed) {
      this.emitCommandLifecycleEvent(
        {
          id: removedItem.commandId,
          command: removedItem.commandLabel,
          lane: "background",
          queued: true,
        },
        "aborted",
        {
          terminalReason: "aborted",
        },
      );
      this.updateUI(true);
    }
    return removed;
  }

  public popQueuedQueryToDraft(queueId: string): QueuedQueryItem | null {
    const index = this.messageQueue.findIndex((item) => item.id === queueId);
    if (index < 0) {
      return null;
    }
    const [item] = this.messageQueue.splice(index, 1);
    if (item) {
      this.emitCommandLifecycleEvent(
        {
          id: item.commandId,
          command: item.commandLabel,
          lane: "background",
          queued: true,
        },
        "aborted",
        {
          terminalReason: "aborted",
        },
      );
    }
    this.updateUI(true);
    return item ? { ...item } : null;
  }

  private shouldIncomingQueryPreemptCandidate(
    incomingPriority: QueuePriority,
    candidate: QueuedQueryItem,
    now = Date.now(),
  ): boolean {
    const incomingEffectiveRank = Math.max(0, QUEUE_PRIORITY_RANK[incomingPriority]);
    const candidateEffectiveRank = computeEffectiveQueuePriorityRank(candidate, now);
    if (incomingEffectiveRank < candidateEffectiveRank) {
      return true;
    }
    if (incomingEffectiveRank > candidateEffectiveRank) {
      return false;
    }
    const incomingBaseRank = QUEUE_PRIORITY_RANK[incomingPriority];
    const candidateBaseRank = QUEUE_PRIORITY_RANK[candidate.priority];
    return incomingBaseRank < candidateBaseRank;
  }

  private pickQueuePreemptionCandidate(now = Date.now()): QueuedQueryItem | null {
    if (this.messageQueue.length === 0) {
      return null;
    }
    let worst = this.messageQueue[0] ?? null;
    if (!worst) {
      return null;
    }
    for (let index = 1; index < this.messageQueue.length; index += 1) {
      const current = this.messageQueue[index];
      if (!current) {
        continue;
      }
      const worstCmp = compareQueueItemsByDispatchOrder(worst, current, now);
      if (worstCmp < 0) {
        // current is worse (later dispatch order), so it is a better preemption candidate.
        worst = current;
      }
    }
    return worst;
  }

  private findDuplicateQueuedQueryIndex(options: {
    query: string;
    model: string;
    permissionMode: ToolPermissionMode;
  }): number {
    const incomingFingerprint = [
      normalizeQueuedQueryForFingerprint(options.query),
      options.model.trim(),
      options.permissionMode,
    ].join("::");
    for (let index = 0; index < this.messageQueue.length; index += 1) {
      const item = this.messageQueue[index];
      if (!item) continue;
      const itemFingerprint = [
        normalizeQueuedQueryForFingerprint(item.query),
        item.model.trim(),
        item.permissionMode,
      ].join("::");
      if (itemFingerprint === incomingFingerprint) {
        return index;
      }
    }
    return -1;
  }

  private enqueueWhenBusy(options: {
    query: string;
    model: string;
    permissionMode: ToolPermissionMode;
    priority: QueuePriority;
    commandLifecycle: CommandLifecycleContext;
  }): {
    accepted: boolean;
    queueCount: number;
    queueLimit: number;
    queuedItem?: QueuedQueryItem;
    preemptedItem?: QueuedQueryItem;
  } {
    const queueLimit = MAX_QUEUED_QUERIES;
    const now = Date.now();
    let preemptedItem: QueuedQueryItem | undefined;

    const duplicateIndex = this.findDuplicateQueuedQueryIndex({
      query: options.query,
      model: options.model,
      permissionMode: options.permissionMode,
    });
    if (duplicateIndex >= 0) {
      const duplicate = this.messageQueue[duplicateIndex];
      if (duplicate) {
        const shouldPromotePriority =
          QUEUE_PRIORITY_RANK[options.priority] < QUEUE_PRIORITY_RANK[duplicate.priority];
        if (shouldPromotePriority) {
          duplicate.priority = options.priority;
        }
        if (duplicate.commandId !== options.commandLifecycle.id) {
          this.emitCommandLifecycleEvent(
            {
              id: duplicate.commandId,
              command: duplicate.commandLabel,
              lane: "background",
              queued: true,
            },
            "aborted",
            {
              terminalReason: "aborted",
              at: now,
            },
          );
          duplicate.commandId = options.commandLifecycle.id;
          duplicate.commandLabel = options.commandLifecycle.command;
        }
        this.pushQueryEvent({
          type: "queue_update",
          action: "queued",
          queueCount: this.messageQueue.length,
          queueLimit,
          reason: "deduplicated",
          priority: duplicate.priority,
          at: now,
        });
        return {
          accepted: true,
          queueCount: this.messageQueue.length,
          queueLimit,
          queuedItem: { ...duplicate },
        };
      }
    }

    if (this.messageQueue.length >= queueLimit) {
      const candidate = this.pickQueuePreemptionCandidate(now);
      if (!candidate || !this.shouldIncomingQueryPreemptCandidate(options.priority, candidate, now)) {
        this.pushQueryEvent({
          type: "queue_update",
          action: "rejected",
          queueCount: this.messageQueue.length,
          queueLimit,
          reason: "capacity",
          priority: options.priority,
          at: now,
        });
        return {
          accepted: false,
          queueCount: this.messageQueue.length,
          queueLimit,
        };
      }

      const candidateIndex = this.messageQueue.findIndex((item) => item.id === candidate.id);
      if (candidateIndex < 0) {
        this.pushQueryEvent({
          type: "queue_update",
          action: "rejected",
          queueCount: this.messageQueue.length,
          queueLimit,
          reason: "capacity",
          priority: options.priority,
          at: now,
        });
        return {
          accepted: false,
          queueCount: this.messageQueue.length,
          queueLimit,
        };
      }

      const [removed] = this.messageQueue.splice(candidateIndex, 1);
      if (removed) {
        preemptedItem = removed;
        this.emitCommandLifecycleEvent(
          {
            id: removed.commandId,
            command: removed.commandLabel,
            lane: "background",
            queued: true,
          },
          "aborted",
          {
            terminalReason: "aborted",
            at: now,
          },
        );
        this.pushQueryEvent({
          type: "queue_update",
          action: "rejected",
          queueCount: this.messageQueue.length,
          queueLimit,
          reason: "capacity",
          priority: removed.priority,
          at: now,
        });
      }
    }

    const queuedItem: QueuedQueryItem = {
      id: this.makeId(),
      query: options.query,
      model: options.model,
      permissionMode: options.permissionMode,
      queuedAt: now,
      commandId: options.commandLifecycle.id,
      commandLabel: options.commandLifecycle.command,
      priority: options.priority,
    };
    this.messageQueue.push(queuedItem);
    this.pushQueryEvent({
      type: "queue_update",
      action: "queued",
      queueCount: this.messageQueue.length,
      queueLimit,
      priority: options.priority,
      at: now,
    });

    return {
      accepted: true,
      queueCount: this.messageQueue.length,
      queueLimit,
      queuedItem,
      preemptedItem,
    };
  }

  private dequeueNextQueuedQuery(): QueuedQueryItem | undefined {
    if (this.messageQueue.length === 0) {
      this.consecutiveNowDequeues = 0;
      return undefined;
    }
    const now = Date.now();
    let bestIndex = 0;
    let bestItem = this.messageQueue[0];
    if (!bestItem) {
      return undefined;
    }
    for (let index = 1; index < this.messageQueue.length; index += 1) {
      const item = this.messageQueue[index];
      if (!item) continue;
      if (compareQueueItemsByDispatchOrder(item, bestItem, now) < 0) {
        bestIndex = index;
        bestItem = item;
      }
    }
    if (
      bestItem.priority === "now" &&
      this.consecutiveNowDequeues >= MAX_CONSECUTIVE_NOW_DEQUEUES
    ) {
      let fairnessIndex = -1;
      let fairnessCandidate: QueuedQueryItem | undefined;
      for (let index = 0; index < this.messageQueue.length; index += 1) {
        const item = this.messageQueue[index];
        if (!item || item.priority === "now") {
          continue;
        }
        if (!fairnessCandidate || compareQueueItemsByDispatchOrder(item, fairnessCandidate, now) < 0) {
          fairnessCandidate = item;
          fairnessIndex = index;
        }
      }
      if (fairnessCandidate && fairnessIndex >= 0) {
        bestItem = fairnessCandidate;
        bestIndex = fairnessIndex;
      }
    }
    const [next] = this.messageQueue.splice(bestIndex, 1);
    if (next?.priority === "now") {
      this.consecutiveNowDequeues += 1;
    } else {
      this.consecutiveNowDequeues = 0;
    }
    return next;
  }

  public getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  public getSlashCommands(): SlashCommandDescriptor[] {
    return this.commandRegistry.getDescriptors(this.locale);
  }

  public getLastTerminal(): Terminal | null {
    return this.lastTerminal;
  }

  public getLastContinue(): Continue | null {
    return this.lastContinue;
  }

  public getQueryStreamSnapshot(): QueryStreamSnapshot {
    return {
      events: [...this.queryEvents],
      lastTerminal: this.lastTerminal,
    };
  }

  public getRecentQueryEvents(limit = 24): QueryStreamEvent[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 24;
    const events = this.runtimeSnapshot.recentEvents;
    if (safeLimit === 0 || events.length === 0) {
      return [];
    }
    if (events.length <= safeLimit) {
      return events.slice();
    }
    return events.slice(events.length - safeLimit);
  }

  public clearQueryEvents() {
    if (this.queryEvents.length === 0) {
      return;
    }
    this.queryEvents = [];
    this.markQueryEventsChanged();
    this.refreshRuntimeSnapshot();
    this.updateUI(true);
  }

  public getLatestQueryEvent(): QueryStreamEvent | null {
    return this.runtimeSnapshot.latestEvent ?? null;
  }

  public getLastQueryEventAt(): number | null {
    return this.runtimeSnapshot.lastEventAt;
  }

  public setPermissionMode(mode: ToolPermissionMode) {
    this.permissionMode = mode;
  }

  public setStopHooks(hooks: StopHook[]) {
    this.stopHooks = [...hooks];
    this.useDefaultStopHooks = false;
  }

  public setTokenBudget(budget: TokenBudgetConfig | null) {
    this.tokenBudget = budget;
  }

  public getToolCallBudgetPolicy(): ToolCallBudgetPolicy {
    return { ...this.toolCallBudgetPolicy };
  }

  public setToolCallBudgetPolicy(
    patch: Partial<ToolCallBudgetPolicy> | null,
    options: { notify?: boolean } = {},
  ): ToolCallBudgetPolicy {
    const next = patch
      ? normalizeToolCallBudgetPolicy({ ...this.toolCallBudgetPolicy, ...patch })
      : normalizeToolCallBudgetPolicy(DEFAULT_TOOL_CALL_BUDGET_POLICY);
    if (areToolCallBudgetPoliciesEqual(this.toolCallBudgetPolicy, next)) {
      return { ...this.toolCallBudgetPolicy };
    }
    this.toolCallBudgetPolicy = next;
    if (options.notify !== false) {
      this.onToolCallBudgetPolicyChange?.({ ...next });
    }
    return { ...next };
  }

  public setFallbackModel(model: string | undefined) {
    this.fallbackModel = model;
  }

  public setWorkingDir(dir: string | undefined) {
    if (this.workingDir !== dir) {
      this.cachedGitSnapshot = null;
      this.cachedGitSnapshotDir = undefined;
      this.cachedGitSnapshotAt = 0;
    }
    this.workingDir = dir;
  }

  public setPermissionRules(rules: PermissionRule[]) {
    this.permissionRules = [...rules];
  }

  public addPermissionRule(rule: PermissionRule) {
    this.permissionRules = [...this.permissionRules, rule];
  }

  public removePermissionRule(ruleId: string) {
    this.permissionRules = this.permissionRules.filter((rule) => rule.id !== ruleId);
  }

  public clearPermissionRules() {
    this.permissionRules = [];
  }

  public getPermissionRules(): PermissionRule[] {
    return [...this.permissionRules];
  }

  public setAdditionalWorkingDirectories(dirs: string[]) {
    this.additionalWorkingDirectories = [...dirs];
  }

  public setThreadId(threadId: string | undefined) {
    this.threadId = threadId;
  }

  public setLocale(locale: AppLocale) {
    this.locale = locale;
    if (this.useDefaultStopHooks) {
      this.stopHooks = createDefaultStopHooks(locale);
    }
  }

  private async loadRuntimeGitSnapshot(): Promise<RuntimeGitSnapshot | null> {
    const workingDir = this.workingDir?.trim();
    if (!workingDir) {
      return null;
    }

    const now = Date.now();
    if (
      this.cachedGitSnapshot &&
      this.cachedGitSnapshotDir === workingDir &&
      now - this.cachedGitSnapshotAt < GIT_SNAPSHOT_CACHE_TTL_MS
    ) {
      return this.cachedGitSnapshot;
    }

    try {
      const snapshot = await invoke<RuntimeGitSnapshot>("invoke_agent_git_snapshot", {
        request: {
          working_dir: workingDir,
          max_commits: 5,
        },
      });
      this.cachedGitSnapshot = snapshot;
      this.cachedGitSnapshotDir = workingDir;
      this.cachedGitSnapshotAt = now;
      return snapshot;
    } catch (error) {
      const failedSnapshot: RuntimeGitSnapshot = {
        success: false,
        working_dir: workingDir,
        is_git_repo: false,
        status_short: [],
        recent_commits: [],
        error: String(error),
      };
      this.cachedGitSnapshot = failedSnapshot;
      this.cachedGitSnapshotDir = workingDir;
      this.cachedGitSnapshotAt = now;
      return failedSnapshot;
    }
  }

  private buildRuntimeContext(mode?: ToolPermissionMode, gitSnapshot?: RuntimeGitSnapshot | null): string {
    const now = new Date();
    const localTime = now.toLocaleString(this.locale, { hour12: false });

    const gitSection = (() => {
      if (!gitSnapshot) {
        return "- Git snapshot: unavailable (no workspace configured).";
      }
      if (!gitSnapshot.is_git_repo) {
        return "- Git snapshot: workspace is not a Git repository.";
      }
      const branch = gitSnapshot.branch?.trim() || "(unknown)";
      const base = gitSnapshot.default_branch?.trim() || "(unknown)";
      const statusLines = gitSnapshot.status_short.length
        ? gitSnapshot.status_short.slice(0, 8).join(" | ")
        : "clean";
      const commits = gitSnapshot.recent_commits.length
        ? gitSnapshot.recent_commits.slice(0, 5).join(" | ")
        : "(no commits)";
      return [
        `- Git branch: ${branch} (default: ${base})`,
        `- Git status (short): ${statusLines}`,
        `- Recent commits: ${commits}`,
      ].join("\n");
    })();

    return [
      `- Current local datetime: ${localTime}`,
      `- Current thread ID: ${this.threadId ?? "(not set)"}`,
      `- Current working directory: ${this.workingDir ?? "(not set)"}`,
      `- Workspace policy: Unless the user explicitly requests another path, read/write/analyze only within Current working directory.`,
      `- Tool permission mode: ${mode ?? this.permissionMode}`,
      `- Permission rules loaded: ${this.permissionRules.length}`,
      `- Additional working directories: ${this.additionalWorkingDirectories.length}`,
      `- Query queue depth: ${this.messageQueue.length}/${MAX_QUEUED_QUERIES}`,
      `- Safety caps: max iterations=${MAX_TOOL_LOOP_ITERATIONS}, max tool calls per query=${MAX_TOOL_CALLS_PER_QUERY}`,
      `- Background tasks: ${this.taskManager.listTasks().length}`,
      gitSection,
    ].join("\n");
  }

  private parseToolArgsSafe(raw: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private parseShellTokens(script: string): string[] {
    return script.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) ?? [];
  }

  private getNormalizedShellCommand(
    args: Record<string, unknown> | null,
  ): { command: string; argv: string[]; rawCommand: string } | null {
    if (!args) return null;

    const rawCommand = String(args.cmd ?? "").trim();
    if (!rawCommand) return null;

    const cmd = rawCommand.toLowerCase();
    const argv = Array.isArray(args.args)
      ? (args.args as unknown[]).map((item) => String(item))
      : [];

    const normalizedFromTokens = (tokens: string[]) => {
      if (tokens.length === 0) return null;
      const normalized = tokens.map((token) => this.normalizeShellToken(token)).filter(Boolean);
      if (normalized.length === 0) return null;
      return {
        command: normalized[0].toLowerCase(),
        argv: normalized.slice(1),
        rawCommand: normalized.join(" "),
      };
    };

    if (cmd === "cmd" && argv.length >= 2 && argv[0].toLowerCase() === "/c") {
      const commandPart = argv.slice(1);
      const tokens =
        commandPart.length === 1
          ? this.parseShellTokens(commandPart[0])
          : commandPart;
      return normalizedFromTokens(tokens);
    }

    if (cmd === "powershell" || cmd === "pwsh") {
      const commandIndex = argv.findIndex((arg) => {
        const normalized = arg.toLowerCase();
        return normalized === "-command" || normalized === "-c";
      });
      if (commandIndex >= 0 && argv[commandIndex + 1]) {
        const script = argv.slice(commandIndex + 1).join(" ");
        const parsed = normalizedFromTokens(this.parseShellTokens(script));
        if (parsed) return parsed;
      }
      return normalizedFromTokens([cmd, ...argv]);
    }

    return {
      command: cmd,
      argv: argv.map((token) => this.normalizeShellToken(token)).filter(Boolean),
      rawCommand: [rawCommand, ...argv].join(" ").trim(),
    };
  }

  private hasShellMetaTokens(values: string[]): boolean {
    return values.some((value) => /[|&;<>]/.test(value));
  }

  private detectDedicatedToolHintFromShell(
    args: Record<string, unknown> | null,
  ): { tool: string; reason: string; command: string } | null {
    const normalized = this.getNormalizedShellCommand(args);
    if (!normalized) return null;

    const { command, argv, rawCommand } = normalized;
    if (this.hasShellMetaTokens([rawCommand, ...argv])) {
      return null;
    }

    if (["cat", "type", "head", "tail", "sed", "more", "less", "get-content"].includes(command)) {
      return {
        tool: "file_read",
        reason: translate(this.locale, "agent.runtime.preferDedicatedToolReason.read"),
        command: rawCommand,
      };
    }

    if (["ls", "dir", "find", "tree", "get-childitem"].includes(command)) {
      return {
        tool: "list_dir",
        reason: translate(this.locale, "agent.runtime.preferDedicatedToolReason.list"),
        command: rawCommand,
      };
    }

    if (["grep", "rg", "findstr", "select-string"].includes(command)) {
      return {
        tool: "grep",
        reason: translate(this.locale, "agent.runtime.preferDedicatedToolReason.search"),
        command: rawCommand,
      };
    }

    return null;
  }

  private normalizeShellToken(token: string): string {
    const trimmed = token.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`"))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  private extractDeleteTargetFromTokens(tokens: string[]): string | null {
    if (tokens.length === 0) return null;
    const deleteCommands = new Set(["rm", "del", "erase", "remove-item", "ri", "rmdir", "rd"]);
    const optionNeedsValue = new Set(["-path", "-literalpath"]);
    const command = tokens[0].toLowerCase();
    if (!deleteCommands.has(command)) return null;

    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      const lower = token.toLowerCase();

      if (optionNeedsValue.has(lower)) {
        const nextToken = tokens[i + 1];
        if (nextToken) {
          return this.normalizeShellToken(nextToken);
        }
        continue;
      }

      if (token.startsWith("-") || token.startsWith("/")) {
        continue;
      }

      return this.normalizeShellToken(token);
    }

    return null;
  }

  private extractShellDeleteTarget(args: Record<string, unknown> | null): string | null {
    if (!args) return null;
    const cmd = String(args.cmd ?? "").trim().toLowerCase();
    const argv = Array.isArray(args.args)
      ? (args.args as unknown[]).map((item) => String(item))
      : [];

    if (
      cmd === "rm" ||
      cmd === "del" ||
      cmd === "erase" ||
      cmd === "remove-item" ||
      cmd === "ri" ||
      cmd === "rmdir" ||
      cmd === "rd"
    ) {
      return this.extractDeleteTargetFromTokens([cmd, ...argv]);
    }

    if (cmd === "cmd" && argv.length >= 2 && argv[0].toLowerCase() === "/c") {
      const commandPart = argv.slice(1);
      const cmdTokens =
        commandPart.length === 1
          ? this.parseShellTokens(commandPart[0])
          : commandPart;
      const target = this.extractDeleteTargetFromTokens(cmdTokens);
      if (target) {
        return target;
      }
    }

    if (cmd === "powershell" || cmd === "pwsh") {
      const commandIndex = argv.findIndex((arg) => {
        const normalized = arg.toLowerCase();
        return normalized === "-command" || normalized === "-c";
      });
      if (commandIndex >= 0 && argv[commandIndex + 1]) {
        const script = argv.slice(commandIndex + 1).join(" ");
        const targetFromScript = this.extractDeleteTargetFromTokens(this.parseShellTokens(script));
        if (targetFromScript) {
          return targetFromScript;
        }
      }
      const directTarget = this.extractDeleteTargetFromTokens(argv);
      if (directTarget) {
        return directTarget;
      }
    }

    return null;
  }

  private formatToolStepTitle(toolCall: LLMToolCall): string {
    const args = this.parseToolArgsSafe(toolCall.function.arguments);

    if (toolCall.function.name === "file_write") {
      const path = String(args?.path ?? "").trim();
      if (path) {
        return translate(this.locale, "agent.stepTitle.editedPath", { path });
      }
      return translate(this.locale, "agent.stepTitle.editedFile");
    }

    if (toolCall.function.name === "shell") {
      const deleteTarget = this.extractShellDeleteTarget(args);
      if (deleteTarget) {
        return translate(this.locale, "agent.stepTitle.deletedPath", { path: deleteTarget });
      }
      const cmd = String(args?.cmd ?? "").trim();
      const argv = Array.isArray(args?.args)
        ? (args?.args as unknown[]).map((item) => String(item)).join(" ")
        : "";
      const preview = `${cmd}${argv ? ` ${argv}` : ""}`.trim();
      if (preview) {
        return translate(this.locale, "agent.stepTitle.executedCommandPreview", { command: preview });
      }
      return translate(this.locale, "agent.stepTitle.executedCommand");
    }

    const argsSummary = this.summarizeArgs(toolCall.function.arguments);
    return translate(this.locale, "agent.stepTitle.toolCall", {
      tool: toolCall.function.name,
      args: argsSummary,
    });
  }

  private mapNaturalLanguageToSlashCommand(query: string): string | null {
    const trimmed = query.trim();
    if (!trimmed || trimmed.startsWith("/")) {
      return null;
    }

    // Keep this conservative to avoid hijacking normal coding prompts.
    if (trimmed.length > 120 || trimmed.includes("\n")) {
      return null;
    }

    const lower = trimmed.toLowerCase();
    const matchesAny = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(trimmed));
    const hasAny = (keywords: string[]) => keywords.some((keyword) => lower.includes(keyword));
    const hasZhAny = (keywords: string[]) => keywords.some((keyword) => trimmed.includes(keyword));

    const stopTaskMatch =
      trimmed.match(/^(?:stop|kill)\s+task\s+([a-z0-9_-]+)\s*$/i) ??
      trimmed.match(
        /^(?:\u505c\u6b62|\u7ec8\u6b62|\u7ed3\u675f)\s*\u4efb\u52a1\s*([a-zA-Z0-9_-]+)\s*$/u,
      );
    if (stopTaskMatch?.[1]) {
      return `/task stop ${stopTaskMatch[1]}`;
    }

    const taskOutputMatch =
      trimmed.match(/^(?:task\s+output|show\s+task\s+output)\s+([a-z0-9_-]+)(?:\s+(\d+))?\s*$/i) ??
      trimmed.match(
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b)?\s*\u4efb\u52a1\s*([a-zA-Z0-9_-]+)\s*(?:\u8f93\u51fa|\u65e5\u5fd7)(?:\s+(\d+))?\s*$/u,
      );
    if (taskOutputMatch?.[1]) {
      const limit = taskOutputMatch[2];
      return limit ? `/task output ${taskOutputMatch[1]} ${limit}` : `/task output ${taskOutputMatch[1]}`;
    }

    if (
      matchesAny([
        /^(?:status|show status|queue status|engine status)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b)?\s*(?:\u5f53\u524d)?(?:\u72b6\u6001|\u961f\u5217\u72b6\u6001|\u5f15\u64ce\u72b6\u6001)\s*$/u,
      ])
    ) {
      return "/status";
    }

    if (
      matchesAny([
        /^(?:queue|show queue|queue list|list queue|queued commands?)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b|\u663e\u793a)?\s*(?:\u961f\u5217|\u6392\u961f|\u7b49\u5f85\u961f\u5217)\s*$/u,
      ]) ||
      hasAny(["show queue", "queue list", "queued commands", "queued queries"]) ||
      hasZhAny(["\u67e5\u770b\u961f\u5217", "\u6392\u961f\u5217\u8868", "\u7b49\u5f85\u961f\u5217"])
    ) {
      return "/queue list";
    }

    if (
      matchesAny([
        /^(?:clear|reset)\s+queue\s*$/i,
        /^(?:\u6e05\u7a7a|\u91cd\u7f6e)\s*(?:\u961f\u5217|\u6392\u961f)\s*$/u,
      ])
    ) {
      return "/queue clear";
    }

    if (
      matchesAny([
        /^(?:queue\s+ops|queue\s+history|queue\s+events?|show\s+queue\s+history)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b|\u663e\u793a)?\s*(?:\u961f\u5217\u5386\u53f2|\u961f\u5217\u4e8b\u4ef6|\u961f\u5217\u64cd\u4f5c\u8bb0\u5f55)\s*$/u,
      ]) ||
      hasAny(["queue history", "queue events", "queue ops"]) ||
      hasZhAny(["队列历史", "队列事件", "队列操作记录"])
    ) {
      return "/queue ops";
    }

    if (
      matchesAny([
        /^(?:queue\s+summary|queue\s+ops\s+summary|summarize\s+queue)\s*$/i,
        /^(?:\u961f\u5217\u6c47\u603b|\u961f\u5217\u7edf\u8ba1|\u6c47\u603b\u961f\u5217)\s*$/u,
      ]) ||
      hasAny(["queue summary", "queue stats", "summarize queue"]) ||
      hasZhAny(["队列汇总", "队列统计"])
    ) {
      return "/queue ops summary";
    }

    if (
      matchesAny([
        /^(?:queue\s+compact|queue\s+dedupe|dedupe\s+queue|compact\s+queue)\s*$/i,
        /^(?:\u961f\u5217)?(?:\u53bb\u91cd|\u538b\u7f29)\s*(?:\u961f\u5217)?\s*$/u,
      ]) ||
      hasAny(["queue compact", "queue dedupe", "dedupe queue"]) ||
      hasZhAny(["队列去重", "压缩队列"])
    ) {
      return "/queue compact";
    }

    if (
      matchesAny([
        /^(?:queue\s+heal|heal\s+queue|queue\s+repair|relieve\s+queue)\s*$/i,
        /^(?:\u961f\u5217)?(?:\u81ea\u6108|\u4fee\u590d|\u758f\u901a|\u7f13\u89e3\u62e5\u585e)\s*(?:\u961f\u5217)?\s*$/u,
      ]) ||
      hasAny(["queue heal", "heal queue", "queue repair", "relieve queue", "unblock queue"]) ||
      hasZhAny(["队列自愈", "修复队列", "疏通队列", "缓解队列拥塞"])
    ) {
      return "/queue heal";
    }

    if (
      matchesAny([
        /^(?:investigate\s+queue|queue\s+diagnose|queue\s+doctor|queue\s+investigation)\s*$/i,
        /^(?:\u961f\u5217)?(?:\u8bca\u65ad|\u6392\u67e5|\u8c03\u67e5)\s*(?:\u961f\u5217)?\s*$/u,
      ]) ||
      hasAny(["investigate queue", "queue diagnose", "queue doctor", "queue investigation"]) ||
      hasZhAny(["诊断队列", "排查队列", "调查队列", "队列诊断"])
    ) {
      return "/doctor queue investigate";
    }

    if (
      matchesAny([
        /^(?:investigate|diagnose|debug)\s+(?:recover|recovery|resume)\s*$/i,
        /^(?:recover|recovery)\s+(?:investigate|diagnose|debug)\s*$/i,
        /^(?:\u6392\u67e5|\u8bca\u65ad|\u8c03\u67e5)\s*(?:\u6062\u590d|\u4e2d\u65ad|\u7eed\u8dd1)\s*$/u,
      ]) ||
      hasAny([
        "recover investigate",
        "recovery investigate",
        "investigate recover",
        "diagnose recovery",
        "debug recovery",
        "interrupted turn recovery",
      ]) ||
      hasZhAny(["恢复排查", "恢复诊断", "中断回合排查", "中断恢复", "续跑排查"])
    ) {
      return "/doctor recover investigate";
    }

    if (
      matchesAny([
        /^(?:recover|recovery|resume)\s+(?:plan|strategy|runbook|playbook)\s*$/i,
        /^(?:plan|strategy)\s+(?:recover|recovery|resume)\s*$/i,
        /^(?:\u6062\u590d|\u7eed\u8dd1)\s*(?:\u8ba1\u5212|\u65b9\u6848|\u7b56\u7565)\s*$/u,
      ]) ||
      hasAny(["recover plan", "recovery plan", "recovery strategy", "resume plan", "recover runbook"]) ||
      hasZhAny(["恢复计划", "恢复方案", "恢复策略", "续跑计划", "恢复runbook"])
    ) {
      return "/recover plan";
    }

    if (
      matchesAny([
        /^(?:auto|smart)\s+(?:recover|resume)(?:\s+turn)?\s*$/i,
        /^(?:\u81ea\u52a8|\u667a\u80fd)\s*(?:\u6062\u590d|\u7eed\u8dd1)(?:\u4e2d\u65ad|\u56de\u5408)?\s*$/u,
      ]) ||
      hasAny(["auto recover", "smart recover", "auto resume", "smart resume"]) ||
      hasZhAny(["自动恢复", "智能恢复", "自动续跑", "智能续跑"])
    ) {
      return "/recover auto";
    }

    if (
      matchesAny([
        /^(?:recover|resume|recovery)\s+(?:strict|gate)\s*$/i,
        /^(?:execute|run)\s+(?:recover|recovery)\s+(?:strict|strictly)\s*$/i,
        /^(?:recover|recovery)\s+(?:execute|run)\s+(?:strict|strictly)\s*$/i,
        /^(?:\u4e25\u683c|\u4e25\u683c\u6a21\u5f0f|\u5f3a\u6821\u9a8c)?\s*(?:\u6267\u884c|\u8fd0\u884c)\s*(?:\u6062\u590d|\u7eed\u8dd1)\s*$/u,
      ]) ||
      hasAny([
        "recover strict",
        "recover gate",
        "resume strict",
        "recover execute strict",
        "strict recovery execute",
        "run strict recovery",
        "execute recovery strict",
      ]) ||
      hasZhAny([
        "\u4e25\u683c\u6062\u590d",
        "\u4e25\u683c\u6267\u884c\u6062\u590d",
        "\u4e25\u683c\u6a21\u5f0f\u6062\u590d",
        "\u5f3a\u6821\u9a8c\u6062\u590d",
      ])
    ) {
      return "/recover execute --strict";
    }

    if (
      matchesAny([
        /^(?:execute|run)\s+(?:recover|recovery)(?:\s+plan)?\s*$/i,
        /^(?:recover|recovery)\s+(?:execute|run)\s*$/i,
        /^(?:\u4e00\u952e|\u7acb\u5373|\u76f4\u63a5)?\s*(?:\u6267\u884c|运行)\s*(?:\u6062\u590d|\u7eed\u8dd1)\s*$/u,
      ]) ||
      hasAny(["recover execute", "execute recovery", "run recovery", "one-shot recovery"]) ||
      hasZhAny(["执行恢复", "一键恢复", "立即恢复执行", "直接恢复"])
    ) {
      return "/recover execute";
    }

    if (
      matchesAny([
        /^(?:recover|resume(?:\s+turn)?|resume\s+interrupted\s+turn|continue\s+where\s+left\s+off)\s*$/i,
        /^(?:\u6062\u590d|\u7eed\u8dd1|\u7ee7\u7eed)(?:\u4e0a\u6b21|\u4e2d\u65ad|\u672a\u5b8c\u6210)?(?:\u4efb\u52a1|\u4f1a\u8bdd|\u56de\u5408)?\s*$/u,
      ]) ||
      hasAny(["resume interrupted", "continue where left off", "recover turn"]) ||
      hasZhAny(["\u6062\u590d\u4e2d\u65ad", "\u7eed\u8dd1", "\u7ee7\u7eed\u4e0a\u6b21"])
    ) {
      return "/recover resume";
    }

    if (
      matchesAny([
        /^(?:trace|show trace|event log|events?|show events?|show trajectory)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b|\u663e\u793a)?\s*(?:\u8f68\u8ff9|\u6267\u884c\u8f68\u8ff9|\u4e8b\u4ef6|\u4e8b\u4ef6\u65e5\u5fd7)\s*$/u,
      ]) ||
      hasAny(["trace", "event log", "show events", "show trace"]) ||
      hasZhAny(["\u8f68\u8ff9", "\u6267\u884c\u8f68\u8ff9", "\u4e8b\u4ef6\u65e5\u5fd7"])
    ) {
      return "/trace";
    }

    if (
      matchesAny([
        /^(?:trace\s+hotspots?|show\s+hotspots?)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b|\u663e\u793a)?\s*(?:\u70ed\u70b9|\u6545\u969c\u70ed\u70b9|\u8f68\u8ff9\u70ed\u70b9)\s*$/u,
      ]) ||
      hasAny(["trace hotspots", "show hotspots", "hotspot tools", "hottest tool"]) ||
      hasZhAny(["\u70ed\u70b9", "\u6545\u969c\u70ed\u70b9", "\u8f68\u8ff9\u70ed\u70b9", "\u6700\u70ed\u70b9"])
    ) {
      return "/trace hotspots failure runs=6";
    }

    if (
      matchesAny([
        /^(?:investigate\s+and\s+execute\s+hotspot|execute\s+hotspot\s+investigation|auto\s+investigate\s+hotspot)\s*$/i,
        /^(?:立即|直接)?(?:调查|排查|分析).*(?:热点).*(?:执行|修复|处理)\s*$/u,
      ]) ||
      hasAny([
        "investigate and execute hotspot",
        "execute hotspot investigation",
        "auto investigate hotspot",
        "fix hottest hotspot",
      ]) ||
      hasZhAny(["直接调查并执行热点", "立即调查热点并执行", "调查热点并修复", "排查热点并执行"])
    ) {
      return "/trace investigate hottest runbook workflow failure runs=6 execute";
    }

    if (
      matchesAny([
        /^(?:investigate\s+hotspot|trace\s+investigate|investigate\s+trace)\s*$/i,
        /^(?:\u8c03\u67e5|\u6392\u67e5|\u5206\u6790)\s*(?:\u70ed\u70b9|\u6545\u969c\u70ed\u70b9|\u8f68\u8ff9\u70ed\u70b9)\s*$/u,
      ]) ||
      hasAny(["investigate hotspot", "trace investigate", "analyze hotspot"]) ||
      hasZhAny(["\u8c03\u67e5\u70ed\u70b9", "\u6392\u67e5\u70ed\u70b9", "\u5206\u6790\u70ed\u70b9"])
    ) {
      return "/trace investigate hottest runbook failure runs=6";
    }

    if (
      matchesAny([
        /^(?:clear|reset)\s+(?:trace|event\s*log|events?)\s*$/i,
        /^(?:\u6e05\u7406|\u6e05\u7a7a|\u91cd\u7f6e)\s*(?:\u8f68\u8ff9|\u4e8b\u4ef6|\u4e8b\u4ef6\u65e5\u5fd7)\s*$/u,
      ])
    ) {
      return "/trace clear";
    }

    if (
      matchesAny([/^(?:doctor|diagnostic(?:s)?|health\s*check|self[-\s]?check|system\s*check)\s*$/i]) ||
      hasAny(["doctor", "diagnostic", "health check", "status check", "system check"]) ||
      hasZhAny([
        "\u8bca\u65ad",
        "\u81ea\u68c0",
        "\u5065\u5eb7\u68c0\u67e5",
        "\u68c0\u67e5\u72b6\u6001",
        "\u7cfb\u7edf\u68c0\u67e5",
      ])
    ) {
      return "/doctor";
    }

    if (
      matchesAny([/^(?:usage|cost|token usage|session usage|show usage)\s*$/i]) ||
      hasAny(["usage", "cost", "token usage", "token cost", "show usage", "session usage"]) ||
      hasZhAny(["\u7528\u91cf", "\u6d88\u8017", "\u8d39\u7528", "\u82b1\u8d39", "\u6210\u672c"])
    ) {
      return "/usage";
    }

    if (
      matchesAny([
        /^(?:show|check|view)?\s*(?:git|repo(?:sitory)?)(?:\s+(?:status|snapshot|changes|commits?))?\s*$/i,
        /^(?:\u6700\u8fd1\u63d0\u4ea4|\u67e5\u770b\u6539\u52a8|\u5bf9\u6bd4\u6539\u52a8)\s*$/u,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b|\u5c55\u793a)?\s*(?:git|\u4ed3\u5e93)(?:\u72b6\u6001|\u5feb\u7167|\u6539\u52a8|\u53d8\u66f4|\u63d0\u4ea4\u8bb0\u5f55)?\s*$/u,
      ]) ||
      hasAny([
        "git status",
        "git snapshot",
        "repo status",
        "repository status",
        "branch status",
        "recent commits",
        "compare changes",
        "changed wrong",
        "code changed wrong",
      ]) ||
      hasZhAny([
        "git\u72b6\u6001",
        "\u4ed3\u5e93\u72b6\u6001",
        "\u5206\u652f\u72b6\u6001",
        "\u63d0\u4ea4\u8bb0\u5f55",
        "\u6539\u9519\u4e86",
        "\u6539\u574f\u4e86",
        "\u5bf9\u6bd4\u4fee\u6539",
        "\u67e5\u770b\u6539\u52a8",
      ])
    ) {
      return "/git";
    }

    if (
      matchesAny([
        /^(?:undo|rewind|rollback|restore|revert)(?:\s+(?:last|previous)\s+turn)?\s*$/i,
        /^(?:\u64a4\u9500|\u56de\u6eda|\u8fd8\u539f|\u56de\u9000)(?:\u4e0a\u4e00\u8f6e|\u4e0a\u8f6e|\u4e0a\u4e00\u56de\u5408|\u4e0a\u4e00\u6761)?(?:\u4fee\u6539|\u6539\u52a8|\u64cd\u4f5c)?\s*$/u,
      ]) ||
      hasAny([
        "rewind",
        "undo last turn",
        "undo this turn",
        "rollback last turn",
        "restore last turn",
        "revert last turn",
      ]) ||
      hasZhAny([
        "\u56de\u6eda\u4e0a\u4e00\u8f6e",
        "\u56de\u6eda\u4e0a\u8f6e",
        "\u64a4\u9500\u4e0a\u4e00\u8f6e",
        "\u8fd8\u539f\u4e0a\u4e00\u8f6e",
        "\u56de\u9000\u4e0a\u4e00\u8f6e",
      ])
    ) {
      return "/rewind last";
    }

    if (
      matchesAny([
        /^(?:permissions?|permission status)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b)?\s*(?:\u6743\u9650|\u6743\u9650\u72b6\u6001)\s*$/u,
      ])
    ) {
      return "/permissions";
    }

    if (
      matchesAny([
        /^(?:allow|grant)\s+(?:workspace\s+)?write(?:\s+permissions?)?\s*$/i,
        /^(?:\u5141\u8bb8|\u653e\u5f00|\u5f00\u542f).*(?:\u5de5\u4f5c\u533a).*(?:\u5199\u5165|\u5199\u6743\u9650)\s*$/u,
      ])
    ) {
      return "/permissions allow-workspace";
    }

    if (
      matchesAny([
        /^(?:clear|reset)\s+(?:permission\s+)?rules?\s*$/i,
        /^(?:\u6e05\u7a7a|\u91cd\u7f6e).*(?:\u6743\u9650).*(?:\u89c4\u5219)?\s*$/u,
      ])
    ) {
      return "/permissions clear-rules";
    }

    if (
      matchesAny([
        /^(?:tasks?|list tasks?|show tasks?)\s*$/i,
        /^(?:\u67e5\u770b|\u770b\u4e0b|\u770b\u770b)?\s*(?:\u4efb\u52a1\u5217\u8868|\u4efb\u52a1)\s*$/u,
      ])
    ) {
      return "/task list";
    }

    const taskPruneMatch =
      trimmed.match(/^(?:prune|cleanup|clean|clear)\s+(?:finished\s+)?tasks?(?:\s+(?:keep|retain)\s+(\d+))?\s*$/i) ??
      trimmed.match(
        /^(?:\u6e05\u7406|\u6e05\u9664|\u6574\u7406)\s*(?:\u5df2\u5b8c\u6210|\u540e\u53f0)?\s*\u4efb\u52a1(?:\s*(?:\u4fdd\u7559|keep|retain)\s*(\d+))?\s*$/u,
      );
    if (taskPruneMatch) {
      const keepRaw = taskPruneMatch[1];
      return keepRaw ? `/task prune ${keepRaw}` : "/task prune";
    }

    return null;
  }

  private submitFollowupQuery(
    query: string,
    options?: {
      model?: string;
      permissionMode?: ToolPermissionMode;
      priority?: QueuePriority;
    },
  ): {
    accepted: boolean;
    reason?: "empty" | "queue_full";
    queueCount: number;
    queueLimit: number;
    queuedId?: string;
    started?: boolean;
    commandId?: string;
  } {
    const queueLimit = MAX_QUEUED_QUERIES;
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        accepted: false,
        reason: "empty",
        queueCount: this.messageQueue.length,
        queueLimit,
      };
    }

    const targetModel = options?.model?.trim() || this.currentModel;
    if (!targetModel) {
      return {
        accepted: false,
        reason: "empty",
        queueCount: this.messageQueue.length,
        queueLimit,
      };
    }
    const targetPermissionMode = options?.permissionMode ?? this.permissionMode;
    const targetPriority = options?.priority ?? "next";
    const commandLifecycle: CommandLifecycleContext = {
      id: this.makeId(),
      command: trimmed,
      lane: this.isProcessing ? "background" : "foreground",
      queued: this.isProcessing,
    };

    if (this.isProcessing) {
      const enqueueResult = this.enqueueWhenBusy({
        query: trimmed,
        model: targetModel,
        permissionMode: targetPermissionMode,
        priority: targetPriority,
        commandLifecycle,
      });
      if (!enqueueResult.accepted) {
        this.updateUI(true);
        return {
          accepted: false,
          reason: "queue_full",
          queueCount: enqueueResult.queueCount,
          queueLimit: enqueueResult.queueLimit,
        };
      }
      this.emitCommandLifecycleEvent(commandLifecycle, "queued");
      this.updateUI();
      return {
        accepted: true,
        queueCount: enqueueResult.queueCount,
        queueLimit: enqueueResult.queueLimit,
        queuedId: enqueueResult.queuedItem?.id,
        started: false,
        commandId: commandLifecycle.id,
      };
    }

    setTimeout(() => {
      void this.processQuery(trimmed, targetModel, targetPermissionMode, "foreground", {
        ...commandLifecycle,
        priority: targetPriority,
      }).catch((error) => {
        console.error("[lumo-agent] followup-query:failed", {
          error: String(error),
        });
      });
    }, 10);

    return {
      accepted: true,
      queueCount: this.messageQueue.length,
      queueLimit,
      started: true,
      commandId: commandLifecycle.id,
    };
  }

  private async tryHandleSlashCommand(
    commandQuery: string,
    displayQuery: string | undefined,
    lifecycleContext: CommandLifecycleContext,
  ): Promise<{ handled: false } | { handled: true; success: boolean }> {
    const parsed = parseSlashCommand(commandQuery);
    if (!parsed) {
      return { handled: false };
    }
    const commandLabel = (displayQuery ?? commandQuery).trim() || commandQuery.trim();
    const lifecycle = {
      ...lifecycleContext,
      command: commandLabel,
    };
    this.emitCommandLifecycleEvent(lifecycle, "started");

    const userMsg: AgentMessage = {
      id: this.makeId(),
      role: "user",
      content: commandLabel,
    };
    this.messages.push(userMsg);

    const assistantMsg: AgentMessage = {
      id: this.makeId(),
      role: "assistant",
      content: "",
      status: "running",
      steps: [],
    };
    this.messages.push(assistantMsg);
    this.updateUI();

    try {
      const result = await this.commandRegistry.execute(parsed, {
        workingDir: this.workingDir,
        threadId: this.threadId,
        currentModel: this.currentModel,
        locale: this.locale,
        queueCount: this.messageQueue.length,
        queueLimit: MAX_QUEUED_QUERIES,
        queueByPriority: { ...this.runtimeSnapshot.queueByPriority },
        permissionMode: this.permissionMode,
        permissionRules: this.getPermissionRules(),
        addPermissionRules: (rules) => {
          this.permissionRules = [...this.permissionRules, ...rules];
        },
        clearPermissionRules: () => this.clearPermissionRules(),
        getToolNames: () => this.getToolNames(),
        getCommandDescriptors: () => this.commandRegistry.getDescriptors(this.locale),
        getMessages: () => this.getMessages(),
        getUsageSnapshot: () => this.getUsageSnapshot(),
        resetUsageSnapshot: () => this.resetUsageSnapshot(),
        getToolCallBudgetPolicy: () => this.getToolCallBudgetPolicy(),
        setToolCallBudgetPolicy: (patch) => this.setToolCallBudgetPolicy(patch),
        getRecentQueryEvents: (limit) => this.getRecentQueryEvents(limit),
        clearQueryEvents: () => this.clearQueryEvents(),
        getQueuedQueries: () => this.getQueuedQueries(),
        setQueuedQueryPriority: (queueId, priority) => this.setQueuedQueryPriority(queueId, priority),
        removeQueuedQuery: (queueId) => this.removeQueuedQuery(queueId),
        submitFollowupQuery: (query, options) => this.submitFollowupQuery(query, options),
        taskManager: this.taskManager,
        t: (key, vars) => translate(this.locale, key, vars),
      });
      assistantMsg.content = result.message;
      assistantMsg.status = result.error ? "error" : "completed";
    } catch (error) {
      assistantMsg.content = translate(this.locale, "agent.command.executionFailed", {
        error: String(error),
      });
      assistantMsg.status = "error";
    }
    const success = assistantMsg.status === "completed";
    this.emitCommandLifecycleEvent(lifecycle, success ? "completed" : "failed", {
      terminalReason: success ? "completed" : "slash_command_error",
    });
    this.updateUI();
    return { handled: true, success };
  }

  /**
   * High-level entry point that handles instruction queuing.
   */
  public async processQuery(
    query: string,
    model: string,
    modeSnapshot: ToolPermissionMode = this.permissionMode,
    executionLane: QueryExecutionLane = "foreground",
    commandLifecycleInput?: ProcessQueryInputSeed,
  ): Promise<ProcessQueryResult> {
    const normalizedQuery = query.trim();
    const queuePriority =
      commandLifecycleInput?.priority ??
      (executionLane === "background" ? "later" : "next");
    const commandLifecycle: CommandLifecycleContext = {
      id: commandLifecycleInput?.id ?? this.makeId(),
      command: (commandLifecycleInput?.command ?? normalizedQuery).trim() || normalizedQuery,
      lane: executionLane,
      queued: commandLifecycleInput?.queued ?? false,
    };

    const staleRemoved = this.pruneStaleQueuedQueries();
    if (staleRemoved > 0) {
      this.pushQueryEvent({
        type: "queue_update",
        action: "rejected",
        queueCount: this.messageQueue.length,
        queueLimit: MAX_QUEUED_QUERIES,
        reason: "stale",
        at: Date.now(),
      });
    }

    this.currentModel = model;
    const directSlashResult = await this.tryHandleSlashCommand(query, undefined, commandLifecycle);
    if (directSlashResult.handled) {
      return { state: "handled_as_command", commandId: commandLifecycle.id };
    }

    const mappedCommand = this.mapNaturalLanguageToSlashCommand(query);
    if (mappedCommand) {
      const mappedSlashResult = await this.tryHandleSlashCommand(mappedCommand, query, commandLifecycle);
      if (mappedSlashResult.handled) {
        return { state: "handled_as_command", commandId: commandLifecycle.id };
      }
    }

    if (this.isProcessing) {
      const enqueueResult = this.enqueueWhenBusy({
        query: normalizedQuery,
        model,
        permissionMode: modeSnapshot,
        priority: queuePriority,
        commandLifecycle,
      });
      if (!enqueueResult.accepted) {
        this.updateUI(true);
        return {
          state: "rejected",
          reason: "queue_full",
          queueCount: enqueueResult.queueCount,
          queueLimit: enqueueResult.queueLimit,
          commandId: commandLifecycle.id,
        };
      }
      this.emitCommandLifecycleEvent(
        {
          ...commandLifecycle,
          queued: true,
        },
        "queued",
      );
      this.updateUI();
      return {
        state: "queued",
        queueCount: enqueueResult.queueCount,
        queueLimit: enqueueResult.queueLimit,
        commandId: commandLifecycle.id,
      };
    }

    this.emitCommandLifecycleEvent(commandLifecycle, "started");
    this.isProcessing = true;
    this.abortQueuedProcessing = false;
    try {
      const stream = this.runQueryLoop(normalizedQuery, model, modeSnapshot, executionLane);
      while (true) {
        const next = await stream.next();
        if (next.done) {
          this.lastTerminal = next.value;
          break;
        }
        this.pushQueryEvent(next.value);
      }
      this.emitCommandLifecycleEvent(commandLifecycle, mapTerminalToCommandLifecycleState(this.lastTerminal), {
        terminalReason: this.lastTerminal?.reason,
      });
      return { state: "completed", commandId: commandLifecycle.id };
    } catch (error) {
      this.lastTerminal = { reason: "error", error };
      this.emitCommandLifecycleEvent(commandLifecycle, "failed", {
        terminalReason: "error",
      });
      return { state: "error", commandId: commandLifecycle.id };
    } finally {
      this.activeTurnId = undefined;
      this.activeRunningStep = null;
      this.activeAssistantMessage = null;
      // Pick up the next item in the queue if any
      this.isProcessing = false;
      this.taskManager.clearFinishedTasks();
      const staleDroppedInFinally = this.pruneStaleQueuedQueries();
      if (staleDroppedInFinally > 0) {
        this.pushQueryEvent({
          type: "queue_update",
          action: "rejected",
          queueCount: this.messageQueue.length,
          queueLimit: MAX_QUEUED_QUERIES,
          reason: "stale",
          at: Date.now(),
        });
      }
      const next = this.dequeueNextQueuedQuery();
      if (next && !this.abortQueuedProcessing) {
        this.pushQueryEvent({
          type: "queue_update",
          action: "dequeued",
          queueCount: this.messageQueue.length,
          queueLimit: MAX_QUEUED_QUERIES,
          priority: next.priority,
          at: Date.now(),
        });
        // Use timeout to break the promise chain and allow UI to breathe
        setTimeout(
          () =>
            this.processQuery(next.query, next.model, next.permissionMode, "background", {
              id: next.commandId,
              command: next.commandLabel,
              queued: true,
              priority: next.priority,
            }),
          10,
        );
      } else {
        if (this.abortQueuedProcessing) {
          const droppedItems: QueuedQueryItem[] = [];
          if (next) {
            droppedItems.push(next);
          }
          droppedItems.push(...this.messageQueue);
          const droppedByAbort = droppedItems.length;
          for (const dropped of droppedItems) {
            this.emitCommandLifecycleEvent(
              {
                id: dropped.commandId,
                command: dropped.commandLabel,
                lane: "background",
                queued: true,
              },
              "aborted",
              {
                terminalReason: "aborted",
              },
            );
          }
          this.messageQueue = [];
          this.consecutiveNowDequeues = 0;
          this.abortQueuedProcessing = false;
          if (droppedByAbort > 0) {
            this.pushQueryEvent({
              type: "queue_update",
              action: "rejected",
              queueCount: 0,
              queueLimit: MAX_QUEUED_QUERIES,
              reason: "manual",
              at: Date.now(),
            });
          }
        }
        this.updateUI();
      }
    }
  }

  private compactStepLogsForHistory(step: AgentStepData) {
    if (step.logs.length <= STEP_LOG_HISTORY_MAX_LINES) {
      return;
    }

    const logsWithoutMarker =
      step.logs[0] === STEP_LOG_TRUNCATED_MARKER ? step.logs.slice(1) : [...step.logs];
    if (logsWithoutMarker.length <= STEP_LOG_HISTORY_HEAD_LINES + STEP_LOG_HISTORY_TAIL_LINES) {
      return;
    }

    const headCount = Math.min(STEP_LOG_HISTORY_HEAD_LINES, logsWithoutMarker.length);
    const tailCount = Math.min(
      STEP_LOG_HISTORY_TAIL_LINES,
      Math.max(0, logsWithoutMarker.length - headCount),
    );
    const omittedCount = Math.max(0, logsWithoutMarker.length - headCount - tailCount);
    if (omittedCount <= 0) {
      return;
    }

    step.logs = [
      STEP_LOG_TRUNCATED_MARKER,
      ...logsWithoutMarker.slice(0, headCount),
      `[system] ${omittedCount} historical log lines omitted for responsiveness.`,
      ...logsWithoutMarker.slice(logsWithoutMarker.length - tailCount),
    ];
  }

  private setStepStatus(step: AgentStepData, status: AgentStepStatus, options?: { compact?: boolean }) {
    step.status = status;
    const shouldCompact =
      options?.compact !== false &&
      status !== "running" &&
      status !== "pending";
    if (shouldCompact) {
      this.compactStepLogsForHistory(step);
    }
  }

  private finalizeAssistantMessageSteps(
    assistantMsg: AgentMessage,
    options?: { finalizeRunningStatus?: AgentStepStatus },
  ): { hasError: boolean; hasRejected: boolean } {
    const steps = assistantMsg.steps;
    if (!steps || steps.length === 0) {
      return { hasError: false, hasRejected: false };
    }

    const finalizeRunningStatus = options?.finalizeRunningStatus;
    for (const step of steps) {
      if ((step.status === "running" || step.status === "pending") && finalizeRunningStatus) {
        this.setStepStatus(step, finalizeRunningStatus);
        continue;
      }
      if (step.status !== "running" && step.status !== "pending") {
        this.compactStepLogsForHistory(step);
      }
    }

    const hasError = steps.some((step) => step.status === "error");
    const hasRejected = steps.some((step) => step.status === "rejected");
    return { hasError, hasRejected };
  }

  /**
   * The core multi-turn tool-use reasoning loop.
   */
  private async *runQueryLoop(
    query: string,
    model: string,
    modeSnapshot: ToolPermissionMode,
    executionLane: QueryExecutionLane,
  ): AsyncGenerator<QueryStreamEvent, Terminal> {
    this.lastContinue = null;
    const queryStartedAt = Date.now();
    const queryConfig = buildQueryConfig();
    const initialRetryProfile = computeRetryProfile({
      lane: executionLane,
      queueDepth: this.messageQueue.length,
      fallbackEligible:
        queryConfig.gates.enableFallbackModel && Boolean(this.fallbackModel) && this.fallbackModel !== model,
    });
    const buildQueryEndEvent = (terminal: Terminal): QueryStreamEvent => ({
      type: "query_end",
      terminalReason: terminal.reason,
      durationMs: Math.max(0, Date.now() - queryStartedAt),
      at: Date.now(),
      ...(terminal.reason === "error"
        ? { error: String((terminal as { error: unknown }).error) }
        : {}),
    });
    yield {
      type: "query_start",
      model,
      queueCount: this.messageQueue.length,
      lane: executionLane,
      retryMax: initialRetryProfile.maxRetries,
      fallbackEnabled: initialRetryProfile.fallbackEnabled,
      retryStrategy: initialRetryProfile.strategy,
      at: Date.now(),
    };
    if (!this.apiKey) {
      throw new Error(translate(this.locale, "agent.error.missingApiKey"));
    }
    if (this.abortController) {
      this.pendingAbortSource = "superseded_query";
      console.info("[lumo-agent] abort:request", {
        source: this.pendingAbortSource,
        threadId: this.threadId,
      });
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    this.pendingAbortSource = null;
    this.deniedToolCallSignatures.clear();
    this.scopedApprovalCountsByTool.clear();

    // 1. Add user message
    const userMsg: AgentMessage = {
      id: this.makeId(),
      role: "user",
      content: query,
    };
    this.activeTurnId = userMsg.id;
    this.messages.push(userMsg);
    this.updateUI();

    // 2. Create assistant message container
    const assistantMsg: AgentMessage = {
      id: this.makeId(),
      role: "assistant",
      content: "",
      status: "running",
      steps: []
    };
    this.messages.push(assistantMsg);
    this.activeAssistantMessage = assistantMsg;
    this.activeRunningStep = null;
    this.updateUI();

    // 3. Build the LLM conversation context
    const runtimeGitSnapshot = await this.loadRuntimeGitSnapshot();
    const runtimeContext = this.buildRuntimeContext(modeSnapshot, runtimeGitSnapshot);
    const promptArtifact = buildSystemPromptArtifact({
      toolDescriptions: this.buildToolDescriptions(),
      locale: toPromptLocale(this.locale),
      runtimeContext,
    });
    const systemPrompt = promptArtifact.prompt;
    yield {
      type: "prompt_compiled",
      staticSections: promptArtifact.staticSectionIds.length,
      dynamicSections: promptArtifact.dynamicSectionIds.length,
      staticChars: promptArtifact.staticChars,
      dynamicChars: promptArtifact.dynamicChars,
      totalChars: promptArtifact.staticChars + promptArtifact.dynamicChars,
      staticSectionIds: promptArtifact.staticSectionIds,
      dynamicSectionIds: promptArtifact.dynamicSectionIds,
      staticHash: promptArtifact.staticPromptHash,
      dynamicHash: promptArtifact.dynamicPromptHash,
      modelLaunchTags: promptArtifact.modelLaunchTags,
      sectionMetadata: promptArtifact.sectionMetadata,
      at: Date.now(),
    };
    const toolDefs = this.buildToolDefinitions();

    // Build LLM message history from our AgentMessages
    const llmHistory: LLMMessage[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add conversation history (only user/assistant text, skip steps)
    // Keep recent context under a soft token budget so long sessions remain responsive.
    const historySlice = this.messages.slice(-MAX_HISTORY_MESSAGES);
    const historyBuffer: LLMMessage[] = [];
    let historyTokenBudgetUsed = 0;
    for (let index = historySlice.length - 1; index >= 0; index -= 1) {
      const m = historySlice[index];
      if (m.role === "assistant" && m.id === assistantMsg.id) {
        continue;
      }
      if (m.role !== "user" && m.role !== "assistant") {
        continue;
      }
      const rawContent = m.content?.trim();
      if (!rawContent) {
        continue;
      }
      const content = this.truncateMessageForContext(rawContent);
      const estimatedTokens = Math.max(1, estimateTokensFromText(content));
      if (
        historyTokenBudgetUsed + estimatedTokens > MAX_HISTORY_CONTEXT_TOKENS &&
        historyBuffer.length > 0
      ) {
        break;
      }
      historyTokenBudgetUsed += estimatedTokens;
      historyBuffer.push({ role: m.role, content });
    }
    historyBuffer.reverse();
    llmHistory.push(...historyBuffer);

    try {
      // 4. THE TOOL-USE LOOP: the heart of the agent
      let iteration = 0;
      const budgetTracker = createBudgetTracker();
      let globalTurnTokens = 0;
      let currentModel = model;
      let hasRetriedWithFallback = false;
      let stopHookContinuationCount = 0;
      let consecutiveToolFailureBatches = 0;
      let totalToolCallsExecuted = 0;
      const toolFailureStreakBySignature = new Map<string, { tool: string; streak: number }>();
      const emittedToolRetryGuardSignatures = new Set<string>();
      const toolFailureStateBySignature = new Map<string, ToolFailureState>();
      const fastGuardFailureClassBySignature = new Map<string, ToolFailureClass>();
      const toolExecutionCountByTool = new Map<string, number>();
      let batchFailureDiagnosisContinuations = 0;
      let maxIterationTriggered = false;
      let activeRetryProfile = initialRetryProfile;

      while (true) {
        if (iteration >= MAX_TOOL_LOOP_ITERATIONS) {
          maxIterationTriggered = true;
          break;
        }
        if (this.abortController?.signal.aborted) {
          const abortSource = this.pendingAbortSource ?? "unknown";
          console.info("[lumo-agent] abort:detected", {
            source: abortSource,
            threadId: this.threadId,
            iteration: iteration + 1,
          });
          this.pendingAbortSource = null;
          assistantMsg.status = "error";
          this.activeRunningStep = null;
          assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + translate(this.locale, "agent.taskAborted");
          this.updateUI();
          const terminal: Terminal = { reason: "aborted" };
          this.activeAssistantMessage = null;
          yield buildQueryEndEvent(terminal);
          return terminal;
        }
        iteration++;
        yield {
          type: "iteration_start",
          iteration,
          model: currentModel,
          at: Date.now(),
        };

        // --- Step: LLM Call ---
        const thinkingStep = this.createStep(
          iteration === 1
            ? translate(this.locale, "agent.stepAnalyzing").replace("{model}", model)
            : translate(this.locale, "agent.stepReasoningRound").replace("{round}", String(iteration))
        );
        assistantMsg.steps!.push(thinkingStep);
        this.setStepStatus(thinkingStep, "running", { compact: false });
        this.activeRunningStep = thinkingStep;
        this.updateUI();

        const fallbackCandidateAvailable =
          queryConfig.gates.enableFallbackModel &&
          Boolean(this.fallbackModel) &&
          this.fallbackModel !== currentModel &&
          !hasRetriedWithFallback;
        const retryProfile = computeRetryProfile({
          lane: executionLane,
          queueDepth: this.messageQueue.length,
          fallbackEligible: fallbackCandidateAvailable,
        });
        if (retryProfileChanged(activeRetryProfile, retryProfile)) {
          activeRetryProfile = retryProfile;
          yield {
            type: "retry_profile_update",
            lane: executionLane,
            queueCount: this.messageQueue.length,
            retryMax: retryProfile.maxRetries,
            fallbackEnabled: retryProfile.fallbackEnabled,
            retryStrategy: retryProfile.strategy,
            reason: retryProfile.strategy === "background_load_shed" ? "load_shed" : "queue_depth_change",
            at: Date.now(),
          };
        }

        let data;
        try {
          data = await this.deps.callModel({
            baseUrl: this.baseUrl,
            apiKey: this.apiKey,
            model: currentModel,
            messages: llmHistory,
            tools: toolDefs,
            temperature: 0.3,
            signal: this.abortController?.signal,
            maxRetries: retryProfile.maxRetries,
            retryBaseDelayMs: retryProfile.baseDelayMs,
            retryMaxDelayMs: retryProfile.maxDelayMs,
            onRetryAttempt: (attempt, error, nextDelayMs) => {
              const reason = String((error as { message?: unknown })?.message ?? error ?? "unknown").slice(0, 180);
              const waitMs = Math.max(0, Math.round(nextDelayMs));
              this.pushQueryEvent({
                type: "retry_attempt",
                iteration,
                model: currentModel,
                lane: executionLane,
                attempt,
                nextDelayMs: waitMs,
                reason,
                retryStrategy: retryProfile.strategy,
                at: Date.now(),
              });
              this.appendStepLog(
                thinkingStep,
                translate(this.locale, "agent.runtime.modelRetryLog", {
                  attempt,
                  delay: waitMs,
                  reason,
                }),
              );
              this.updateUI();
            },
          });
        } catch (error) {
          const shouldFallback = fallbackCandidateAvailable && retryProfile.fallbackEnabled;
          if (!shouldFallback) {
            const suppressionReason = classifyFallbackSuppressionReason({
              gateEnabled: queryConfig.gates.enableFallbackModel,
              fallbackModel: this.fallbackModel,
              currentModel,
              hasRetriedWithFallback,
              retryProfile,
              fallbackCandidateAvailable,
            });
            this.pushQueryEvent({
              type: "fallback_suppressed",
              iteration,
              model: currentModel,
              lane: executionLane,
              reason: suppressionReason,
              retryStrategy: retryProfile.strategy,
              fallbackModel: this.fallbackModel ?? null,
              at: Date.now(),
            });
            this.appendStepLog(
              thinkingStep,
              translate(this.locale, "agent.runtime.fallbackSuppressedLog", {
                reason: translate(this.locale, `agent.trace.fallbackSuppressedReason.${suppressionReason}`),
                strategy: translate(this.locale, `agent.trace.retryStrategy.${retryProfile.strategy}`),
              }),
            );
            this.updateUI();
            throw error;
          }

          hasRetriedWithFallback = true;
          currentModel = this.fallbackModel!;
          this.lastContinue = {
            reason: "fallback_retry",
            fallbackModel: currentModel,
          };
          yield {
            type: "continue",
            transition: this.lastContinue,
            iteration,
            at: Date.now(),
          };
          this.appendStepLog(
            thinkingStep,
            translate(this.locale, "agent.runtime.fallbackRetryLog", {
              model: currentModel,
            }),
          );
          this.setStepStatus(thinkingStep, "completed");
          if (this.activeRunningStep?.id === thinkingStep.id) {
            this.activeRunningStep = null;
          }
          this.updateUI();
          continue;
        }
        const choice = data.choices?.[0];
        if (!choice?.message) {
          throw new Error(translate(this.locale, "agent.error.modelResponseMalformed"));
        }
        this.collectUsage(currentModel, (data as { usage?: CompletionUsageLike }).usage);
        const message = choice.message;
        const finishReason = choice.finish_reason;
        if (message.content) {
          globalTurnTokens += estimateTokensFromText(message.content);
        }

        this.setStepStatus(thinkingStep, "completed", { compact: false });
        if (this.activeRunningStep?.id === thinkingStep.id) {
          this.activeRunningStep = null;
        }
        this.appendStepLog(
          thinkingStep,
          translate(this.locale, "agent.stepReasoningDone").replace(
            "{reason}",
            String(finishReason ?? "unknown"),
          ),
        );
        this.compactStepLogsForHistory(thinkingStep);
        this.updateUI();

        // --- Case A: LLM wants to call tools ---
        if (message.tool_calls && message.tool_calls.length > 0) {
          yield {
            type: "tool_batch_start",
            iteration,
            count: message.tool_calls.length,
            at: Date.now(),
          };
          // Add assistant's tool_calls message to history
          llmHistory.push({
            role: "assistant",
            content: message.content ? this.truncateMessageForContext(message.content) : null,
            tool_calls: message.tool_calls,
          });

          const projectedToolCalls = totalToolCallsExecuted + message.tool_calls.length;
          if (projectedToolCalls > MAX_TOOL_CALLS_PER_QUERY) {
            const guardStep = this.createStep(translate(this.locale, "agent.runtime.toolCallCapStep"));
            this.setStepStatus(guardStep, "error", { compact: false });
            this.appendStepLog(
              guardStep,
              translate(this.locale, "agent.runtime.maxToolCallsReached", {
                max: MAX_TOOL_CALLS_PER_QUERY,
              }),
            );
            this.compactStepLogsForHistory(guardStep);
            assistantMsg.steps!.push(guardStep);
            assistantMsg.content +=
              (assistantMsg.content ? "\n\n" : "") +
              translate(this.locale, "agent.runtime.maxToolCallsReached", {
                max: MAX_TOOL_CALLS_PER_QUERY,
              });
            assistantMsg.status = "error";
            this.activeRunningStep = null;
            this.activeAssistantMessage = null;
            this.updateUI();
            const terminal: Terminal = { reason: "max_iterations" };
            yield buildQueryEndEvent(terminal);
            return terminal;
          }
          totalToolCallsExecuted = projectedToolCalls;

          // If there's also text content, append to visible output
          if (message.content) {
            assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + message.content;
            this.updateUI();
          }

          const stepByToolCallId = new Map<string, AgentStepData>();
          const toolBudgetGuardEvents: Array<{
            tool: string;
            count: number;
            budget: number;
            reason: ToolBudgetGuardReason;
          }> = [];
          const toolResults = await runTools({
            toolCalls: message.tool_calls,
            isConcurrencySafe: (toolCall) => this.isToolConcurrencySafe(toolCall),
            onToolError: (toolCall, error) => formatToolExecutionError(toolCall.function.name, error),
            shouldAbort: () => Boolean(this.abortController?.signal.aborted),
            createAbortResult: (toolCall) =>
              translate(this.locale, "agent.runtime.toolSkippedInterrupted", {
                tool: toolCall.function.name,
              }),
            onToolStart: (toolCall) => {
              const argsSummary = this.summarizeArgs(toolCall.function.arguments);
              const toolStep = this.createStep(
                this.formatToolStepTitle(toolCall),
                {
                  toolName: toolCall.function.name,
                  argsSummary,
                  callArguments: toolCall.function.arguments,
                  outcome: "none",
                },
              );
              assistantMsg.steps!.push(toolStep);
              this.setStepStatus(toolStep, "running", { compact: false });
              this.activeRunningStep = toolStep;
              stepByToolCallId.set(toolCall.id, toolStep);
              this.updateUI();
            },
            runSingleTool: async (toolCall) => {
              const step = stepByToolCallId.get(toolCall.id);
              if (!step) {
                return translate(this.locale, "agent.runtime.missingToolStep", {
                  tool: toolCall.function.name,
                });
              }
              const signature = this.createToolCallSignatureFromArgsJson(
                toolCall.function.name,
                toolCall.function.arguments,
              );
              const knownFailureState = toolFailureStateBySignature.get(signature);
              if (this.shouldFastGuardToolFailure(knownFailureState)) {
                const guardedResult = this.buildFastFailureGuardResult(knownFailureState!);
                fastGuardFailureClassBySignature.set(signature, knownFailureState!.failureClass);
                this.appendStepLog(
                  step,
                  translate(this.locale, "agent.runtime.fastGuardLog", {
                    tool: knownFailureState!.tool,
                    failureClass: translate(
                      this.locale,
                      `agent.trace.toolFailureClass.${knownFailureState!.failureClass}`,
                    ),
                    streak: knownFailureState!.streak,
                  }),
                );
                return guardedResult;
              }
              const toolName = toolCall.function.name;
              const toolImpl = this.tools.get(toolName);
              const currentCount = toolExecutionCountByTool.get(toolName) ?? 0;
              const budget = this.computeToolCallBudget(
                toolName,
                toolImpl,
                consecutiveToolFailureBatches,
              );
              if (currentCount >= budget.budget) {
                toolBudgetGuardEvents.push({
                  tool: toolName,
                  count: currentCount,
                  budget: budget.budget,
                  reason: budget.reason,
                });
                const guardResult = this.buildToolBudgetGuardResult(
                  toolName,
                  currentCount,
                  budget.budget,
                  budget.reason,
                );
                this.appendStepLog(
                  step,
                  translate(this.locale, "agent.runtime.toolBudgetGuardLog", {
                    tool: toolName,
                    count: currentCount,
                    budget: budget.budget,
                    reason: translate(this.locale, `agent.runtime.toolBudgetReason.${budget.reason}`),
                  }),
                );
                return guardResult;
              }
              toolExecutionCountByTool.set(toolName, currentCount + 1);
              return this.executeTool(toolCall, step, modeSnapshot);
            },
            onToolComplete: (toolCall, result) => {
              const step = stepByToolCallId.get(toolCall.id);
              if (!step) return;
              this.flushQueuedStepLogsCore();
              this.setStepStatus(step, this.getToolResultStatus(result), { compact: false });
              if (this.activeRunningStep?.id === step.id) {
                this.activeRunningStep = null;
              }
              if (step.toolRender) {
                step.toolRender.outcome =
                  step.status === "error"
                    ? "error"
                    : step.status === "rejected"
                      ? "rejected"
                      : "result";
                step.toolRender.outcomePreview = result.substring(0, 500);
              }
              this.appendStepLog(
                step,
                translate(this.locale, "agent.runtime.toolResultLog", {
                  result: `${result.substring(0, 500)}${result.length > 500 ? "..." : ""}`,
                }),
              );
              this.compactStepLogsForHistory(step);
              this.updateUI();
            },
          });

          for (const guardEvent of toolBudgetGuardEvents) {
            yield {
              type: "tool_budget_guard",
              tool: guardEvent.tool,
              count: guardEvent.count,
              budget: guardEvent.budget,
              reason: guardEvent.reason,
              at: Date.now(),
            };
          }

          const repeatedGuardHints: Array<{ tool: string; streak: number }> = [];
          const batchFailureEntries: Array<{ tool: string; failureClass: ToolFailureClass }> = [];
          for (const { toolCall, result } of toolResults) {
            const status = this.getToolResultStatus(result);
            const outcome =
              status === "error"
                ? "error"
                : status === "rejected"
                  ? "rejected"
                  : "result";
            yield {
              type: "tool_result",
              tool: toolCall.function.name,
              outcome,
              at: Date.now(),
            };
            llmHistory.push({
              role: "tool",
              content: this.truncateToolResultForContext(result),
              tool_call_id: toolCall.id,
            });

            const signature = this.createToolCallSignatureFromArgsJson(
              toolCall.function.name,
              toolCall.function.arguments,
            );
            const fastGuardFailureClass = fastGuardFailureClassBySignature.get(signature);
            if (fastGuardFailureClass) {
              fastGuardFailureClassBySignature.delete(signature);
            }
            const failureClass = fastGuardFailureClass ?? this.classifyToolFailure(result, status);
            const failureState = this.updateToolFailureState(
              toolFailureStateBySignature,
              signature,
              toolCall.function.name,
              failureClass,
              status,
              result,
            );
            if (failureClass) {
              batchFailureEntries.push({
                tool: toolCall.function.name,
                failureClass,
              });
              yield {
                type: "tool_failure_classified",
                tool: toolCall.function.name,
                failureClass,
                streak: failureState?.streak ?? 1,
                fastGuarded: Boolean(fastGuardFailureClass) || /fast\s*guard/i.test(result),
                at: Date.now(),
              };
            }
            const retryHint = updateToolFailureStreak(
              toolFailureStreakBySignature,
              emittedToolRetryGuardSignatures,
              {
                signature,
                tool: toolCall.function.name,
                outcome,
                threshold: REPEATED_TOOL_SIGNATURE_FAILURE_THRESHOLD,
              },
            );
            if (retryHint) {
              repeatedGuardHints.push(retryHint);
              yield {
                type: "tool_retry_guard",
                tool: retryHint.tool,
                streak: retryHint.streak,
                guidance: "diagnose_before_retry",
                at: Date.now(),
              };
            }
            if (failureState && failureState.streak >= TOOL_FAILURE_FAST_GUARD_STREAK) {
              this.appendStepLog(
                thinkingStep,
                translate(this.locale, "agent.runtime.fastGuardStreakLog", {
                  tool: toolCall.function.name,
                  failureClass: translate(this.locale, `agent.trace.toolFailureClass.${failureState.failureClass}`),
                  streak: failureState.streak,
                }),
              );
            }
          }
          const toolErrorCount = toolResults.reduce((count, item) => {
            const status = this.getToolResultStatus(item.result);
            return status === "error" || status === "rejected" ? count + 1 : count;
          }, 0);
          if (toolResults.length > 0 && toolErrorCount >= toolResults.length) {
            consecutiveToolFailureBatches += 1;
          } else {
            consecutiveToolFailureBatches = 0;
          }
          if (toolErrorCount === 0) {
            batchFailureDiagnosisContinuations = 0;
          }
          yield {
            type: "tool_batch_complete",
            iteration,
            count: message.tool_calls.length,
            errorCount: toolErrorCount,
            at: Date.now(),
          };

          if (repeatedGuardHints.length > 0) {
            const guardStep = this.createStep(translate(this.locale, "agent.runtime.retryGuardStep"));
            this.setStepStatus(guardStep, "completed", { compact: false });
            for (const hint of repeatedGuardHints) {
              this.appendStepLog(
                guardStep,
                translate(this.locale, "agent.runtime.retryGuardLog", {
                  tool: hint.tool,
                  streak: hint.streak,
                }),
              );
            }
            this.compactStepLogsForHistory(guardStep);
            assistantMsg.steps!.push(guardStep);
            const detail = repeatedGuardHints
              .map((hint) => `${hint.tool}x${hint.streak}`)
              .join(" | ");
            llmHistory.push({
              role: "user",
              content: translate(this.locale, "agent.runtime.retryGuardContinuation", {
                details: detail,
              }),
            });
            this.updateUI();
          }

          if (this.shouldTriggerBatchFailureDiagnosis(
            toolResults.length,
            toolErrorCount,
            batchFailureDiagnosisContinuations,
          )) {
            const failureDetails = this.summarizeFailureBreakdown(batchFailureEntries);
            const diagnosisStep = this.createStep(translate(this.locale, "agent.runtime.retryGuardStep"));
            this.setStepStatus(diagnosisStep, "completed", { compact: false });
            this.appendStepLog(
              diagnosisStep,
              translate(this.locale, "agent.runtime.batchFailureDiagnosisLog", {
                errorCount: toolErrorCount,
                toolCount: toolResults.length,
              }),
            );
            if (failureDetails) {
              this.appendStepLog(
                diagnosisStep,
                translate(this.locale, "agent.runtime.batchFailureDiagnosisBreakdown", {
                  details: failureDetails,
                }),
              );
            }
            this.compactStepLogsForHistory(diagnosisStep);
            assistantMsg.steps!.push(diagnosisStep);
            const continuationCount = batchFailureDiagnosisContinuations + 1;
            yield {
              type: "tool_failure_diagnosis",
              errorCount: toolErrorCount,
              toolCount: toolResults.length,
              breakdown: failureDetails,
              continuationCount,
              at: Date.now(),
            };
            llmHistory.push({
              role: "user",
              content: this.buildBatchFailureDiagnosisContinuation(
                failureDetails,
                toolErrorCount,
                toolResults.length,
              ),
            });
            batchFailureDiagnosisContinuations = continuationCount;
            this.updateUI();
          }

          if (consecutiveToolFailureBatches >= MAX_CONSECUTIVE_TOOL_FAILURE_BATCHES) {
            const guardStep = this.createStep(translate(this.locale, "agent.runtime.failureGuardStep"));
            this.setStepStatus(guardStep, "error", { compact: false });
            this.appendStepLog(
              guardStep,
              translate(this.locale, "agent.runtime.failureGuardLog", {
                count: consecutiveToolFailureBatches,
              }),
            );
            this.compactStepLogsForHistory(guardStep);
            assistantMsg.steps!.push(guardStep);
            assistantMsg.content +=
              (assistantMsg.content ? "\n\n" : "") +
              translate(this.locale, "agent.runtime.failureGuardResult", {
                count: consecutiveToolFailureBatches,
              });
            assistantMsg.status = "error";
            this.activeRunningStep = null;
            this.activeAssistantMessage = null;
            this.updateUI();
            const terminal: Terminal = {
              reason: "error",
              error: new Error("tool failure guard triggered"),
            };
            yield buildQueryEndEvent(terminal);
            return terminal;
          }

          this.lastContinue = { reason: "tool_results" };
          yield {
            type: "continue",
            transition: this.lastContinue,
            iteration,
            at: Date.now(),
          };
          // Continue the loop after injecting tool results.
          continue;
        }
        consecutiveToolFailureBatches = 0;

        // --- Case B: LLM responds with final text (no more tool calls) ---
        const assistantContentBeforeCandidate = assistantMsg.content;
        if (message.content) {
          assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + message.content;
        }

        const stopHookResult = queryConfig.gates.enableStopHooks
          ? await executeStopHooks(this.stopHooks, {
            messages: this.messages,
            assistantMessage: assistantMsg,
            iteration,
          })
          : { blockingErrors: [], preventContinuation: false, notes: [], continuationMessages: [] };

        if (stopHookResult.notes.length > 0 || stopHookResult.continuationMessages.length > 0) {
          this.pushQueryEvent({
            type: "stop_hook_review",
            noteCount: stopHookResult.notes.length,
            continuationCount: stopHookResult.continuationMessages.length,
            at: Date.now(),
          });
        }

        if (stopHookResult.notes.length > 0) {
          const hookStep = this.createStep(translate(this.locale, "agent.runtime.stopHooksStep"));
          this.setStepStatus(hookStep, "completed", { compact: false });
          for (const note of stopHookResult.notes) {
            this.appendStepLog(hookStep, note);
          }
          this.compactStepLogsForHistory(hookStep);
          assistantMsg.steps!.push(hookStep);
        }

        if (stopHookResult.continuationMessages.length > 0) {
          if (stopHookContinuationCount < MAX_STOP_HOOK_CONTINUATIONS) {
            stopHookContinuationCount += 1;
            const continuationMessage = stopHookResult.continuationMessages.join("\n\n");
            assistantMsg.content = assistantContentBeforeCandidate;
            llmHistory.push({
              role: "assistant",
              content: message.content || null,
            });
            llmHistory.push({
              role: "user",
              content: continuationMessage,
            });
            const reviewStep = this.createStep(translate(this.locale, "agent.runtime.stopHooksReviewStep"));
            this.setStepStatus(reviewStep, "completed", { compact: false });
            this.appendStepLog(
              reviewStep,
              translate(this.locale, "agent.runtime.stopHooksReviewRetryLog", {
                count: stopHookContinuationCount,
              }),
            );
            this.appendStepLog(reviewStep, continuationMessage);
            this.compactStepLogsForHistory(reviewStep);
            assistantMsg.steps!.push(reviewStep);
            this.lastContinue = {
              reason: "stop_hook_retry",
              attempt: stopHookContinuationCount,
            };
            yield {
              type: "continue",
              transition: this.lastContinue,
              iteration,
              at: Date.now(),
            };
            this.updateUI();
            continue;
          }
          assistantMsg.content +=
            `\n\n${translate(this.locale, "agent.runtime.stopHooksReviewLimit", {
              count: MAX_STOP_HOOK_CONTINUATIONS,
            })}`;
        }

        if (stopHookResult.blockingErrors.length > 0) {
          assistantMsg.content +=
            `\n\n${translate(this.locale, "agent.runtime.stopHooksBlocked")}\n` +
            stopHookResult.blockingErrors.map((err) => `- ${err}`).join("\n");
          assistantMsg.status = "error";
          this.updateUI();
          const terminal: Terminal = { reason: "stop_hook_prevented" };
          yield buildQueryEndEvent(terminal);
          return terminal;
        }

        if (stopHookResult.preventContinuation) {
          assistantMsg.status = "completed";
          this.updateUI();
          const terminal: Terminal = { reason: "stop_hook_prevented" };
          yield buildQueryEndEvent(terminal);
          return terminal;
        }

        const budgetDecision: TokenBudgetDecision = queryConfig.gates.enableTokenBudget
          ? checkTokenBudget(
            budgetTracker,
            this.tokenBudget,
            globalTurnTokens,
          )
          : { action: "stop", completionEvent: null };
        if (budgetDecision.action === "continue") {
          llmHistory.push({ role: "user", content: budgetDecision.nudgeMessage });
          const budgetStep = this.createStep(translate(this.locale, "agent.runtime.tokenBudgetStep"));
          this.setStepStatus(budgetStep, "completed", { compact: false });
          this.appendStepLog(
            budgetStep,
            translate(this.locale, "agent.runtime.tokenBudgetAutoContinue", {
              count: budgetDecision.continuationCount,
              pct: budgetDecision.pct,
              turn: budgetDecision.turnTokens,
              budget: budgetDecision.budget,
            }),
          );
          this.compactStepLogsForHistory(budgetStep);
          assistantMsg.steps!.push(budgetStep);
          this.lastContinue = {
            reason: "token_budget_continuation",
            attempt: budgetDecision.continuationCount,
          };
          yield {
            type: "continue",
            transition: this.lastContinue,
            iteration,
            at: Date.now(),
          };
          this.updateUI();
          continue;
        }

        // Loop ends: model is done
        break;
      }

      if (maxIterationTriggered) {
        this.finalizeAssistantMessageSteps(assistantMsg, {
          finalizeRunningStatus: "error",
        });
        assistantMsg.content +=
          (assistantMsg.content ? "\n\n" : "") +
          translate(this.locale, "agent.runtime.maxIterationsReached", {
            max: MAX_TOOL_LOOP_ITERATIONS,
          });
        assistantMsg.status = "error";
        this.activeRunningStep = null;
        this.activeAssistantMessage = null;
        this.updateUI();
        const terminal: Terminal = { reason: "max_iterations" };
        yield buildQueryEndEvent(terminal);
        return terminal;
      }

      const { hasError: hasStepError, hasRejected: hasStepRejected } = this.finalizeAssistantMessageSteps(
        assistantMsg,
        { finalizeRunningStatus: "completed" },
      );
      assistantMsg.status = hasStepError ? "error" : hasStepRejected ? "rejected" : "completed";
      this.activeRunningStep = null;
      this.activeAssistantMessage = null;
      this.updateUI();
      const terminal: Terminal = { reason: "completed" };
      yield buildQueryEndEvent(terminal);
      return terminal;

    } catch (error) {
      console.error("Agent Loop Error:", error);
      assistantMsg.content += `\n\n${this.classifyError(error)}`;
      assistantMsg.status = "error";
      this.activeRunningStep = null;
      this.activeAssistantMessage = null;

      this.ensureToolResultPairing(llmHistory, assistantMsg);

      this.finalizeAssistantMessageSteps(assistantMsg, {
        finalizeRunningStatus: "error",
      });
      this.updateUI();
      const terminal: Terminal = { reason: "error", error };
      yield buildQueryEndEvent(terminal);
      return terminal;
    }
  }

  /**
   * Create a short summary of tool arguments for display in the step title.
   */
  private summarizeArgs(argsJson: string): string {
    try {
      const args = JSON.parse(argsJson);
      const parts: string[] = [];
      for (const [key, value] of Object.entries(args)) {
        const strVal = typeof value === "string"
          ? (value.length > 40 ? value.substring(0, 40) + "..." : value)
          : JSON.stringify(value);
        parts.push(`${key}: ${strVal}`);
      }
      return parts.join(", ").substring(0, 80);
    } catch {
      return argsJson.substring(0, 50);
    }
  }

  public abort(clearQueue = false, source: AbortSource = "manual_stop") {
    if (this.abortController) {
      this.pendingAbortSource = source;
      console.info("[lumo-agent] abort:request", {
        source,
        threadId: this.threadId,
        clearQueue,
      });
      this.abortController.abort();
    }
    if (clearQueue) {
      if (!this.isProcessing && this.messageQueue.length > 0) {
        const droppedItems = [...this.messageQueue];
        for (const dropped of droppedItems) {
          this.emitCommandLifecycleEvent(
            {
              id: dropped.commandId,
              command: dropped.commandLabel,
              lane: "background",
              queued: true,
            },
            "aborted",
            {
              terminalReason: "aborted",
            },
          );
        }
        this.messageQueue = [];
        this.consecutiveNowDequeues = 0;
        this.refreshRuntimeSnapshot();
      }
      this.abortQueuedProcessing = true;
      this.activeRunningStep = null;
      this.activeAssistantMessage = null;
      this.updateUI(true);
    }
  }

  public dispose() {
    this.abort(false, "engine_dispose");
    this.activeRunningStep = null;
    this.activeAssistantMessage = null;
    this.clearQueueMaintenanceTimer();
    if (this.stepLogFlushTimer !== null) {
      clearTimeout(this.stepLogFlushTimer);
      this.stepLogFlushTimer = null;
    }
    this.queuedStepLogs.clear();
    if (this.uiFlushTimer !== null) {
      clearTimeout(this.uiFlushTimer);
      this.uiFlushTimer = null;
    }
    this.uiUpdatePending = false;
    if (this.unlistenAgentLog) {
      this.unlistenAgentLog();
      this.unlistenAgentLog = null;
    }
    this.runtimeSnapshotListeners.clear();
  }

  /**
   * Clear all messages and reset the engine.
   */
  public clear() {
    this.abort(true, "engine_clear");
    this.clearQueueMaintenanceTimer();
    if (this.stepLogFlushTimer !== null) {
      clearTimeout(this.stepLogFlushTimer);
      this.stepLogFlushTimer = null;
    }
    this.queuedStepLogs.clear();
    this.activeTurnId = undefined;
    this.activeRunningStep = null;
    this.activeAssistantMessage = null;
    this.usageByModel.clear();
    this.messages = [];
    this.messageQueue = [];
    this.consecutiveNowDequeues = 0;
    this.isProcessing = false;
    this.abortQueuedProcessing = false;
    this.lastTerminal = null;
    this.lastContinue = null;
    this.queryEvents = [];
    this.markQueryEventsChanged();
    this.commandLifecycleById.clear();
    this.commandLifecycleOrder = [];
    this.refreshRuntimeSnapshot();
    this.updateUI(true);
  }

  public listTasks(): AgentTask[] {
    return this.taskManager.listTasks();
  }

  public getTask(taskId: string): AgentTask | null {
    return this.taskManager.getTask(taskId);
  }

  public readTaskOutput(taskId: string, fromOffset = 0, limit = 100): TaskOutputChunk | null {
    return this.taskManager.readOutput(taskId, fromOffset, limit);
  }

  public stopTask(taskId: string): boolean {
    return this.taskManager.stopTask(taskId);
  }


  public getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  public setMessages(messages: AgentMessage[]) {
    this.messages = [...messages];
    this.updateUI(true);
  }
}

