import { createDefaultCommandRegistry } from "../src/lib/agent/commands";
import { parseSlashCommand } from "../src/lib/agent/commands/parser";
import type { CommandContext } from "../src/lib/agent/commands/types";
import type { PermissionRule } from "../src/lib/agent/permissions/toolPermissions";
import type { QueryStreamEvent, ToolFailureClass } from "../src/lib/agent/query/events";
import { AgentTaskManager } from "../src/lib/agent/tasks/TaskManager";
import {
  DEFAULT_TOOL_CALL_BUDGET_POLICY,
  type AgentMessage,
  type QueuedQueryItem,
  type QueryRuntimeSnapshot,
  type ToolCallBudgetPolicy,
  type UsageSnapshot,
  shouldPublishRuntimeSnapshot,
} from "../src/lib/agent/QueryEngine";
import {
  deriveRecoverActionDecision,
  deriveRecoverDoctorRecommendationPresentations,
  deriveRecoverRunbookBlueprint,
  type RecoverDoctorRecommendation,
  type RecoverRunbookStep,
  type RecoverStateKind,
} from "../src/lib/agent/recoveryPolicy";
import {
  buildDiagnosisRecommendationBlueprint,
  compareDiagnosisRecommendationPriority,
  deriveDiagnosisRecommendationScore,
  deriveDiagnosisMatrixScore,
  deriveDiagnosisPriorityScore,
  deriveDiagnosisTrendWeight,
  deriveFallbackDiagnosisRecommendationSeverity,
  deriveHotspotDiagnosisRecommendationSeverity,
  deriveQueueDiagnosisRecommendationSeverity,
  deriveRecoverRecommendationTrendWeight,
  deriveReplayFailedRecommendationRiskProfile,
  shouldRecommendQueueDiagnosisByPressure,
  prioritizeDoctorRecommendationEntries,
  type DoctorRecommendationEntry,
  type DoctorRecommendationId,
} from "../src/lib/agent/diagnosisRecommendationPolicy";
import {
  buildFallbackDiagnosisRecommendationBlueprint,
  buildHotspotDiagnosisRecommendationBlueprint,
  buildQueueDiagnosisRecommendationBlueprint,
  buildRecoverDiagnosisRecommendationBlueprint,
  buildReplayFailedDiagnosisRecommendationBlueprint,
} from "../src/lib/agent/diagnosisRecommendationRuntime";
import {
  deriveDoctorApiStateLine,
  deriveDoctorGitLineFromError,
  deriveDoctorGitLineFromSnapshot,
  deriveDoctorWorkspaceFail,
  deriveDoctorWorkspaceMissing,
  deriveDoctorWorkspaceOk,
} from "../src/lib/agent/doctorEnvironmentRuntime";
import {
  deriveDoctorPromptSectionLineDescriptors,
  summarizeDoctorPromptGovernance,
} from "../src/lib/agent/doctorPromptRuntime";
import { deriveDoctorOperationalSectionRuntime } from "../src/lib/agent/doctorOperationalSectionRuntime";
import { deriveDoctorQueueSectionRuntime } from "../src/lib/agent/doctorQueueSectionRuntime";
import { deriveDoctorRecoverySectionRuntime } from "../src/lib/agent/doctorRecoverySectionRuntime";
import {
  collectDoctorPermissionRiskCounters,
  createEmptyDoctorPermissionRiskCounters,
  deriveDoctorPermissionSectionRuntime,
} from "../src/lib/agent/doctorPermissionSectionRuntime";
import { deriveDoctorQueueInvestigateRuntime } from "../src/lib/agent/doctorQueueInvestigateRuntime";
import { deriveDoctorFallbackInvestigateRuntime } from "../src/lib/agent/doctorFallbackInvestigateRuntime";
import {
  deriveDoctorRecoverInvestigateRuntime,
  deriveDoctorRecoverInvestigateStats,
} from "../src/lib/agent/doctorRecoverInvestigateRuntime";
import {
  deriveDoctorBudgetRecommendationIds,
  deriveDoctorFallbackRecommendationIds,
  deriveDoctorPermissionRecommendationIds,
  deriveDoctorToolFailureRecommendationIds,
  shouldRecommendDoctorAvoidDuplicateQueueSubmissions,
  shouldRecommendDoctorInspectTasks,
  shouldRecommendDoctorRelieveQueue,
} from "../src/lib/agent/doctorRecommendationRuntime";
import {
  DOCTOR_RECOMMENDATION_TEXT_DESCRIPTOR_MAP,
  getDoctorRecommendationTextDescriptor,
  getDoctorRecommendationTextVars,
} from "../src/lib/agent/doctorRecommendationTextRuntime";
import {
  deriveDoctorFallbackSuppressionRatioPct,
  deriveDoctorQueueHealthStatus,
  shouldWarnDoctorBudgetGuardSummary,
  shouldWarnDoctorFallbackSuppressionRatio,
  shouldWarnDoctorPermissionRiskHigh,
  shouldWarnDoctorQueueDeduplicated,
  shouldWarnDoctorToolFailureSummary,
} from "../src/lib/agent/doctorStatusRuntime";
import {
  deriveDoctorBudgetGuardLineLevel,
  deriveDoctorFallbackSuppressionRatioLineDescriptor,
  deriveDoctorPermissionRiskHighLineLevel,
  deriveDoctorQueueDeduplicatedLineLevel,
  deriveDoctorQueueLineDescriptor,
  deriveDoctorToolFailureLineLevel,
  formatDoctorLine,
} from "../src/lib/agent/doctorLineRuntime";
import { deriveThreadNameFromQuery } from "../src/lib/agent/threadTitleRuntime";
import {
  DOCTOR_SECTION_ORDER,
  createDoctorSectionComposer,
} from "../src/lib/agent/doctorSectionRuntime";
import { translate, type AppLocale, type TranslationKey } from "../src/lib/i18n";
import { buildRecoverCommandRuntimeSnapshot } from "../src/lib/agent/recoverCommandRuntime";
import {
  buildTraceRunSummaries,
  buildVisibleTraceRunSummaries,
  getTraceEventFilter,
  getTraceEventSeverity,
  TRACE_CATEGORY_ORDER,
} from "../src/lib/agent/traceRunRuntime";
import {
  deriveTraceCommandParseSnapshot,
  parseTraceBlastRadiusToken,
  parseTraceFilterToken,
  parseTraceReversibilityToken,
  parseTraceRiskToken,
  parseTraceRunWindowToken,
  parseTraceSummaryToken,
  parseTraceToolToken,
} from "../src/lib/agent/traceCommandParseRuntime";
import {
  parseQueueOpsActionFilter,
  parseQueueOpsPriorityFilter,
  parseQueueOpsReasonFilter,
} from "../src/lib/agent/queueOpsFilterRuntime";
import {
  collectQueueUpdateEvents,
  deriveQueueOpsSummarySnapshot,
  filterQueueOpsEvents,
} from "../src/lib/agent/queueOpsRuntime";
import {
  buildQueueCompactKey,
  deriveCompactDuplicateRemovalPlan,
  deriveHealDuplicateRemovalPlan,
  deriveStaleQueuedQueryIds,
  getQueuePriorityRank,
  normalizeQueueIntentFingerprint,
} from "../src/lib/agent/queueMaintenanceRuntime";
import {
  buildRecoverResumeFailedLineDescriptors,
  buildRecoverResumeNoInterruptionLineDescriptors,
  buildRecoverResumeQueueFullLineDescriptors,
  buildRecoverResumeQueuedLineDescriptors,
  buildRecoverResumeQueuedReuseLineDescriptors,
  buildRecoverResumeStartedLineDescriptors,
  deriveRecoverResumePolicy,
  shouldPromoteRecoverQueuedPriority,
} from "../src/lib/agent/recoverResumeRuntime";
import { createTraceAppliedFilterLabelOptions } from "../src/lib/agent/traceFilterLabelOptionsRuntime";
import { deriveTraceVisibilitySnapshot } from "../src/lib/agent/traceVisibilityRuntime";
import {
  buildTraceFallbackStats,
  buildTraceHotspotParts,
  buildTraceHotspotSummaries,
  buildTracePermissionRiskProfileStats,
  buildTraceQueuePriorityStats,
  buildTraceQueueReasonStats,
} from "../src/lib/agent/traceSummaryRuntime";
import {
  buildTraceInvestigateSummaryCommand,
  deriveTraceInvestigateRunbookLineDescriptors,
} from "../src/lib/agent/traceInvestigateRuntime";
import {
  deriveTraceInvestigateMessage,
  deriveTraceInvestigateRunbookLines,
  deriveTraceInvestigateSubmitResultLine,
} from "../src/lib/agent/traceInvestigateMessageRuntime";
import { deriveTraceInvestigateActionPlan } from "../src/lib/agent/traceInvestigateActionRuntime";
import { deriveTraceListMessage } from "../src/lib/agent/traceListMessageRuntime";
import {
  createTraceHotspotsMessageOptions,
  createTraceInvestigateMessageOptions,
  createTraceListMessageOptions,
  createTraceSummaryMessageOptions,
} from "../src/lib/agent/traceMessageOptionsRuntime";
import { deriveTraceSummarySnapshot } from "../src/lib/agent/traceSummaryRenderRuntime";
import {
  composeTraceSummaryMessage,
  composeTraceSummaryRunLine,
  deriveTraceSummaryCategoryEntries,
  deriveTraceSummaryRunBaseDescriptor,
} from "../src/lib/agent/traceSummaryLineRuntime";
import { deriveTraceSummaryMessage } from "../src/lib/agent/traceSummaryMessageRuntime";
import { deriveTraceSummaryOverviewLineDescriptors } from "../src/lib/agent/traceSummaryOverviewRuntime";
import { deriveTraceSummaryRunDetailLines } from "../src/lib/agent/traceSummaryRunDetailRuntime";
import { deriveTraceSummaryRunLines } from "../src/lib/agent/traceSummaryRunLinesRuntime";
import {
  deriveTraceSummaryBudgetGuardDescriptor,
  deriveTraceSummaryFailureClassDescriptor,
  deriveTraceSummaryFallbackDescriptor,
  deriveTraceRiskProfileMatrixDescriptor,
  deriveTraceSummaryQueuePriorityDescriptor,
} from "../src/lib/agent/traceSummaryDescriptorRuntime";
import {
  buildTraceHotspotsHintCommand,
  deriveTraceHotspotsMetaLineDescriptors,
  deriveTraceHotspotsQueuePriorityVars,
  deriveTraceHotspotLineDescriptors,
  shouldRenderTraceHotspotsQueuePriority,
} from "../src/lib/agent/traceHotspotsRuntime";
import { deriveTraceHotspotsMessage } from "../src/lib/agent/traceHotspotsMessageRuntime";
import { deriveTraceAppliedFilterLabelSnapshot } from "../src/lib/agent/traceFilterRuntime";
import {
  TRACE_PERMISSION_RISK_ORDER,
  buildTracePermissionRiskCounter,
  deriveTracePermissionRiskEntries,
  deriveTracePermissionRiskEntriesFromEvents,
} from "../src/lib/agent/tracePermissionRiskRuntime";
import {
  buildToolBudgetGuardReasonStats,
  buildToolFailureClassStats,
  collectToolFailureClassCounts,
  countToolBudgetGuards,
  deriveToolFailureClassEntries,
} from "../src/lib/agent/traceToolingRuntime";
import {
  deriveTraceAuthorizationScopeNoticeLineDescriptor,
  deriveTraceCommandLifecycleLineDescriptor,
  deriveTraceContinueLineDescriptor,
  deriveTraceFallbackSuppressedLineDescriptor,
  deriveTraceIterationStartLineDescriptor,
  deriveTracePermissionDecisionLineDescriptor,
  deriveTracePermissionRiskProfileLineDescriptor,
  deriveTracePromptCompiledLineDescriptor,
  deriveTraceQueryEndLineDescriptor,
  deriveTraceQueryStartLineDescriptor,
  deriveTraceQueueUpdateLineDescriptor,
  deriveTraceRetryAttemptLineDescriptor,
  deriveTraceRetryProfileUpdateLineDescriptor,
  deriveTraceStopHookReviewLineDescriptor,
  deriveTraceToolBatchCompleteLineDescriptor,
  deriveTraceToolBatchStartLineDescriptor,
  deriveTraceToolBudgetGuardLineDescriptor,
  deriveTraceToolFailureDiagnosisLineDescriptor,
  deriveTraceToolFailureClassifiedLineDescriptor,
  deriveTraceToolResultLineDescriptor,
  deriveTraceToolRetryGuardLineDescriptor,
} from "../src/lib/agent/traceEventLineRuntime";
import { renderTraceEventLine } from "../src/lib/agent/traceEventRendererRuntime";
import {
  formatTraceFallbackSuppressedReasonLabel,
  formatTraceQueuePriorityLabel,
  formatTraceRetryStrategyLabel,
  formatTraceTerminalReasonLabel,
  formatTraceToolBudgetReasonLabel,
  formatTraceToolFailureClassLabel,
} from "../src/lib/agent/traceLabelRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArrayEquals<T extends string>(actual: readonly T[], expected: readonly T[], message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message} (expected=${expectedJson}, actual=${actualJson})`,
  );
}

function buildEvents(now = Date.now()): QueryStreamEvent[] {
  return [
    {
      type: "command_lifecycle",
      commandId: "cmd-demo-1",
      command: "/trace summary runs=all",
      state: "started",
      lane: "foreground",
      queued: false,
      at: now - 2,
    },
    {
      type: "command_lifecycle",
      commandId: "cmd-demo-1",
      command: "/trace summary runs=all",
      state: "completed",
      lane: "foreground",
      queued: false,
      terminalReason: "completed",
      at: now - 1,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 8,
      priority: "later",
      at: now - 1,
    },
    {
      type: "query_start",
      model: "demo-model",
      queueCount: 0,
      lane: "foreground",
      retryMax: 2,
      fallbackEnabled: true,
      retryStrategy: "queue_pressure",
      at: now,
    },
    {
      type: "tool_result",
      tool: "shell",
      outcome: "error",
      at: now + 1,
    },
    {
      type: "retry_profile_update",
      lane: "background",
      queueCount: 4,
      retryMax: 0,
      fallbackEnabled: false,
      retryStrategy: "background_load_shed",
      reason: "load_shed",
      at: now + 5,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "background",
      reason: "retry_strategy",
      retryStrategy: "background_load_shed",
      fallbackModel: "fallback-model-demo",
      at: now + 8,
    },
    {
      type: "continue",
      transition: {
        reason: "fallback_retry",
        fallbackModel: "fallback-model-demo",
      },
      iteration: 2,
      at: now + 9,
    },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 4,
      staticChars: 2100,
      dynamicChars: 640,
      totalChars: 2740,
      staticSectionIds: ["intro", "system", "tools"],
      dynamicSectionIds: ["env", "memory"],
      staticHash: "static-demo-hash",
      dynamicHash: "dynamic-demo-hash",
      modelLaunchTags: ["capybara-v8", "prompt-governance"],
      sectionMetadata: [
        { id: "intro", kind: "static", owner: "core", mutable: false },
        { id: "cyber-risk", kind: "static", owner: "safeguards", mutable: false, modelLaunchTag: "capybara-v8" },
        { id: "env", kind: "dynamic", owner: "runtime", mutable: true },
      ],
      at: now + 10,
    },
    {
      type: "permission_decision",
      tool: "shell",
      behavior: "ask",
      reason: "High-risk shell mutation detected.",
      riskClass: "high_risk",
      at: now + 12,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "High-risk shell mutation detected.",
      reversibility: "hard_to_reverse",
      blastRadius: "shared",
      at: now + 12,
    },
    {
      type: "permission_decision",
      tool: "file_write",
      behavior: "ask",
      reason: "Path is outside workspace boundaries.",
      riskClass: "path_outside",
      at: now + 13,
    },
    {
      type: "permission_risk_profile",
      tool: "file_write",
      riskClass: "path_outside",
      reason: "Path is outside workspace boundaries.",
      reversibility: "mixed",
      blastRadius: "shared",
      at: now + 13,
    },
    {
      type: "authorization_scope_notice",
      tool: "shell",
      riskClass: "high_risk",
      priorApprovals: 2,
      at: now + 14,
    },
    {
      type: "query_end",
      terminalReason: "completed",
      durationMs: 130,
      at: now + 140,
    },
  ];
}

function createContext(
  locale: AppLocale,
  events: QueryStreamEvent[],
  options?: {
    queuedQueries?: QueuedQueryItem[];
    queueLimit?: number;
    messages?: AgentMessage[];
    submitFollowupQuery?: (
      query: string,
      options?: {
        model?: string;
        permissionMode?: "default" | "full_access";
        priority?: "now" | "next" | "later";
      },
    ) => {
      accepted: boolean;
      reason?: "empty" | "queue_full";
      queueCount: number;
      queueLimit: number;
      queuedId?: string;
      started?: boolean;
      commandId?: string;
    };
  },
): Omit<CommandContext, "parsed"> {
  const permissionRules: PermissionRule[] = [];
  const messages: AgentMessage[] = (options?.messages ?? []).map((message) => ({ ...message }));
  const usageSnapshot: UsageSnapshot = {
    totals: {
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      cachedInputTokens: 30,
    },
    byModel: [
      {
        model: "demo-model",
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        cachedInputTokens: 30,
      },
    ],
  };
  const taskManager = new AgentTaskManager();
  const registry = createDefaultCommandRegistry();
  let toolCallBudgetPolicy: ToolCallBudgetPolicy = { ...DEFAULT_TOOL_CALL_BUDGET_POLICY };
  const queuedQueries: QueuedQueryItem[] = (options?.queuedQueries ?? []).map((item) => ({ ...item }));
  const queueLimit = Math.max(1, options?.queueLimit ?? 8);
  const queueByPriority = queuedQueries.reduce(
    (acc, item) => {
      acc[item.priority] += 1;
      return acc;
    },
    {
      now: 0,
      next: 0,
      later: 0,
    } as Record<"now" | "next" | "later", number>,
  );

  return {
    workingDir: "C:/repo/demo",
    threadId: "thread-demo",
    currentModel: "demo-model",
    locale,
    queueCount: queuedQueries.length,
    queueLimit,
    queueByPriority,
    permissionMode: "default",
    permissionRules,
    addPermissionRules: (rules) => {
      permissionRules.push(...rules);
    },
    clearPermissionRules: () => {
      permissionRules.length = 0;
    },
    getToolNames: () => ["shell", "file_read", "file_write"],
    getCommandDescriptors: () => registry.getDescriptors(locale),
    getMessages: () => messages,
    getUsageSnapshot: () => usageSnapshot,
    resetUsageSnapshot: () => {
      usageSnapshot.totals = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
      };
      usageSnapshot.byModel = [];
    },
    getToolCallBudgetPolicy: () => toolCallBudgetPolicy,
    setToolCallBudgetPolicy: (patch) => {
      if (!patch) {
        toolCallBudgetPolicy = { ...DEFAULT_TOOL_CALL_BUDGET_POLICY };
        return toolCallBudgetPolicy;
      }
      toolCallBudgetPolicy = {
        ...toolCallBudgetPolicy,
        ...patch,
      };
      return toolCallBudgetPolicy;
    },
    getRecentQueryEvents: (limit = 120) => events.slice(-Math.max(1, limit)),
    clearQueryEvents: () => {
      events.length = 0;
    },
    getQueuedQueries: () => queuedQueries.map((item) => ({ ...item })),
    setQueuedQueryPriority: (queueId, priority) => {
      const target = queuedQueries.find((item) => item.id === queueId);
      if (!target) return false;
      target.priority = priority;
      return true;
    },
    removeQueuedQuery: (queueId) => {
      const index = queuedQueries.findIndex((item) => item.id === queueId);
      if (index < 0) return false;
      queuedQueries.splice(index, 1);
      return true;
    },
    submitFollowupQuery:
      options?.submitFollowupQuery ??
      (() => ({
        accepted: false,
        reason: "empty",
        queueCount: queuedQueries.length,
        queueLimit,
      })),
    taskManager,
    t: (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
  };
}

async function verifyPromptExportShape(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/prompt export");
  assert(parsed, "parseSlashCommand should parse /prompt export");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "prompt export should not return error");

  let payload: any;
  try {
    payload = JSON.parse(result.message);
  } catch (error) {
    throw new Error(`prompt export payload should be valid JSON: ${String(error)}`);
  }

  assert(typeof payload?.generatedAt === "string", "prompt export should include generatedAt");
  assert(payload?.sections?.static === 7, "prompt export should include static section count");
  assert(payload?.sections?.dynamic === 4, "prompt export should include dynamic section count");
  assert(payload?.sections?.totalChars === 2740, "prompt export should include total chars");
  assert(payload?.hashes?.static === "static-demo-hash", "prompt export should include static hash");
  assert(payload?.hashes?.dynamic === "dynamic-demo-hash", "prompt export should include dynamic hash");
  assert(Array.isArray(payload?.modelLaunchTags) && payload.modelLaunchTags.length === 2, "prompt export should include tags");
  assert(Array.isArray(payload?.sectionMetadata) && payload.sectionMetadata.length >= 3, "prompt export should include section metadata");
}

async function verifyTracePromptSummaryShortcut(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace prompt summary runs=all");
  assert(parsed, "parseSlashCommand should parse /trace prompt summary");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace prompt summary should not return error");

  const promptBucketLabel = translate(locale, "agent.trace.bucket.prompt");
  assert(
    result.message.includes(`${promptBucketLabel}:`) || result.message.includes(promptBucketLabel),
    "trace prompt summary should include prompt bucket detail",
  );
}

async function verifyTraceIncludesRetryStrategy(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace 20");
  assert(parsed, "parseSlashCommand should parse /trace 20");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace listing should not return error");

  const strategyLabel = translate(locale, "agent.trace.retryStrategy.queue_pressure");
  const profileUpdateReason = translate(locale, "agent.trace.retryProfileReason.load_shed");
  const fallbackSuppressedReason = translate(locale, "agent.trace.fallbackSuppressedReason.retry_strategy");
  assert(
    result.message.includes(strategyLabel),
    "trace output should include retry strategy label for query_start events",
  );
  assert(
    result.message.includes(profileUpdateReason),
    "trace output should include retry profile update reason",
  );
  assert(
    result.message.includes(fallbackSuppressedReason),
    "trace output should include fallback-suppressed reason",
  );
}

async function verifyTraceIncludesCommandLifecycle(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace 20");
  assert(parsed, "parseSlashCommand should parse /trace 20 for command lifecycle");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace listing should not return error for command lifecycle");

  const lifecycleLine = translate(locale, "agent.trace.event.commandLifecycle", {
    state: translate(locale, "agent.trace.commandLifecycle.state.completed"),
    command: "/trace summary runs=all",
  });
  assert(
    result.message.includes(lifecycleLine),
    "trace output should include command lifecycle events",
  );
}

async function verifyTraceIncludesQueuePriority(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace 20");
  assert(parsed, "parseSlashCommand should parse /trace 20 for queue priority");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace listing should not return error for queue priority");

  const queueLine = translate(locale, "agent.trace.event.queueUpdate", {
    action: translate(locale, "agent.trace.queueAction.queued"),
    queueCount: 2,
    queueLimit: 8,
    reason: ` [${translate(locale, "agent.queue.priority.later")}]`,
  });
  assert(
    result.message.includes(queueLine),
    "trace output should include queue update priority label",
  );
}

async function verifyTraceIncludesPermissionRiskProfile(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace 20");
  assert(parsed, "parseSlashCommand should parse /trace 20 for risk profile");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace listing should not return error for risk profile");

  const profileLine = translate(locale, "agent.trace.event.permissionRiskProfile", {
    tool: "shell",
    risk: translate(locale, "agent.trace.permissionRisk.high_risk"),
    reversibility: translate(locale, "agent.permission.prompt.reversibility.hard_to_reverse"),
    blastRadius: translate(locale, "agent.permission.prompt.blastRadius.shared"),
  });
  assert(
    result.message.includes(profileLine),
    "trace output should include permission risk profile event line",
  );
}

async function verifyTraceSummaryIncludesFallbackStats(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace summary runs=all");
  assert(parsed, "parseSlashCommand should parse /trace summary runs=all");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace summary should not return error");

  const reason = translate(locale, "agent.trace.fallbackSuppressedReason.retry_strategy");
  const strategy = translate(locale, "agent.trace.retryStrategy.background_load_shed");
  const runFallbackLine = translate(locale, "agent.command.trace.summaryFallbackDetailed", {
    used: 1,
    suppressed: 1,
    reason,
    strategy,
  });
  const globalFallbackLine = translate(locale, "agent.command.trace.summaryGlobalFallbackDetailed", {
    used: 1,
    suppressed: 1,
    reason,
    strategy,
  });
  const riskProfileMatrixLine = translate(locale, "agent.command.trace.riskProfileMatrix", {
    reversible: 0,
    mixed: 1,
    hardToReverse: 1,
    local: 0,
    workspace: 0,
    shared: 2,
  });
  const globalQueuePriorityLine = translate(locale, "agent.command.trace.summaryGlobalQueuePriority", {
    nowLabel: translate(locale, "agent.queue.priority.now"),
    nowQueued: 0,
    nowDequeued: 0,
    nowRejected: 0,
    nextLabel: translate(locale, "agent.queue.priority.next"),
    nextQueued: 0,
    nextDequeued: 0,
    nextRejected: 0,
    laterLabel: translate(locale, "agent.queue.priority.later"),
    laterQueued: 1,
    laterDequeued: 0,
    laterRejected: 0,
  });

  assert(
    result.message.includes(runFallbackLine),
    "trace summary should include per-run fallback usage/suppression details",
  );
  assert(
    result.message.includes(globalFallbackLine),
    "trace summary should include global fallback usage/suppression details",
  );
  assert(
    result.message.includes(riskProfileMatrixLine),
    "trace summary should include reversibility/blast-radius risk profile matrix",
  );
  assert(
    result.message.includes(globalQueuePriorityLine),
    "trace summary should include global queue priority stats",
  );
}

async function verifyTraceHotspotsIncludesQueuePressure(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/trace hotspots runs=all");
  assert(parsed, "parseSlashCommand should parse /trace hotspots runs=all");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace hotspots should not return error");

  const queuePriorityLine = translate(locale, "agent.command.trace.hotspotsQueuePriority", {
    nowLabel: translate(locale, "agent.queue.priority.now"),
    nowQueued: 0,
    nowDequeued: 0,
    nowRejected: 0,
    nextLabel: translate(locale, "agent.queue.priority.next"),
    nextQueued: 0,
    nextDequeued: 0,
    nextRejected: 0,
    laterLabel: translate(locale, "agent.queue.priority.later"),
    laterQueued: 1,
    laterDequeued: 0,
    laterRejected: 0,
    depth: 2,
    limitSuffix: "/8",
    pressure: translate(locale, "agent.trace.queuePressure.busy"),
  });

  assert(
    result.message.includes(queuePriorityLine),
    "trace hotspots should include queue priority and pressure summary",
  );
}

async function verifyTraceSupportsRiskProfileFilters(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand(
    "/trace summary permission risk=high_risk reversibility=hard_to_reverse blast=shared runs=all",
  );
  assert(parsed, "parseSlashCommand should parse /trace summary with risk profile filters");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace summary with risk profile filters should not return error");

  const riskFilterLine = translate(locale, "agent.command.trace.filterRisk", {
    risk: translate(locale, "agent.trace.permissionRisk.high_risk"),
  });
  const reversibilityFilterLine = translate(locale, "agent.command.trace.filterReversibility", {
    value: translate(locale, "agent.permission.prompt.reversibility.hard_to_reverse"),
  });
  const blastRadiusFilterLine = translate(locale, "agent.command.trace.filterBlastRadius", {
    value: translate(locale, "agent.permission.prompt.blastRadius.shared"),
  });

  assert(
    result.message.includes(riskFilterLine),
    "trace summary should include risk filter suffix",
  );
  assert(
    result.message.includes(reversibilityFilterLine),
    "trace summary should include reversibility filter suffix",
  );
  assert(
    result.message.includes(blastRadiusFilterLine),
    "trace summary should include blast-radius filter suffix",
  );
}

async function verifyTraceSupportsRiskProfileAliasFilters(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand(
    "/trace summary permission risk=high rev=hard blast_radius=shared tool=shell runs=1",
  );
  assert(parsed, "parseSlashCommand should parse /trace summary with alias filters");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "trace summary with alias filters should not return error");

  const riskFilterLine = translate(locale, "agent.command.trace.filterRisk", {
    risk: translate(locale, "agent.trace.permissionRisk.high_risk"),
  });
  const reversibilityFilterLine = translate(locale, "agent.command.trace.filterReversibility", {
    value: translate(locale, "agent.permission.prompt.reversibility.hard_to_reverse"),
  });
  const blastRadiusFilterLine = translate(locale, "agent.command.trace.filterBlastRadius", {
    value: translate(locale, "agent.permission.prompt.blastRadius.shared"),
  });
  const toolFilterLine = translate(locale, "agent.command.trace.filterTool", {
    tool: "shell",
  });
  const runsWindowLine = translate(locale, "agent.command.trace.filterRunsWindow", {
    runs: 1,
  });

  assert(
    result.message.includes(riskFilterLine),
    "trace summary alias filters should include risk filter suffix",
  );
  assert(
    result.message.includes(reversibilityFilterLine),
    "trace summary alias filters should include reversibility filter suffix",
  );
  assert(
    result.message.includes(blastRadiusFilterLine),
    "trace summary alias filters should include blast-radius filter suffix",
  );
  assert(
    result.message.includes(toolFilterLine),
    "trace summary alias filters should include tool filter suffix",
  );
  assert(
    result.message.includes(runsWindowLine),
    "trace summary alias filters should include run-window suffix",
  );

  const parsedRadiusAlias = parseSlashCommand(
    "/trace summary permission risk=high rev=hard radius=shared tool=shell runs=all",
  );
  assert(parsedRadiusAlias, "parseSlashCommand should parse /trace summary with radius alias");

  const radiusAliasResult = await registry.execute(parsedRadiusAlias, createContext(locale, buildEvents()));
  assert(!radiusAliasResult.error, "trace summary with radius alias should not return error");

  const runsAllLine = translate(locale, "agent.command.trace.filterRunsAll");
  assert(
    radiusAliasResult.message.includes(blastRadiusFilterLine),
    "trace summary radius alias should include blast-radius filter suffix",
  );
  assert(
    radiusAliasResult.message.includes(runsAllLine),
    "trace summary radius alias should include runs=all suffix",
  );
}

async function verifyDoctorIncludesQueryProfile(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/doctor");
  assert(parsed, "parseSlashCommand should parse /doctor");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "doctor command should not return error");

  const strategyLabel = translate(locale, "agent.trace.retryStrategy.queue_pressure");
  const fallbackSuppressedReason = translate(locale, "agent.trace.fallbackSuppressedReason.retry_strategy");
  const fallbackSuppressedStrategy = translate(locale, "agent.trace.retryStrategy.background_load_shed");
  const fallbackActivity = translate(locale, "agent.command.doctor.fallbackActivity", {
    used: 1,
    suppressed: 1,
  });
  const fallbackSuppressedRatio = translate(locale, "agent.command.doctor.fallbackSuppressedRatio", {
    ratio: 50,
    used: 1,
    suppressed: 1,
  });
  const fallbackSuppressed = translate(locale, "agent.command.doctor.fallbackSuppressed", {
    count: 1,
    reason: fallbackSuppressedReason,
    strategy: fallbackSuppressedStrategy,
  });
  const fallbackRecommendation = translate(
    locale,
    "agent.command.doctor.recommend.relieveQueueForFallback",
  );
  const permissionRiskSummary = translate(locale, "agent.command.doctor.permissionRiskSummary", {
    critical: 0,
    highRisk: 1,
    interactive: 0,
    pathOutside: 1,
    policy: 0,
    scopeNotices: 1,
  });
  const permissionRiskHigh = translate(locale, "agent.command.doctor.permissionRiskHigh");
  const permissionRiskProfileSummary = translate(
    locale,
    "agent.command.doctor.permissionRiskProfileSummary",
    {
      reversible: 0,
      mixed: 1,
      hardToReverse: 1,
      local: 0,
      workspace: 0,
      shared: 2,
    },
  );
  const permissionHighRiskRecommendation = translate(
    locale,
    "agent.command.doctor.recommend.reduceHighRiskApprovals",
  );
  const permissionBoundaryRecommendation = translate(
    locale,
    "agent.command.doctor.recommend.keepWorkspaceBoundaries",
  );
  const permissionIrreversibleRecommendation = translate(
    locale,
    "agent.command.doctor.recommend.explicitConfirmationForIrreversible",
  );
  assert(
    result.message.includes(strategyLabel),
    "doctor output should include latest query retry strategy",
  );
  assert(
    result.message.includes(fallbackActivity),
    "doctor output should include fallback activity summary",
  );
  assert(
    result.message.includes(fallbackSuppressed),
    "doctor output should include fallback suppression diagnostics",
  );
  assert(
    result.message.includes(fallbackSuppressedRatio),
    "doctor output should include fallback suppression ratio warning",
  );
  assert(
    result.message.includes(fallbackRecommendation),
    "doctor output should include fallback suppression recommendation",
  );
  assert(
    result.message.includes(permissionRiskSummary),
    "doctor output should include permission risk matrix summary",
  );
  assert(
    result.message.includes(permissionRiskHigh),
    "doctor output should include high-risk permission warning",
  );
  assert(
    result.message.includes(permissionRiskProfileSummary),
    "doctor output should include permission risk profile matrix summary",
  );
  assert(
    result.message.includes(permissionHighRiskRecommendation),
    "doctor output should include high-risk permission recommendation",
  );
  assert(
    result.message.includes(permissionBoundaryRecommendation),
    "doctor output should include workspace boundary recommendation",
  );
  assert(
    result.message.includes(permissionIrreversibleRecommendation),
    "doctor output should include irreversible/shared impact recommendation",
  );
}

async function verifyDoctorRecommendsQueueHealUnderPressure(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-load-${index + 1}`,
    query: `/trace summary runs=${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-load-${index + 1}`,
    commandLabel: "/trace summary",
    priority: index < 2 ? "now" : index < 4 ? "next" : "later",
  }));
  const events: QueryStreamEvent[] = [
    ...buildEvents(now),
    {
      type: "queue_update",
      action: "queued",
      queueCount: 7,
      queueLimit: 8,
      priority: "later",
      at: now + 20,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 8,
      queueLimit: 8,
      reason: "deduplicated",
      priority: "later",
      at: now + 21,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 8,
      queueLimit: 8,
      reason: "deduplicated",
      priority: "later",
      at: now + 22,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 8,
      queueLimit: 8,
      reason: "deduplicated",
      priority: "later",
      at: now + 23,
    },
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-doctor",
      role: "user",
      content: "continue interrupted turn",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/doctor");
  assert(parsed, "parseSlashCommand should parse /doctor in high queue pressure case");

  const result = await registry.execute(parsed, createContext(locale, events, { queuedQueries, queueLimit: 8, messages }));
  assert(!result.error, "doctor should not fail in high queue pressure case");

  const queueHealRecommendation = translate(locale, "agent.command.doctor.recommend.queueHeal");
  const queueInvestigateRecommendation = translate(locale, "agent.command.doctor.recommend.queueInvestigate");
  const recoverAutoRecommendation = translate(locale, "agent.command.doctor.recommend.recoverAuto");
  const recoverPlanRecommendation = translate(locale, "agent.command.doctor.recommend.recoverPlan");
  const resumeInterruptedRecommendation = translate(locale, "agent.command.doctor.recommend.resumeInterruptedTurn");
  const recoverStrictRecommendation = translate(locale, "agent.command.doctor.recommend.recoverExecuteStrict");
  const recoverInvestigateRecommendation = translate(locale, "agent.command.doctor.recommend.recoverInvestigate");
  assert(
    result.message.includes(queueHealRecommendation),
    "doctor should recommend /queue heal under queue pressure or dedup churn",
  );
  assert(
    result.message.includes(queueInvestigateRecommendation),
    "doctor should still recommend /doctor queue investigate under queue pressure",
  );
  assert(
    result.message.includes(recoverAutoRecommendation),
    "doctor should recommend /recover auto when interrupted turn meets queue pressure",
  );
  assert(
    result.message.includes(recoverPlanRecommendation),
    "doctor should recommend /recover plan before recovery actions",
  );
  assert(
    result.message.includes(resumeInterruptedRecommendation),
    "doctor should recommend /recover resume when interruption exists",
  );
  assert(
    result.message.includes(recoverStrictRecommendation),
    "doctor should recommend strict recover gate when interruption meets failure/queue pressure",
  );
  assert(
    result.message.includes(recoverInvestigateRecommendation),
    "doctor should recommend recover investigate as fallback diagnostics",
  );

  const indexRecoverPlan = result.message.indexOf(recoverPlanRecommendation);
  const indexQueueHeal = result.message.indexOf(queueHealRecommendation);
  const indexRecoverAuto = result.message.indexOf(recoverAutoRecommendation);
  const indexResumeInterrupted = result.message.indexOf(resumeInterruptedRecommendation);
  const indexRecoverStrict = result.message.indexOf(recoverStrictRecommendation);
  const indexRecoverInvestigate = result.message.indexOf(recoverInvestigateRecommendation);
  const indexQueueInvestigate = result.message.indexOf(queueInvestigateRecommendation);
  assert(
    indexRecoverPlan < indexQueueHeal &&
      indexQueueHeal < indexRecoverAuto &&
      indexRecoverAuto < indexResumeInterrupted &&
      indexResumeInterrupted < indexRecoverStrict &&
      indexRecoverStrict < indexRecoverInvestigate &&
      indexRecoverInvestigate < indexQueueInvestigate,
    "doctor recovery ladder should be ordered: plan -> queue-heal -> recover-auto -> resume -> strict -> investigate -> queue-investigate",
  );
}

async function verifyDoctorRecoveryLadderLowPressure(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-doctor-low-pressure",
      role: "user",
      content: "resume interrupted turn with minimal steps",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/doctor");
  assert(parsed, "parseSlashCommand should parse /doctor in low queue pressure case");

  const result = await registry.execute(parsed, createContext(locale, buildEvents(now), { queueLimit: 8, messages }));
  assert(!result.error, "doctor should not fail in low queue pressure case");

  const ladderTitle = translate(locale, "agent.command.doctor.recoveryLadderTitle");
  const ladderPlan = translate(locale, "agent.command.doctor.recoveryLadderPlan");
  const ladderResume = translate(locale, "agent.command.doctor.recoveryLadderResume");
  const ladderInvestigate = translate(locale, "agent.command.doctor.recoveryLadderInvestigate");
  const ladderHeal = translate(locale, "agent.command.doctor.recoveryLadderHeal");
  const ladderAuto = translate(locale, "agent.command.doctor.recoveryLadderAuto");
  const ladderStrict = translate(locale, "agent.command.doctor.recoveryLadderStrict");
  assert(result.message.includes(ladderTitle), "doctor should include recovery ladder title when interrupted");
  assert(result.message.includes(ladderPlan), "doctor should include recover-plan ladder step");
  assert(result.message.includes(ladderResume), "doctor should include direct-resume ladder step under low pressure");
  assert(
    result.message.includes(ladderInvestigate),
    "doctor should include investigate ladder fallback under low pressure",
  );
  assert(
    !result.message.includes(ladderHeal),
    "doctor should not include queue-heal ladder step when queue pressure is low",
  );
  assert(
    !result.message.includes(ladderAuto),
    "doctor should not include auto-recover ladder step when queue pressure is low",
  );
  assert(
    !result.message.includes(ladderStrict),
    "doctor should not include strict ladder step without failure or queue pressure signals",
  );

  const recoverPlanRecommendation = translate(locale, "agent.command.doctor.recommend.recoverPlan");
  const resumeInterruptedRecommendation = translate(locale, "agent.command.doctor.recommend.resumeInterruptedTurn");
  const recoverInvestigateRecommendation = translate(locale, "agent.command.doctor.recommend.recoverInvestigate");
  const queueHealRecommendation = translate(locale, "agent.command.doctor.recommend.queueHeal");
  const recoverAutoRecommendation = translate(locale, "agent.command.doctor.recommend.recoverAuto");
  const recoverStrictRecommendation = translate(locale, "agent.command.doctor.recommend.recoverExecuteStrict");
  assert(
    result.message.includes(recoverPlanRecommendation),
    "doctor should recommend /recover plan under low pressure",
  );
  assert(
    result.message.includes(resumeInterruptedRecommendation),
    "doctor should recommend /recover resume under low pressure",
  );
  assert(
    result.message.includes(recoverInvestigateRecommendation),
    "doctor should recommend /recover investigate under low pressure",
  );
  assert(
    !result.message.includes(queueHealRecommendation),
    "doctor should not recommend /queue heal under low pressure",
  );
  assert(
    !result.message.includes(recoverAutoRecommendation),
    "doctor should not recommend /recover auto under low pressure",
  );
  assert(
    !result.message.includes(recoverStrictRecommendation),
    "doctor should not recommend strict recover gate under low pressure",
  );

  const indexRecoverPlan = result.message.indexOf(recoverPlanRecommendation);
  const indexResumeInterrupted = result.message.indexOf(resumeInterruptedRecommendation);
  const indexRecoverInvestigate = result.message.indexOf(recoverInvestigateRecommendation);
  assert(
    indexRecoverPlan < indexResumeInterrupted && indexResumeInterrupted < indexRecoverInvestigate,
    "doctor low-pressure recovery ladder should be ordered: plan -> resume -> investigate",
  );
}

async function verifyDoctorFallbackInvestigate(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand(
    "/doctor fallback investigate suppression_ratio_pct=80 fallback_suppressed=4 fallback_used=1 retry_events=9 last_reason=retry_strategy last_strategy=background_load_shed",
  );
  assert(parsed, "parseSlashCommand should parse /doctor fallback investigate");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "doctor fallback investigate should not return error");

  const title = translate(locale, "agent.command.doctor.fallbackInvestigateTitle");
  const diagnosisHeader = translate(locale, "agent.command.doctor.fallbackInvestigateDiagnosisHeader");
  const verifyHeader = translate(locale, "agent.command.doctor.fallbackInvestigateVerifyHeader");
  const reasonLabel = translate(locale, "agent.trace.fallbackSuppressedReason.retry_strategy");
  const strategyLabel = translate(locale, "agent.trace.retryStrategy.background_load_shed");
  const scopeLine = translate(locale, "agent.command.doctor.fallbackInvestigateScope", {
    suppressed: 4,
    used: 1,
    ratio: 80,
    retryEvents: 9,
    reason: reasonLabel,
    strategy: strategyLabel,
    pressure: translate(locale, "agent.trace.queuePressure.idle"),
  });

  assert(result.message.includes(title), "doctor fallback investigate should include title");
  assert(result.message.includes(scopeLine), "doctor fallback investigate should include scope line");
  assert(result.message.includes(diagnosisHeader), "doctor fallback investigate should include diagnosis header");
  assert(result.message.includes(verifyHeader), "doctor fallback investigate should include verify header");
}

async function verifyDoctorRecoverInvestigate(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const events: QueryStreamEvent[] = [
    ...buildEvents(now),
    {
      type: "query_end",
      terminalReason: "aborted",
      durationMs: 160,
      at: now + 180,
    },
    {
      type: "query_end",
      terminalReason: "error",
      durationMs: 220,
      at: now + 181,
      error: "simulated recover failure",
    },
    {
      type: "query_end",
      terminalReason: "max_iterations",
      durationMs: 300,
      at: now + 182,
    },
    {
      type: "query_end",
      terminalReason: "stop_hook_prevented",
      durationMs: 310,
      at: now + 183,
    },
    {
      type: "command_lifecycle",
      commandId: "cmd-recover-failed",
      command: "/recover resume",
      state: "failed",
      lane: "foreground",
      queued: false,
      terminalReason: "error",
      at: now + 184,
    },
    {
      type: "command_lifecycle",
      commandId: "cmd-recover-aborted",
      command: "/recover resume",
      state: "aborted",
      lane: "foreground",
      queued: false,
      terminalReason: "aborted",
      at: now + 185,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 7,
      queueLimit: 8,
      reason: "capacity",
      priority: "now",
      at: now + 186,
    },
  ];
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-recover-${index + 1}`,
    query: `/trace ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-recover-queue-${index + 1}`,
    commandLabel: "/trace",
    priority: index < 3 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted",
      role: "user",
      content: "continue previous coding task",
      status: "completed",
    },
  ];

  const parsed = parseSlashCommand("/doctor recover investigate");
  assert(parsed, "parseSlashCommand should parse /doctor recover investigate");

  const result = await registry.execute(
    parsed,
    createContext(locale, events, {
      queuedQueries,
      queueLimit: 8,
      messages,
    }),
  );
  assert(!result.error, "doctor recover investigate should not return error");

  const title = translate(locale, "agent.command.doctor.recoverInvestigateTitle");
  const scope = translate(locale, "agent.command.doctor.recoverInvestigateScope", {
    state: translate(locale, "agent.command.recover.reason.awaiting_assistant"),
    message: "msg-user-interrupted",
    queue: 7,
    limit: 8,
    pressure: translate(locale, "agent.trace.queuePressure.congested"),
    running: 0,
    aborted: 1,
    error: 1,
    maxIterations: 1,
    stopHook: 1,
    lifecycleFailed: 1,
    lifecycleAborted: 1,
    rejected: 1,
  });
  const assessment = translate(locale, "agent.command.doctor.recoverInvestigateAssessmentHigh");
  const diagnosisHeader = translate(locale, "agent.command.doctor.recoverInvestigateDiagnosisHeader");
  const fixResume = translate(locale, "agent.command.doctor.recoverInvestigateFixResume");
  const fixQueueHeal = translate(locale, "agent.command.doctor.recoverInvestigateFixQueueHeal");
  const verifyHeader = translate(locale, "agent.command.doctor.recoverInvestigateVerifyHeader");

  assert(result.message.includes(title), "doctor recover investigate should include title");
  assert(result.message.includes(scope), "doctor recover investigate should include scope line");
  assert(result.message.includes(assessment), "doctor recover investigate should include high-risk assessment");
  assert(result.message.includes(diagnosisHeader), "doctor recover investigate should include diagnosis header");
  assert(result.message.includes(fixResume), "doctor recover investigate should include resume fix guidance");
  assert(result.message.includes(fixQueueHeal), "doctor recover investigate should include queue-heal fix guidance");
  assert(result.message.includes(verifyHeader), "doctor recover investigate should include verify header");
}

async function verifyDoctorRecoverInvestigateDeduplicatedQueue(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const events: QueryStreamEvent[] = [
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 8,
      priority: "later",
      reason: "deduplicated",
      at: now - 30,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 8,
      priority: "later",
      reason: "deduplicated",
      at: now - 20,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 8,
      priority: "later",
      reason: "deduplicated",
      at: now - 10,
    },
  ];
  const parsed = parseSlashCommand("/doctor recover investigate queue_count=1 queue_limit=8");
  assert(parsed, "parseSlashCommand should parse /doctor recover investigate with explicit queue window");
  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "doctor recover investigate should not return error for deduplicated queue signals");

  const fixQueueHeal = translate(locale, "agent.command.doctor.recoverInvestigateFixQueueHeal");
  const fixQueueHealIfNeeded = translate(locale, "agent.command.doctor.recoverInvestigateFixQueueHealIfNeeded");
  assert(
    result.message.includes(fixQueueHeal),
    "doctor recover investigate should escalate to queue-heal fix when deduplicated queue signals are high",
  );
  assert(
    !result.message.includes(fixQueueHealIfNeeded),
    "doctor recover investigate should not downgrade queue-heal fix when deduplicated queue signals are high",
  );
}

async function verifyRecoverInvestigateShortcut(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const parsed = parseSlashCommand("/recover investigate");
  assert(parsed, "parseSlashCommand should parse /recover investigate");

  const result = await registry.execute(parsed, createContext(locale, buildEvents()));
  assert(!result.error, "recover investigate should not return error");

  const title = translate(locale, "agent.command.doctor.recoverInvestigateTitle");
  assert(result.message.includes(title), "recover investigate shortcut should include recover investigate title");
}

async function verifyRecoverResumeReusesQueuedRecovery(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const continuePrompt = translate(locale, "agent.command.recover.continuePrompt");
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-recover-existing",
      query: continuePrompt,
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 5_000,
      commandId: "cmd-recover-existing",
      commandLabel: "/recover resume",
      priority: "later",
    },
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-reuse",
      role: "user",
      content: "resume previous interrupted turn",
      status: "completed",
    },
  ];
  let submitCalled = false;
  const parsed = parseSlashCommand("/recover resume");
  assert(parsed, "parseSlashCommand should parse /recover resume");
  const context = createContext(locale, buildEvents(now), {
    queuedQueries,
    queueLimit: 8,
    messages,
    submitFollowupQuery: () => {
      submitCalled = true;
      return {
        accepted: false,
        reason: "queue_full",
        queueCount: queuedQueries.length,
        queueLimit: 8,
      };
    },
  });

  const result = await registry.execute(parsed, context);
  assert(!result.error, "recover resume should reuse queued recovery without failing");
  assert(!submitCalled, "recover resume should not call submitFollowupQuery when recovery is already queued");

  const reusedLine = translate(locale, "agent.command.recover.resumeAlreadyQueued", {
    id: "q-recover-existing",
    queue: 1,
    limit: 8,
  });
  const promotedLine = translate(locale, "agent.command.recover.resumeAlreadyQueuedPromoted", {
    id: "q-recover-existing",
  });
  const hintLine = translate(locale, "agent.command.recover.resumeAlreadyQueuedHint");

  assert(result.message.includes(reusedLine), "recover resume should include queued-reuse line");
  assert(result.message.includes(promotedLine), "recover resume should promote queued recovery to now");
  assert(result.message.includes(hintLine), "recover resume should include queued-reuse hint");
  const queueListParsed = parseSlashCommand("/queue list");
  assert(queueListParsed, "parseSlashCommand should parse /queue list after queued recovery reuse");
  const queueListResult = await registry.execute(queueListParsed, context);
  assert(!queueListResult.error, "queue list after queued recovery reuse should not return error");
  const nowLabel = translate(locale, "agent.queue.priority.now");
  assert(
    queueListResult.message.includes(`q-recover-existing [${nowLabel}]`),
    "recover resume should promote existing queued recovery priority to now",
  );
}

async function verifyRecoverResumeReusesQueuedRecoveryAcrossLocales(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedPromptLocale: AppLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
  const queuedPrompt = translate(queuedPromptLocale, "agent.command.recover.continuePrompt");
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-recover-cross-locale-resume",
      query: queuedPrompt,
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 6_000,
      commandId: "cmd-recover-cross-locale-resume",
      commandLabel: queuedPrompt,
      priority: "later",
    },
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-cross-locale-resume",
      role: "user",
      content: "resume previous interrupted turn",
      status: "completed",
    },
  ];
  let submitCalled = false;
  const parsed = parseSlashCommand("/recover resume");
  assert(parsed, "parseSlashCommand should parse /recover resume for cross-locale queued reuse");
  const context = createContext(locale, buildEvents(now), {
    queuedQueries,
    queueLimit: 8,
    messages,
    submitFollowupQuery: () => {
      submitCalled = true;
      return {
        accepted: false,
        reason: "queue_full",
        queueCount: queuedQueries.length,
        queueLimit: 8,
      };
    },
  });

  const result = await registry.execute(parsed, context);
  assert(!result.error, "recover resume should reuse cross-locale queued recovery without failing");
  assert(!submitCalled, "recover resume should not call submitFollowupQuery for cross-locale queued recovery");

  const reusedLine = translate(locale, "agent.command.recover.resumeAlreadyQueued", {
    id: "q-recover-cross-locale-resume",
    queue: 1,
    limit: 8,
  });
  const promotedLine = translate(locale, "agent.command.recover.resumeAlreadyQueuedPromoted", {
    id: "q-recover-cross-locale-resume",
  });
  const hintLine = translate(locale, "agent.command.recover.resumeAlreadyQueuedHint");

  assert(
    result.message.includes(reusedLine),
    "recover resume should include queued-reuse line for cross-locale prompt",
  );
  assert(
    result.message.includes(promotedLine),
    "recover resume should promote cross-locale queued recovery to now",
  );
  assert(
    result.message.includes(hintLine),
    "recover resume should include queued-reuse hint for cross-locale prompt",
  );
}

async function verifyRecoverResumeQueueFullGuidance(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-stale-recover",
      query: "/trace stale",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 11 * 60_000,
      commandId: "cmd-stale-recover",
      commandLabel: "/trace",
      priority: "later",
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `q-full-${index + 1}`,
      query: `/trace active ${index + 1}`,
      model: "demo-model",
      permissionMode: "default" as const,
      queuedAt: now - (index + 1) * 1_000,
      commandId: `cmd-full-${index + 1}`,
      commandLabel: "/trace",
      priority: "next" as const,
    })),
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-full",
      role: "user",
      content: "continue now",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover resume");
  assert(parsed, "parseSlashCommand should parse /recover resume for queue-full guidance");
  const context = createContext(locale, buildEvents(now), {
    queuedQueries,
    queueLimit: 8,
    messages,
    submitFollowupQuery: () => ({
      accepted: false,
      reason: "queue_full",
      queueCount: 8,
      queueLimit: 8,
    }),
  });

  const result = await registry.execute(parsed, context);
  assert(result.error, "recover resume should return error when queue remains full");

  const queueFullLine = translate(locale, "agent.command.recover.resumeQueueFull", {
    queue: 8,
    limit: 8,
  });
  const afterPruneLine = translate(locale, "agent.command.recover.resumeQueueFullAfterPrune", {
    count: 1,
    minutes: 10,
  });
  const healHint = translate(locale, "agent.command.recover.resumeQueueFullHintHeal");
  const investigateHint = translate(locale, "agent.command.recover.resumeQueueFullHintInvestigate");

  assert(result.message.includes(queueFullLine), "recover resume queue-full path should include queue-full line");
  assert(result.message.includes(afterPruneLine), "recover resume should include stale-prune line before queue-full");
  assert(result.message.includes(healHint), "recover resume queue-full path should include queue-heal hint");
  assert(result.message.includes(investigateHint), "recover resume queue-full path should include investigate hint");
  const queueListParsed = parseSlashCommand("/queue list");
  assert(queueListParsed, "parseSlashCommand should parse /queue list after queue-full guidance");
  const queueListResult = await registry.execute(queueListParsed, context);
  assert(!queueListResult.error, "queue list after queue-full guidance should not return error");
  assert(
    !queueListResult.message.includes("q-stale-recover"),
    "recover resume queue-full path should prune stale queued item before reporting failure",
  );
}

async function verifyRecoverAutoPolicyNext(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-auto-${index + 1}`,
    query: `/trace auto ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-auto-${index + 1}`,
    commandLabel: "/trace",
    priority: index < 2 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-auto",
      role: "user",
      content: "continue interrupted turn",
      status: "completed",
    },
  ];
  let capturedPriority: "now" | "next" | "later" | undefined;
  const parsed = parseSlashCommand("/recover auto");
  assert(parsed, "parseSlashCommand should parse /recover auto");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
      submitFollowupQuery: (_query, options) => {
        capturedPriority = options?.priority;
        return {
          accepted: true,
          queueCount: 8,
          queueLimit: 8,
          queuedId: "q-auto-recover",
          started: false,
          commandId: "cmd-auto-recover",
        };
      },
    }),
  );
  assert(!result.error, "recover auto should not return error under high pressure");
  assert(capturedPriority === "next", "recover auto should choose next priority under congested queue pressure");

  const autoPolicy = translate(locale, "agent.command.recover.resumeAutoPolicyNext");
  const queuedLine = translate(locale, "agent.command.recover.resumeQueued", {
    queue: 8,
    limit: 8,
  });
  assert(result.message.includes(autoPolicy), "recover auto should include auto policy line");
  assert(result.message.includes(queuedLine), "recover auto should include queued confirmation");
}

async function verifyRecoverExecuteChecklist(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-exec-${index + 1}`,
    query: `/trace execute ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-exec-${index + 1}`,
    commandLabel: "/trace execute",
    priority: index < 2 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-execute",
      role: "user",
      content: "resume interrupted turn",
      status: "completed",
    },
  ];
  let capturedPriority: "now" | "next" | "later" | undefined;
  const parsed = parseSlashCommand("/recover execute");
  assert(parsed, "parseSlashCommand should parse /recover execute");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
      submitFollowupQuery: (_query, options) => {
        capturedPriority = options?.priority;
        return {
          accepted: true,
          queueCount: 8,
          queueLimit: 8,
          queuedId: "q-exec-recover",
          started: false,
          commandId: "cmd-exec-recover",
        };
      },
    }),
  );
  assert(!result.error, "recover execute should not return error under high pressure");
  assert(capturedPriority === "next", "recover execute should choose next priority under congested queue pressure");

  const executeTitle = translate(locale, "agent.command.recover.executeTitle");
  const autoPolicy = translate(locale, "agent.command.recover.resumeAutoPolicyNext");
  const checklistTitle = translate(locale, "agent.command.recover.executeChecklistTitle");
  const checklistStatus = translate(locale, "agent.command.recover.executeChecklistStatus");
  const checklistQueue = translate(locale, "agent.command.recover.executeChecklistQueueRequired");
  const checklistInvestigate = translate(locale, "agent.command.recover.executeChecklistInvestigate");
  assert(result.message.includes(executeTitle), "recover execute should include execute title");
  assert(result.message.includes(autoPolicy), "recover execute should include auto policy line");
  assert(result.message.includes(checklistTitle), "recover execute should include checklist title");
  assert(result.message.includes(checklistStatus), "recover execute should include status checklist item");
  assert(result.message.includes(checklistQueue), "recover execute should include queue checklist item");
  assert(
    result.message.includes(checklistInvestigate),
    "recover execute should include investigate checklist item",
  );
}

async function verifyRecoverExecuteStrictGate(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-exec-strict-${index + 1}`,
    query: `/trace strict ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-exec-strict-${index + 1}`,
    commandLabel: "/trace strict",
    priority: index < 2 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-execute-strict",
      role: "user",
      content: "resume interrupted turn with strict checks",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover execute --strict");
  assert(parsed, "parseSlashCommand should parse /recover execute --strict");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
      submitFollowupQuery: (_query, _options) => ({
        accepted: false,
        reason: "queue_full",
        queueCount: 8,
        queueLimit: 8,
      }),
    }),
  );
  assert(result.error, "recover execute --strict should return error when resume enqueue is rejected");
  const strictTitle = translate(locale, "agent.command.recover.executeStrictTitle");
  const strictFail = translate(locale, "agent.command.recover.executeStrictFail");
  const strictStatusCheck = translate(locale, "agent.command.recover.executeStrictStatusCheck");
  const strictQueueCheck = translate(locale, "agent.command.recover.executeStrictQueueCheckRequired");
  assert(result.message.includes(strictTitle), "recover execute --strict should include strict gate title");
  assert(result.message.includes(strictFail), "recover execute --strict should include strict fail line");
  assert(result.message.includes(strictStatusCheck), "recover execute --strict should include strict status check");
  assert(result.message.includes(strictQueueCheck), "recover execute --strict should include strict queue check");
}

async function verifyRecoverExecuteStrictNoop(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const parsed = parseSlashCommand("/recover execute --strict");
  assert(parsed, "parseSlashCommand should parse /recover execute --strict for noop path");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries: [],
      queueLimit: 8,
      messages: [],
    }),
  );
  assert(!result.error, "recover execute --strict should not error when there is no interrupted state");

  const noInterruption = translate(locale, "agent.command.recover.noInterruption");
  const strictTitle = translate(locale, "agent.command.recover.executeStrictTitle");
  const strictNoop = translate(locale, "agent.command.recover.executeStrictNoop");
  const strictQueueOptional = translate(locale, "agent.command.recover.executeStrictQueueCheckOptional");
  assert(result.message.includes(noInterruption), "recover execute --strict noop path should report no interruption");
  assert(result.message.includes(strictTitle), "recover execute --strict noop path should include strict title");
  assert(result.message.includes(strictNoop), "recover execute --strict noop path should include strict noop line");
  assert(
    result.message.includes(strictQueueOptional),
    "recover execute --strict noop path should include optional queue check",
  );
}

async function verifyRecoverExecuteStrictPass(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-execute-strict-pass",
      role: "user",
      content: "continue interrupted turn with strict gate",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover execute --strict");
  assert(parsed, "parseSlashCommand should parse /recover execute --strict for pass path");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries: [],
      queueLimit: 8,
      messages,
      submitFollowupQuery: (_query, _options) => ({
        accepted: true,
        queueCount: 1,
        queueLimit: 8,
        queuedId: "q-exec-strict-pass",
        started: false,
        commandId: "cmd-exec-strict-pass",
      }),
    }),
  );
  assert(!result.error, "recover execute --strict should pass when enqueue succeeds");

  const strictTitle = translate(locale, "agent.command.recover.executeStrictTitle");
  const strictPass = translate(locale, "agent.command.recover.executeStrictPass");
  const strictStatusCheck = translate(locale, "agent.command.recover.executeStrictStatusCheck");
  const strictQueueOptional = translate(locale, "agent.command.recover.executeStrictQueueCheckOptional");
  assert(result.message.includes(strictTitle), "recover execute --strict pass path should include strict title");
  assert(result.message.includes(strictPass), "recover execute --strict pass path should include strict pass line");
  assert(
    result.message.includes(strictStatusCheck),
    "recover execute --strict pass path should include strict status check",
  );
  assert(
    result.message.includes(strictQueueOptional),
    "recover execute --strict pass path should include optional queue check",
  );
}

async function verifyRecoverPlanRunbook(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-plan-${index + 1}`,
    query: `/trace plan ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-plan-${index + 1}`,
    commandLabel: "/trace plan",
    priority: index < 2 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-plan",
      role: "user",
      content: "continue interrupted turn with a runbook",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover plan");
  assert(parsed, "parseSlashCommand should parse /recover plan");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
    }),
  );
  assert(!result.error, "recover plan should not return error");

  const title = translate(locale, "agent.command.recover.planTitle");
  const scope = translate(locale, "agent.command.recover.planScope", {
    state: translate(locale, "agent.command.recover.reason.awaiting_assistant"),
    plan: translate(locale, "agent.command.recover.plan.heal_then_resume"),
    queue: 7,
    limit: 8,
    pressure: translate(locale, "agent.trace.queuePressure.congested"),
  });
  const stepHeal = translate(locale, "agent.command.recover.planActionHeal");
  const stepResume = translate(locale, "agent.command.recover.planActionResume");
  const stepStrict = translate(locale, "agent.command.recover.planActionStrict");
  const stepInvestigate = translate(locale, "agent.command.recover.planActionInvestigate");
  assert(result.message.includes(title), "recover plan should include plan title");
  assert(result.message.includes(scope), "recover plan should include scope line");
  assert(result.message.includes(stepHeal), "recover plan should include queue-heal step");
  assert(result.message.includes(stepResume), "recover plan should include resume step");
  assert(result.message.includes(stepStrict), "recover plan should include strict gate step");
  assert(result.message.includes(stepInvestigate), "recover plan should include investigate fallback step");
}

async function verifyRecoverRunbookAlias(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `q-runbook-${index + 1}`,
    query: `/trace runbook ${index + 1}`,
    model: "demo-model",
    permissionMode: "default",
    queuedAt: now - (index + 1) * 1_000,
    commandId: `cmd-runbook-${index + 1}`,
    commandLabel: "/trace runbook",
    priority: index < 2 ? "now" : index < 5 ? "next" : "later",
  }));
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-runbook",
      role: "user",
      content: "resume interrupted turn with runbook alias",
      status: "completed",
    },
  ];
  const parsedPlan = parseSlashCommand("/recover plan");
  assert(parsedPlan, "parseSlashCommand should parse /recover plan in runbook alias check");
  const parsedRunbook = parseSlashCommand("/recover runbook");
  assert(parsedRunbook, "parseSlashCommand should parse /recover runbook alias");

  const planResult = await registry.execute(
    parsedPlan,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
    }),
  );
  const runbookResult = await registry.execute(
    parsedRunbook,
    createContext(locale, buildEvents(now), {
      queuedQueries,
      queueLimit: 8,
      messages,
    }),
  );
  assert(!planResult.error, "recover plan should not fail in runbook alias check");
  assert(!runbookResult.error, "recover runbook alias should not fail");
  assert(
    runbookResult.message === planResult.message,
    "recover runbook alias should produce the same deterministic runbook as /recover plan",
  );

  const executeTitle = translate(locale, "agent.command.recover.executeTitle");
  assert(
    !runbookResult.message.includes(executeTitle),
    "recover runbook alias should not trigger execute checklist output",
  );
}

async function verifyRecoverStrictAlias(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-strict-alias",
      role: "user",
      content: "continue interrupted turn strict alias",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover strict");
  assert(parsed, "parseSlashCommand should parse /recover strict");

  const result = await registry.execute(
    parsed,
    createContext(locale, buildEvents(now), {
      queuedQueries: [],
      queueLimit: 8,
      messages,
      submitFollowupQuery: (_query, _options) => ({
        accepted: true,
        queueCount: 1,
        queueLimit: 8,
        queuedId: "q-strict-alias",
        started: false,
        commandId: "cmd-strict-alias",
      }),
    }),
  );
  assert(!result.error, "recover strict alias should execute strict flow without errors");
  const strictTitle = translate(locale, "agent.command.recover.executeStrictTitle");
  const strictPass = translate(locale, "agent.command.recover.executeStrictPass");
  assert(result.message.includes(strictTitle), "recover strict alias should include strict title");
  assert(result.message.includes(strictPass), "recover strict alias should include strict pass line");
}

async function verifyRecoverStatusIncludesPlanAndQueuedRecovery(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const continuePrompt = translate(locale, "agent.command.recover.continuePrompt");
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-recover-status",
      query: continuePrompt,
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 2_000,
      commandId: "cmd-recover-status",
      commandLabel: continuePrompt,
      priority: "next",
    },
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-status",
      role: "user",
      content: "resume my last interrupted turn",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover status");
  assert(parsed, "parseSlashCommand should parse /recover status");

  const result = await registry.execute(parsed, createContext(locale, buildEvents(now), { queuedQueries, messages }));
  assert(!result.error, "recover status should not return error");

  const interruptedLine = translate(locale, "agent.command.recover.state.interrupted", {
    reason: translate(locale, "agent.command.recover.reason.awaiting_assistant"),
    id: "msg-user-interrupted-status",
  });
  const statusPlanLine = translate(locale, "agent.command.recover.statusPlan", {
    plan: translate(locale, "agent.command.recover.plan.queued_recovery"),
  });
  const queuedLine = translate(locale, "agent.command.recover.statusQueuedRecovery", {
    id: "q-recover-status",
    priority: translate(locale, "agent.queue.priority.next"),
  });
  const hintPlanLine = translate(locale, "agent.command.recover.statusHintPlan");
  assert(result.message.includes(interruptedLine), "recover status should include interrupted state details");
  assert(result.message.includes(statusPlanLine), "recover status should include queued-recovery plan");
  assert(result.message.includes(queuedLine), "recover status should include queued recovery item details");
  assert(result.message.includes(hintPlanLine), "recover status should include plan hint line");
}

async function verifyRecoverStatusMatchesQueuedRecoveryAcrossLocales(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedPromptLocale: AppLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
  const queuedPrompt = translate(queuedPromptLocale, "agent.command.recover.continuePrompt");
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-recover-cross-locale",
      query: queuedPrompt,
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 2_500,
      commandId: "cmd-recover-cross-locale",
      commandLabel: queuedPrompt,
      priority: "next",
    },
  ];
  const messages: AgentMessage[] = [
    {
      id: "msg-user-interrupted-cross-locale",
      role: "user",
      content: "please continue",
      status: "completed",
    },
  ];
  const parsed = parseSlashCommand("/recover status");
  assert(parsed, "parseSlashCommand should parse /recover status for cross-locale queued recovery");

  const result = await registry.execute(parsed, createContext(locale, buildEvents(now), { queuedQueries, messages }));
  assert(!result.error, "recover status cross-locale check should not return error");

  const statusPlanLine = translate(locale, "agent.command.recover.statusPlan", {
    plan: translate(locale, "agent.command.recover.plan.queued_recovery"),
  });
  const queuedLine = translate(locale, "agent.command.recover.statusQueuedRecovery", {
    id: "q-recover-cross-locale",
    priority: translate(locale, "agent.queue.priority.next"),
  });
  assert(
    result.message.includes(statusPlanLine),
    "recover status should still detect queued-recovery plan when prompt language differs",
  );
  assert(
    result.message.includes(queuedLine),
    "recover status should still surface queued recovery id when prompt language differs",
  );
}

async function verifyRecoverRunbookBlueprintMatrix() {
  const cases: Array<{
    name: string;
    stateKind: RecoverStateKind;
    queueCount: number;
    queueLimit: number;
    queueDeduplicatedCount: number;
    queueRejectedCount: number;
    failureTotal: number;
    expectedSteps: RecoverRunbookStep[];
    expectedRecommendations: RecoverDoctorRecommendation[];
  }> = [
    {
      name: "none/no-signals",
      stateKind: "none",
      queueCount: 0,
      queueLimit: 8,
      queueDeduplicatedCount: 0,
      queueRejectedCount: 0,
      failureTotal: 0,
      expectedSteps: [],
      expectedRecommendations: [],
    },
    {
      name: "none/failure-only",
      stateKind: "none",
      queueCount: 0,
      queueLimit: 8,
      queueDeduplicatedCount: 0,
      queueRejectedCount: 0,
      failureTotal: 2,
      expectedSteps: [],
      expectedRecommendations: ["recoverInvestigate"],
    },
    {
      name: "none/queue-heal-needed",
      stateKind: "none",
      queueCount: 7,
      queueLimit: 8,
      queueDeduplicatedCount: 3,
      queueRejectedCount: 0,
      failureTotal: 0,
      expectedSteps: [],
      expectedRecommendations: ["queueHeal", "queueInvestigate"],
    },
    {
      name: "awaiting/low-pressure",
      stateKind: "awaiting_assistant",
      queueCount: 1,
      queueLimit: 8,
      queueDeduplicatedCount: 0,
      queueRejectedCount: 0,
      failureTotal: 0,
      expectedSteps: ["plan", "resume", "investigate"],
      expectedRecommendations: ["recoverPlan", "resumeInterruptedTurn", "recoverInvestigate"],
    },
    {
      name: "awaiting/high-pressure",
      stateKind: "awaiting_assistant",
      queueCount: 7,
      queueLimit: 8,
      queueDeduplicatedCount: 3,
      queueRejectedCount: 1,
      failureTotal: 0,
      expectedSteps: ["plan", "heal", "auto", "strict", "investigate"],
      expectedRecommendations: [
        "queueHeal",
        "queueInvestigate",
        "recoverAuto",
        "recoverExecuteStrict",
        "recoverPlan",
        "resumeInterruptedTurn",
        "recoverInvestigate",
      ],
    },
    {
      name: "incomplete/failure-strict",
      stateKind: "assistant_incomplete",
      queueCount: 1,
      queueLimit: 8,
      queueDeduplicatedCount: 0,
      queueRejectedCount: 0,
      failureTotal: 3,
      expectedSteps: ["plan", "resume", "strict", "investigate"],
      expectedRecommendations: [
        "recoverExecuteStrict",
        "recoverPlan",
        "resumeInterruptedTurn",
        "recoverInvestigate",
      ],
    },
  ];

  for (const testCase of cases) {
    const decision = deriveRecoverActionDecision({
      stateKind: testCase.stateKind,
      queueCount: testCase.queueCount,
      queueLimit: testCase.queueLimit,
      queueDeduplicatedCount: testCase.queueDeduplicatedCount,
      queueRejectedCount: testCase.queueRejectedCount,
      failureTotal: testCase.failureTotal,
    });
    const blueprint = deriveRecoverRunbookBlueprint(testCase.stateKind, decision);
    assertArrayEquals(blueprint.steps, testCase.expectedSteps, `recover blueprint steps mismatch: ${testCase.name}`);
    assertArrayEquals(
      blueprint.recommendations,
      testCase.expectedRecommendations,
      `recover blueprint recommendations mismatch: ${testCase.name}`,
    );
  }
}

async function verifyRecoverRecommendationPresentationPlanner() {
  const highRiskRows = deriveRecoverDoctorRecommendationPresentations(
    [
      "queueHeal",
      "queueHeal",
      "queueInvestigate",
      "recoverPlan",
      "recoverInvestigate",
    ],
    {
      shouldRelieveQueueWithHeal: true,
      hasFailureSignals: true,
      failureTotal: 2,
      queueInvestigateCommand: "/doctor queue investigate thread=thread-demo pressure=congested",
    },
  );

  assert(highRiskRows.length === 4, "recover presentation planner should deduplicate recommendations");
  assert(
    highRiskRows[0]?.recommendation === "queueHeal" &&
      highRiskRows[1]?.recommendation === "queueInvestigate" &&
      highRiskRows[2]?.recommendation === "recoverPlan" &&
      highRiskRows[3]?.recommendation === "recoverInvestigate",
    "recover presentation planner should preserve first-seen recommendation order",
  );
  assert(
    highRiskRows[1]?.resolvedCommand === "/doctor queue investigate thread=thread-demo pressure=congested",
    "recover presentation planner should apply queue investigate command override",
  );
  assert(
    highRiskRows[0]?.severity === "high" &&
      highRiskRows[1]?.severity === "high" &&
      highRiskRows[2]?.severity === "medium" &&
      highRiskRows[3]?.severity === "high",
    "recover presentation planner should derive expected high-risk severities",
  );

  const lowRiskRows = deriveRecoverDoctorRecommendationPresentations(
    ["resumeInterruptedTurn", "recoverExecuteStrict", "recoverAuto"],
    {
      shouldRelieveQueueWithHeal: false,
      hasFailureSignals: false,
      failureTotal: 0,
      queueInvestigateCommand: "",
    },
  );
  assert(
    lowRiskRows[0]?.severity === "low" &&
      lowRiskRows[1]?.severity === "medium" &&
      lowRiskRows[2]?.severity === "medium",
    "recover presentation planner should derive expected low-pressure severities",
  );
  assert(
    lowRiskRows[0]?.resolvedCommand === "/recover resume" &&
      lowRiskRows[1]?.resolvedCommand === "/recover execute --strict" &&
      lowRiskRows[2]?.resolvedCommand === "/recover auto",
    "recover presentation planner should keep canonical commands when no override is provided",
  );
}

function verifyRecoverCommandRuntimeDeterministic(): void {
  const messages: AgentMessage[] = [
    {
      id: "msg-user-1",
      role: "user",
      content: "continue",
      status: "completed",
    },
  ];
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "queue-1",
      query: "run lint",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 1,
      commandId: "cmd-1",
      commandLabel: "/lint",
      priority: "next",
    },
    {
      id: "queue-2",
      query: "continue",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 2,
      commandId: "cmd-2",
      commandLabel: "/recover resume",
      priority: "now",
    },
  ];
  const events: QueryStreamEvent[] = [
    {
      type: "query_end",
      terminalReason: "error",
      durationMs: 1,
      at: 1,
    },
    {
      type: "query_end",
      terminalReason: "aborted",
      durationMs: 1,
      at: 2,
    },
    {
      type: "command_lifecycle",
      commandId: "cmd-failed",
      command: "/recover execute --strict",
      state: "failed",
      lane: "foreground",
      queued: false,
      at: 3,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 2,
      queueLimit: 6,
      reason: "capacity",
      at: 4,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 6,
      reason: "deduplicated",
      at: 5,
    },
  ];

  const baseSnapshot = buildRecoverCommandRuntimeSnapshot({
    messages,
    queuedQueries,
    queueLimit: 6,
    events,
    queuedRecoveryMatcher: (query) => query.trim() === "continue",
  });
  assert(
    baseSnapshot.state.kind === "awaiting_assistant" &&
      baseSnapshot.state.lastMessageId === "msg-user-1",
    "recover command runtime should preserve state derived from latest user message",
  );
  assert(
    baseSnapshot.plan.kind === "queued_recovery" &&
      baseSnapshot.plan.queueCount === 2 &&
      baseSnapshot.plan.queueLimit === 6 &&
      baseSnapshot.plan.queuedRecovery?.id === "queue-2",
    "recover command runtime should default queue count from queued length and resolve queued recovery via matcher",
  );
  assert(
    baseSnapshot.signals.failureTotal === 3 &&
      baseSnapshot.signals.failure.query_end_error === 1 &&
      baseSnapshot.signals.failure.query_end_aborted === 1 &&
      baseSnapshot.signals.failure.lifecycle_failed === 1 &&
      baseSnapshot.signals.queueRejectedCount === 1 &&
      baseSnapshot.signals.queueDeduplicatedCount === 1,
    "recover command runtime should pass events through to deterministic signal counters",
  );

  const clampedSnapshot = buildRecoverCommandRuntimeSnapshot({
    messages,
    queuedQueries,
    queueLimit: -2,
    queueCountOverride: -5,
    queueLimitOverride: Number.NaN,
    events: [],
    queuedRecoveryMatcher: () => false,
  });
  assert(
    clampedSnapshot.plan.queueCount === 0 &&
      clampedSnapshot.plan.queueLimit === 0 &&
      clampedSnapshot.plan.pressure === "idle" &&
      clampedSnapshot.plan.kind === "resume_now",
    "recover command runtime should clamp negative or non-finite overrides to zero and keep deterministic resume plan",
  );

  const roundedOverrideSnapshot = buildRecoverCommandRuntimeSnapshot({
    messages,
    queuedQueries,
    queueLimit: 6,
    queueCountOverride: 7.6,
    queueLimitOverride: 9.2,
    events: [],
    queuedRecoveryMatcher: () => false,
  });
  assert(
    roundedOverrideSnapshot.plan.queueCount === 8 &&
      roundedOverrideSnapshot.plan.queueLimit === 9 &&
      roundedOverrideSnapshot.plan.pressure === "congested" &&
      roundedOverrideSnapshot.plan.kind === "heal_then_resume",
    "recover command runtime should round queue overrides and derive queue-pressure plan deterministically",
  );
}

function verifyTraceRunRuntimeDeterministic(): void {
  assertArrayEquals(
    [...TRACE_CATEGORY_ORDER],
    ["query", "prompt", "tools", "permission", "queue", "retry", "continue"],
    "trace run runtime should expose deterministic trace category order",
  );

  const events: QueryStreamEvent[] = [
    {
      type: "command_lifecycle",
      commandId: "cmd-1",
      command: "/trace summary",
      state: "started",
      lane: "foreground",
      queued: false,
      at: 1,
    },
    {
      type: "query_start",
      model: "demo-model",
      queueCount: 0,
      at: 2,
    },
    {
      type: "tool_result",
      tool: "shell",
      outcome: "error",
      at: 3,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk mutation",
      reversibility: "hard_to_reverse",
      blastRadius: "shared",
      at: 4,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 1,
      queueLimit: 4,
      reason: "capacity",
      priority: "now",
      at: 5,
    },
    {
      type: "query_end",
      terminalReason: "completed",
      durationMs: 80,
      at: 6,
    },
    {
      type: "query_start",
      model: "demo-model",
      queueCount: 0,
      at: 10,
    },
    {
      type: "tool_result",
      tool: "shell",
      outcome: "result",
      at: 11,
    },
    {
      type: "query_end",
      terminalReason: "completed",
      durationMs: 40,
      at: 12,
    },
  ];

  const runs = buildTraceRunSummaries(events);
  assert(
    runs.length === 2 &&
      runs[0]?.startedAt === 1 &&
      runs[0]?.endedAt === 6 &&
      runs[0]?.terminalReason === "completed" &&
      runs[0]?.events.length === 6 &&
      runs[1]?.startedAt === 10 &&
      runs[1]?.endedAt === 12 &&
      runs[1]?.events.length === 3,
    "trace run runtime should build deterministic run boundaries and lifecycle+query_start merge behavior",
  );

  assert(
    getTraceEventFilter(events[2]!) === "tools" &&
      getTraceEventFilter(events[3]!) === "permission" &&
      getTraceEventFilter(events[4]!) === "queue" &&
      getTraceEventSeverity(events[2]!) === "error" &&
      getTraceEventSeverity(events[3]!) === "warn" &&
      getTraceEventSeverity(events[4]!) === "warn",
    "trace run runtime should map event filter buckets and severities deterministically",
  );

  const warningsOnly = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: true,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  assert(
    warningsOnly.length === 1 &&
      warningsOnly[0]?.visibleEvents.length === 3 &&
      warningsOnly[0]?.warningCount === 2 &&
      warningsOnly[0]?.errorCount === 1 &&
      warningsOnly[0]?.categoryCounts.tools === 1 &&
      warningsOnly[0]?.categoryCounts.permission === 1 &&
      warningsOnly[0]?.categoryCounts.queue === 1,
    "trace run runtime should keep only warning/error events in warningsOnly mode and compute category counters",
  );

  const riskScoped = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "high_risk",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  assert(
    riskScoped.length === 1 &&
      riskScoped[0]?.visibleEvents.length === 1 &&
      riskScoped[0]?.visibleEvents[0]?.type === "permission_risk_profile" &&
      riskScoped[0]?.warningCount === 1 &&
      riskScoped[0]?.errorCount === 0,
    "trace run runtime should apply permission-risk filtering deterministically",
  );

  const recentOnly = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: 1,
  });
  assert(
    recentOnly.length === 1 && recentOnly[0]?.runIndex === 2 && recentOnly[0]?.visibleEvents.length === 3,
    "trace run runtime should honor run window slicing and keep latest runs only",
  );
}

function verifyTraceCommandParseRuntimeDeterministic(): void {
  assert(
    parseTraceFilterToken("perm") === "permission" &&
      parseTraceFilterToken("backoff") === "retry" &&
      parseTraceFilterToken("cont") === "continue",
    "trace command parse runtime should normalize deterministic filter aliases",
  );
  assert(
    parseTraceSummaryToken("RUN") &&
      parseTraceToolToken("tool:shell") === "shell" &&
      parseTraceToolToken("tool=") === "",
    "trace command parse runtime should detect summary/tool tokens deterministically",
  );
  assert(
    parseTraceRunWindowToken("window=6") === 6 &&
      parseTraceRunWindowToken("runs=all") === "all" &&
      parseTraceRunWindowToken("runs=0") === null,
    "trace command parse runtime should parse run-window tokens with deterministic invalid-window fallback",
  );
  assert(
    parseTraceRiskToken("risk=high") === "high_risk" &&
      parseTraceRiskToken("risk=unknown") === "invalid" &&
      parseTraceReversibilityToken("rev=hard") === "hard_to_reverse" &&
      parseTraceReversibilityToken("reversibility=oops") === "invalid" &&
      parseTraceBlastRadiusToken("blast=shared") === "shared" &&
      parseTraceBlastRadiusToken("blast=planet") === "invalid",
    "trace command parse runtime should normalize deterministic risk/reversibility/blast aliases",
  );

  const parsed = deriveTraceCommandParseSnapshot([
    "summary",
    "warn",
    "failure",
    "hotspots",
    "hottest",
    "investigate",
    "runbook",
    "workflow",
    "submit",
    "tool=shell",
    "runs=6",
    "risk=high",
    "rev=hard",
    "blast=shared",
    "tools",
    "12",
  ]);
  assert(
    parsed.ok &&
      parsed.snapshot.limit === 12 &&
      parsed.snapshot.filter === "tools" &&
      parsed.snapshot.warningsOnly &&
      parsed.snapshot.summaryMode &&
      parsed.snapshot.hotspotsMode &&
      parsed.snapshot.hottestMode &&
      parsed.snapshot.investigateMode &&
      parsed.snapshot.investigateRunbookMode &&
      parsed.snapshot.investigateWorkflowMode &&
      parsed.snapshot.investigateSubmitMode &&
      parsed.snapshot.failureFocus &&
      parsed.snapshot.toolFocus === "shell" &&
      parsed.snapshot.runWindow === 6 &&
      parsed.snapshot.riskFilter === "high_risk" &&
      parsed.snapshot.reversibilityFilter === "hard_to_reverse" &&
      parsed.snapshot.blastRadiusFilter === "shared",
    "trace command parse runtime should derive deterministic parse snapshot for mixed trace flags",
  );

  const promptShortcut = deriveTraceCommandParseSnapshot(["prompt"]);
  assert(
    promptShortcut.ok &&
      promptShortcut.snapshot.filter === "prompt" &&
      promptShortcut.snapshot.summaryMode &&
      promptShortcut.snapshot.limit === 20,
    "trace command parse runtime should deterministically apply prompt-only summary shortcut",
  );

  const invalidTool = deriveTraceCommandParseSnapshot(["tool="]);
  const invalidRisk = deriveTraceCommandParseSnapshot(["risk=unknown"]);
  const invalidToken = deriveTraceCommandParseSnapshot(["runs=0"]);
  assert(
    !invalidTool.ok &&
      !invalidRisk.ok &&
      !invalidToken.ok,
    "trace command parse runtime should reject deterministic invalid trace tokens",
  );
}

function verifyTraceFilterLabelOptionsRuntimeDeterministic(): void {
  const t = (key: string, vars?: Record<string, string | number>) => {
    if (!vars || Object.keys(vars).length === 0) {
      return key;
    }
    const payload = Object.entries(vars)
      .map(([name, value]) => `${name}=${String(value)}`)
      .join(",");
    return `${key}[${payload}]`;
  };

  const options = createTraceAppliedFilterLabelOptions({
    t,
    filter: "tools",
    warningsOnly: true,
    failureFocus: true,
    hottestMode: true,
    hottestApplied: true,
    effectiveToolFocus: "shell",
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
  });
  const snapshot = deriveTraceAppliedFilterLabelSnapshot(options);
  assert(
    snapshot.filterLabel === "agent.trace.filter.tools",
    "trace filter-label options runtime should derive deterministic base filter label",
  );
  assertArrayEquals(
    snapshot.suffixes,
    [
      "agent.trace.filter.warningsOnly",
      "agent.trace.filter.failureFocus",
      "agent.command.trace.filterHottestApplied[tool=shell]",
      "agent.command.trace.filterTool[tool=shell]",
      "agent.command.trace.filterRunsWindow[runs=6]",
      "agent.command.trace.filterRisk[risk=agent.trace.permissionRisk.high_risk]",
      "agent.command.trace.filterReversibility[value=agent.permission.prompt.reversibility.hard_to_reverse]",
      "agent.command.trace.filterBlastRadius[value=agent.permission.prompt.blastRadius.shared]",
    ],
    "trace filter-label options runtime should emit deterministic suffix ordering and interpolation",
  );
}

function verifyTraceMessageOptionsRuntimeDeterministic(): void {
  const t = (key: string, vars?: Record<string, string | number>) =>
    `t:${key}:${JSON.stringify(vars ?? {})}`;
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1 },
    { type: "query_end", terminalReason: "completed", durationMs: 80, at: 2 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const summarySnapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 10,
    queueLimit: 8,
  });

  const summaryOptions = createTraceSummaryMessageOptions({
    t,
    summarySnapshot,
    formatNumber: (value) => `n:${value}`,
    filterLabel: "all",
    warningLabel: " | warn-only",
    formatTerminalReasonLabel: (reason) => `term:${reason}`,
    formatRetryStrategyLabel: (strategy) => `retry:${strategy ?? "none"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatPromptLine: (event) => `prompt:${event.type}`,
  });
  assert(
    summaryOptions.nowLabel === "t:agent.queue.priority.now:{}" &&
      summaryOptions.nextLabel === "t:agent.queue.priority.next:{}" &&
      summaryOptions.laterLabel === "t:agent.queue.priority.later:{}" &&
      summaryOptions.titleLine === 't:agent.command.trace.summaryTitle:{"count":1}' &&
      summaryOptions.appliedFilterLine ===
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":" | warn-only"}',
    "trace message-options runtime should derive deterministic summary labels and title/filter mapping",
  );

  const hotspotsOptions = createTraceHotspotsMessageOptions({
    t,
    visibleEvents: events,
    limit: 6,
    queueLimit: 8,
    filterLabel: "all",
    warningLabel: " | warn-only",
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
    formatNumber: (value) => `n:${value}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatPermissionRiskLabel: (risk) => `risk:${risk}`,
    formatQueuePressureLabel: (pressure) => `pressure:${pressure}`,
  });
  assert(
    hotspotsOptions.queueLimit === 8 &&
      hotspotsOptions.limit === 6 &&
      hotspotsOptions.runWindow === 6 &&
      hotspotsOptions.riskFilter === "high_risk" &&
      hotspotsOptions.reversibilityFilter === "hard_to_reverse" &&
      hotspotsOptions.blastRadiusFilter === "shared" &&
      hotspotsOptions.nowLabel === "t:agent.queue.priority.now:{}" &&
      hotspotsOptions.nextLabel === "t:agent.queue.priority.next:{}" &&
      hotspotsOptions.laterLabel === "t:agent.queue.priority.later:{}",
    "trace message-options runtime should derive deterministic hotspots options and localized queue-priority labels",
  );

  const investigateOptions = createTraceInvestigateMessageOptions({
    t,
    hotspot: {
      tool: "shell",
      total: 3,
      errors: 1,
      rejected: 1,
      denied: 1,
    },
    filterLabel: "all",
    warningLabel: " | warn-only",
    runbookLines: ["step-1"],
    investigateRunbookMode: false,
    investigateWorkflowMode: true,
    submitResultLine: "submit-line",
    workflowTask: {
      id: "task-1",
      type: "local_workflow",
      description: "trace investigate",
    },
  });
  const investigateNoRunbookOptions = createTraceInvestigateMessageOptions({
    t,
    hotspot: null,
    filterLabel: "all",
    warningLabel: "",
    runbookLines: [],
    investigateRunbookMode: false,
    investigateWorkflowMode: false,
    submitResultLine: null,
    workflowTask: null,
  });
  assert(
    investigateOptions.includeRunbook &&
      investigateOptions.runbookLines.length === 1 &&
      investigateOptions.submitResultLine === "submit-line" &&
      investigateOptions.workflowTask?.id === "task-1" &&
      !investigateNoRunbookOptions.includeRunbook,
    "trace message-options runtime should deterministically derive investigate includeRunbook/workflow mapping",
  );

  const listOptions = createTraceListMessageOptions({
    t,
    visibleEvents: events,
    formatEventTime: (at) => `time:${at}`,
    formatEventLine: (event) => `line:${event.type}`,
    filterLabel: "all",
    warningLabel: " | warn-only",
  });
  assert(
    listOptions.visibleEvents.length === 2 &&
      listOptions.filterLabel === "all" &&
      listOptions.warningLabel === " | warn-only" &&
      listOptions.formatEventTime(events[0]!.at) === "time:1" &&
      listOptions.formatEventLine(events[1]!) === "line:query_end",
    "trace message-options runtime should preserve deterministic list options mapping",
  );
}

function verifyQueueOpsFilterRuntimeDeterministic(): void {
  assert(
    parseQueueOpsActionFilter(undefined) === "all" &&
      parseQueueOpsActionFilter("any") === "all" &&
      parseQueueOpsActionFilter("enqueue") === "queued" &&
      parseQueueOpsActionFilter("dequeue") === "dequeued" &&
      parseQueueOpsActionFilter("reject") === "rejected" &&
      parseQueueOpsActionFilter("oops") === "invalid",
    "queue ops filter runtime should normalize deterministic action aliases and invalid values",
  );
  assert(
    parseQueueOpsReasonFilter(undefined) === "all" &&
      parseQueueOpsReasonFilter("null") === "none" &&
      parseQueueOpsReasonFilter("capacity") === "capacity" &&
      parseQueueOpsReasonFilter("expired") === "stale" &&
      parseQueueOpsReasonFilter("cleared") === "manual" &&
      parseQueueOpsReasonFilter("dedupe") === "deduplicated" &&
      parseQueueOpsReasonFilter("oops") === "invalid",
    "queue ops filter runtime should normalize deterministic reason aliases and invalid values",
  );
  assert(
    parseQueueOpsPriorityFilter(undefined) === "all" &&
      parseQueueOpsPriorityFilter("any") === "all" &&
      parseQueueOpsPriorityFilter("null") === "none" &&
      parseQueueOpsPriorityFilter("now") === "now" &&
      parseQueueOpsPriorityFilter("next") === "next" &&
      parseQueueOpsPriorityFilter("later") === "later" &&
      parseQueueOpsPriorityFilter("soon") === "invalid",
    "queue ops filter runtime should normalize deterministic priority aliases and invalid values",
  );
}

function verifyQueueOpsRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 0 },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 4,
      reason: "deduplicated",
      priority: "now",
      at: 1,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 4,
      queueLimit: 4,
      reason: "capacity",
      priority: "next",
      at: 2,
    },
    {
      type: "queue_update",
      action: "dequeued",
      queueCount: 3,
      queueLimit: 4,
      reason: "manual",
      priority: "later",
      at: 3,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 2,
      queueLimit: 4,
      reason: "stale",
      at: 4,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 4,
      at: 5,
    },
  ];

  const queueEvents = collectQueueUpdateEvents(events);
  assert(
    queueEvents.length === 5 &&
      queueEvents[0]?.action === "queued" &&
      queueEvents[4]?.action === "queued",
    "queue ops runtime should collect deterministic queue_update events in source order",
  );

  const filteredTail = filterQueueOpsEvents({
    events: queueEvents,
    actionFilter: "all",
    reasonFilter: "all",
    priorityFilter: "all",
    limit: 3,
  });
  assertArrayEquals(
    filteredTail.map((event) => `${event.action}@${event.at}`),
    ["dequeued@3", "rejected@4", "queued@5"],
    "queue ops runtime should apply deterministic tail slicing after filter evaluation",
  );

  const filteredDedupe = filterQueueOpsEvents({
    events: queueEvents,
    actionFilter: "all",
    reasonFilter: "deduplicated",
    priorityFilter: "all",
    limit: 10,
  });
  assert(
    filteredDedupe.length === 1 &&
      filteredDedupe[0]?.reason === "deduplicated" &&
      filteredDedupe[0]?.priority === "now",
    "queue ops runtime should apply deterministic reason filter aliases",
  );

  const filteredPriorityNone = filterQueueOpsEvents({
    events: queueEvents,
    actionFilter: "all",
    reasonFilter: "all",
    priorityFilter: "none",
    limit: 10,
  });
  assertArrayEquals(
    filteredPriorityNone.map((event) => `${event.action}@${event.at}`),
    ["rejected@4", "queued@5"],
    "queue ops runtime should deterministically match events with undefined priority for priority=none filter",
  );

  const summary = deriveQueueOpsSummarySnapshot({
    events: filteredTail,
    fallbackLimit: 8,
  });
  assert(
    summary.actionStats.queued === 1 &&
      summary.actionStats.dequeued === 1 &&
      summary.actionStats.rejected === 1 &&
      summary.reasonStats.capacity === 0 &&
      summary.reasonStats.stale === 1 &&
      summary.reasonStats.manual === 1 &&
      summary.reasonStats.deduplicated === 0 &&
      summary.reasonStats.none === 1 &&
      summary.priorityStats.now === 0 &&
      summary.priorityStats.next === 0 &&
      summary.priorityStats.later === 1 &&
      summary.priorityStats.none === 2 &&
      summary.latestDepth === 2 &&
      summary.maxDepth === 3 &&
      summary.latestLimit === 4 &&
      summary.effectiveLimit === 4,
    "queue ops runtime should derive deterministic summary counters/depth window/limit snapshot",
  );

  const emptySummary = deriveQueueOpsSummarySnapshot({
    events: [],
    fallbackLimit: 8,
  });
  assert(
    emptySummary.actionStats.queued === 0 &&
      emptySummary.reasonStats.none === 0 &&
      emptySummary.priorityStats.none === 0 &&
      emptySummary.latestDepth === 0 &&
      emptySummary.maxDepth === 0 &&
      emptySummary.latestLimit === 0 &&
      emptySummary.effectiveLimit === 8,
    "queue ops runtime should preserve deterministic empty-summary fallback limit behavior",
  );
}

function verifyQueueMaintenanceRuntimeDeterministic(): void {
  assert(
    getQueuePriorityRank("now") === 0 &&
      getQueuePriorityRank("next") === 1 &&
      getQueuePriorityRank("later") === 2,
    "queue maintenance runtime should expose deterministic queue priority rank ordering",
  );

  const queueInvestigateFingerprint = normalizeQueueIntentFingerprint(
    "  /Doctor   Queue Investigate thread=THREAD-DEMO pressure=busy queued_count=9 ",
  );
  const fallbackInvestigateFingerprint = normalizeQueueIntentFingerprint(
    " /doctor fallback investigate thread=Thread-2 risk=high extra=ignored ",
  );
  const regularFingerprint = normalizeQueueIntentFingerprint("   /trace   summary  runs=all  ");
  assert(
    queueInvestigateFingerprint === "/doctor queue investigate thread=thread-demo" &&
      fallbackInvestigateFingerprint === "/doctor fallback investigate thread=thread-2" &&
      regularFingerprint === "/trace summary runs=all",
    "queue maintenance runtime should deterministically normalize queue intent fingerprints",
  );

  const compactKey = buildQueueCompactKey({
    id: "q-compact-key",
    query: " /doctor queue investigate thread=THREAD-KEY pressure=busy ",
    model: " demo-model ",
    permissionMode: "default",
    queuedAt: 1_000,
    commandId: "cmd-compact-key",
    commandLabel: "/doctor queue investigate",
    priority: "next",
  });
  assert(
    compactKey === "/doctor queue investigate thread=thread-key::demo-model::default",
    "queue maintenance runtime should build deterministic compact keys from normalized query/model/permission fields",
  );

  const compactPlan = deriveCompactDuplicateRemovalPlan([
    {
      id: "compact-keep",
      query: "/trace summary runs=all",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 100,
      commandId: "cmd-compact-keep",
      commandLabel: "/trace summary",
      priority: "next",
    },
    {
      id: "compact-drop",
      query: "/trace summary runs=all",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 200,
      commandId: "cmd-compact-drop",
      commandLabel: "/trace summary",
      priority: "later",
    },
    {
      id: "compact-unique",
      query: "/trace list limit=20",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 300,
      commandId: "cmd-compact-unique",
      commandLabel: "/trace list",
      priority: "now",
    },
  ]);
  assert(
    compactPlan.duplicateGroups === 1 && compactPlan.removeIds.length === 1 && compactPlan.removeIds[0] === "compact-drop",
    "queue maintenance runtime should derive deterministic compact duplicate removal plan",
  );

  const healPlan = deriveHealDuplicateRemovalPlan([
    {
      id: "heal-a-later",
      query: "/doctor queue investigate thread=alpha pressure=busy",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 50,
      commandId: "cmd-heal-a-later",
      commandLabel: "/doctor queue investigate",
      priority: "later",
    },
    {
      id: "heal-a-now-late",
      query: "/doctor queue investigate thread=alpha pressure=busy",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 40,
      commandId: "cmd-heal-a-now-late",
      commandLabel: "/doctor queue investigate",
      priority: "now",
    },
    {
      id: "heal-a-next",
      query: "/doctor queue investigate thread=alpha pressure=busy",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 10,
      commandId: "cmd-heal-a-next",
      commandLabel: "/doctor queue investigate",
      priority: "next",
    },
    {
      id: "heal-a-now-early",
      query: "/doctor queue investigate thread=alpha pressure=busy",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 30,
      commandId: "cmd-heal-a-now-early",
      commandLabel: "/doctor queue investigate",
      priority: "now",
    },
    {
      id: "heal-b-keep",
      query: "/trace summary runs=3",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 60,
      commandId: "cmd-heal-b-keep",
      commandLabel: "/trace summary",
      priority: "next",
    },
    {
      id: "heal-b-drop",
      query: "/trace summary runs=3",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: 70,
      commandId: "cmd-heal-b-drop",
      commandLabel: "/trace summary",
      priority: "next",
    },
  ]);
  assertArrayEquals(
    healPlan.removeIds,
    ["heal-a-now-late", "heal-a-next", "heal-a-later", "heal-b-drop"],
    "queue maintenance runtime should derive deterministic heal duplicate removal ordering by priority then queuedAt then id",
  );
  assert(
    healPlan.duplicateGroups === 2,
    "queue maintenance runtime should count duplicate groups deterministically for heal plan",
  );

  const staleIds = deriveStaleQueuedQueryIds({
    items: [
      {
        id: "stale-drop-1",
        query: "/trace summary",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 68,
        commandId: "cmd-stale-drop-1",
        commandLabel: "/trace summary",
        priority: "later",
      },
      {
        id: "stale-keep-boundary",
        query: "/trace list",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 70,
        commandId: "cmd-stale-keep-boundary",
        commandLabel: "/trace list",
        priority: "next",
      },
      {
        id: "stale-drop-2",
        query: "/trace hotspots",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 60,
        commandId: "cmd-stale-drop-2",
        commandLabel: "/trace hotspots",
        priority: "now",
      },
    ],
    now: 100,
    staleAgeMs: 30,
  });
  assertArrayEquals(
    staleIds,
    ["stale-drop-1", "stale-drop-2"],
    "queue maintenance runtime should derive deterministic stale-id list using strict greater-than stale threshold",
  );
}

function verifyRuntimeSnapshotPublishPolicyDeterministic(): void {
  const sharedEvents = Object.freeze([] as QueryStreamEvent[]);
  const previousSnapshot: QueryRuntimeSnapshot = {
    queueCount: 1,
    queueLimit: 8,
    queueByPriority: Object.freeze({
      now: 1,
      next: 0,
      later: 0,
    }),
    queuedQueries: Object.freeze([
      {
        id: "snapshot-q-1",
        query: "/trace summary runs=all",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 100,
        commandId: "snapshot-cmd-1",
        commandLabel: "/trace summary",
        priority: "now",
      },
    ] as QueuedQueryItem[]),
    recentEvents: sharedEvents,
    latestEvent: null,
    lastEventAt: null,
  };

  const shouldSkipNoop = shouldPublishRuntimeSnapshot(previousSnapshot, {
    queueCount: previousSnapshot.queueCount,
    queueLimit: previousSnapshot.queueLimit,
    queueByPriority: {
      now: 1,
      next: 0,
      later: 0,
    },
    queuedQueries: [
      {
        id: "snapshot-q-1",
        query: "/trace summary runs=all",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 100,
        commandId: "snapshot-cmd-1",
        commandLabel: "/trace summary",
        priority: "now",
      },
    ],
    recentEvents: sharedEvents,
    latestEvent: null,
    lastEventAt: null,
  });
  assert(
    !shouldSkipNoop,
    "runtime snapshot publish policy should skip no-op emissions when queue/events snapshots are unchanged",
  );

  const shouldPublishOnQueueCount = shouldPublishRuntimeSnapshot(previousSnapshot, {
    queueCount: 2,
    queueLimit: previousSnapshot.queueLimit,
    queueByPriority: {
      now: 1,
      next: 1,
      later: 0,
    },
    queuedQueries: [
      {
        id: "snapshot-q-1",
        query: "/trace summary runs=all",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 100,
        commandId: "snapshot-cmd-1",
        commandLabel: "/trace summary",
        priority: "now",
      },
      {
        id: "snapshot-q-2",
        query: "/trace hotspots",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 120,
        commandId: "snapshot-cmd-2",
        commandLabel: "/trace hotspots",
        priority: "next",
      },
    ],
    recentEvents: sharedEvents,
    latestEvent: null,
    lastEventAt: null,
  });
  assert(
    shouldPublishOnQueueCount,
    "runtime snapshot publish policy should publish when queue depth/counters change",
  );

  const clonedEvents = Object.freeze([] as QueryStreamEvent[]);
  const shouldPublishOnEventRefChange = shouldPublishRuntimeSnapshot(previousSnapshot, {
    queueCount: previousSnapshot.queueCount,
    queueLimit: previousSnapshot.queueLimit,
    queueByPriority: {
      now: 1,
      next: 0,
      later: 0,
    },
    queuedQueries: [
      {
        id: "snapshot-q-1",
        query: "/trace summary runs=all",
        model: "demo-model",
        permissionMode: "default",
        queuedAt: 100,
        commandId: "snapshot-cmd-1",
        commandLabel: "/trace summary",
        priority: "now",
      },
    ],
    recentEvents: clonedEvents,
    latestEvent: null,
    lastEventAt: null,
  });
  assert(
    shouldPublishOnEventRefChange,
    "runtime snapshot publish policy should publish when recent-events snapshot identity changes",
  );
}

function verifyRecoverResumeRuntimeDeterministic(): void {
  const manualPolicy = deriveRecoverResumePolicy({
    autoMode: false,
    recoverPlanKind: "resume_now",
  });
  const autoHealPolicy = deriveRecoverResumePolicy({
    autoMode: true,
    recoverPlanKind: "heal_then_resume",
  });
  const autoResumePolicy = deriveRecoverResumePolicy({
    autoMode: true,
    recoverPlanKind: "resume_now",
  });
  assert(
    manualPolicy.preferredPriority === "now" &&
      manualPolicy.policyLineKey === null &&
      autoHealPolicy.preferredPriority === "next" &&
      autoHealPolicy.policyLineKey === "agent.command.recover.resumeAutoPolicyNext" &&
      autoResumePolicy.preferredPriority === "now" &&
      autoResumePolicy.policyLineKey === "agent.command.recover.resumeAutoPolicyNow",
    "recover resume runtime should derive deterministic preferred priority and policy lines",
  );

  assert(
    shouldPromoteRecoverQueuedPriority({
      queuedPriority: "later",
      preferredPriority: "now",
    }) &&
      !shouldPromoteRecoverQueuedPriority({
        queuedPriority: "now",
        preferredPriority: "next",
      }),
    "recover resume runtime should deterministically decide queued priority promotion",
  );

  assertArrayEquals(
    buildRecoverResumeNoInterruptionLineDescriptors().map((line) => line.key),
    ["agent.command.recover.noInterruption"],
    "recover resume runtime should emit deterministic no-interruption line sequence",
  );

  const queuedReuseLines = buildRecoverResumeQueuedReuseLineDescriptors({
    policyLineKey: "agent.command.recover.resumeAutoPolicyNext",
    queuedRecoveryId: "q-recover-1",
    queueLabel: "5",
    limitLabel: "8",
    promoted: true,
  });
  assertArrayEquals(
    queuedReuseLines.map((line) => line.key),
    [
      "agent.command.recover.resumeAutoPolicyNext",
      "agent.command.recover.resumeAlreadyQueued",
      "agent.command.recover.resumeAlreadyQueuedPromoted",
      "agent.command.recover.resumeAlreadyQueuedHint",
    ],
    "recover resume runtime should emit deterministic queued-reuse line sequence with promotion",
  );
  assert(
    queuedReuseLines[1]?.vars?.queue === "5" &&
      queuedReuseLines[1]?.vars?.limit === "8" &&
      queuedReuseLines[2]?.vars?.id === "q-recover-1",
    "recover resume runtime should preserve deterministic queued-reuse interpolation vars",
  );

  const queueFullWithPruneLines = buildRecoverResumeQueueFullLineDescriptors({
    policyLineKey: "agent.command.recover.resumeAutoPolicyNow",
    queueCount: 8,
    queueLimit: 8,
    staleRemoved: 2,
    staleMinutes: 10,
  });
  assertArrayEquals(
    queueFullWithPruneLines.map((line) => line.key),
    [
      "agent.command.recover.resumeAutoPolicyNow",
      "agent.command.recover.resumeQueueFull",
      "agent.command.recover.resumeQueueFullAfterPrune",
      "agent.command.recover.resumeQueueFullHintHeal",
      "agent.command.recover.resumeQueueFullHintInvestigate",
    ],
    "recover resume runtime should emit deterministic queue-full line sequence with stale prune context",
  );

  const queueFullNoPruneLines = buildRecoverResumeQueueFullLineDescriptors({
    policyLineKey: null,
    queueCount: 8,
    queueLimit: 8,
    staleRemoved: 0,
    staleMinutes: 10,
  });
  assertArrayEquals(
    queueFullNoPruneLines.map((line) => line.key),
    [
      "agent.command.recover.resumeQueueFull",
      "agent.command.recover.resumeQueueFullHintHeal",
      "agent.command.recover.resumeQueueFullHintInvestigate",
    ],
    "recover resume runtime should omit stale-prune line when no stale queued items are removed",
  );

  assertArrayEquals(
    buildRecoverResumeFailedLineDescriptors({
      policyLineKey: "agent.command.recover.resumeAutoPolicyNow",
    }).map((line) => line.key),
    [
      "agent.command.recover.resumeAutoPolicyNow",
      "agent.command.recover.resumeFailed",
      "agent.command.recover.resumeFailedHintInvestigate",
    ],
    "recover resume runtime should emit deterministic failed-submission line sequence",
  );

  assertArrayEquals(
    buildRecoverResumeStartedLineDescriptors({
      policyLineKey: null,
      staleRemoved: 1,
      staleMinutes: 10,
    }).map((line) => line.key),
    [
      "agent.command.recover.resumeStarted",
      "agent.command.recover.resumePrunedStale",
      "agent.command.recover.resumeNextStep",
    ],
    "recover resume runtime should emit deterministic started-submission line sequence",
  );

  const queuedLines = buildRecoverResumeQueuedLineDescriptors({
    policyLineKey: "agent.command.recover.resumeAutoPolicyNext",
    queueCount: 4,
    queueLimit: 8,
    queuedId: "queued-42",
    staleRemoved: 1,
    staleMinutes: 10,
  });
  assertArrayEquals(
    queuedLines.map((line) => line.key),
    [
      "agent.command.recover.resumeAutoPolicyNext",
      "agent.command.recover.resumeQueued",
      "agent.command.recover.resumeQueuedId",
      "agent.command.recover.resumePrunedStale",
      "agent.command.recover.resumeNextStep",
    ],
    "recover resume runtime should emit deterministic queued-submission line sequence with queued id and stale prune details",
  );
  assert(
    queuedLines[1]?.vars?.queue === 4 &&
      queuedLines[1]?.vars?.limit === 8 &&
      queuedLines[2]?.vars?.id === "queued-42",
    "recover resume runtime should preserve deterministic queued-submission interpolation vars",
  );
}

function verifyTraceVisibilityRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1 },
    { type: "tool_result", tool: "shell", outcome: "error", at: 2 },
    { type: "tool_result", tool: "shell", outcome: "rejected", at: 3 },
    {
      type: "permission_decision",
      tool: "shell",
      behavior: "deny",
      reason: "blocked",
      riskClass: "high_risk",
      at: 4,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 50, at: 5 },
    { type: "query_start", model: "demo-model", queueCount: 0, at: 10 },
    { type: "tool_result", tool: "read_file", outcome: "error", at: 11 },
    { type: "query_end", terminalReason: "completed", durationMs: 30, at: 12 },
  ];

  const hottestSnapshot = deriveTraceVisibilitySnapshot({
    allEvents: events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
    hottestMode: true,
    limit: 3,
  });
  assert(
    hottestSnapshot.hottestApplied &&
      hottestSnapshot.effectiveToolFocus === "shell" &&
      hottestSnapshot.visibleRuns.length === 1 &&
      hottestSnapshot.visibleRuns[0]?.runIndex === 1 &&
      hottestSnapshot.flattenedVisibleEvents.length === 5 &&
      hottestSnapshot.visibleEvents.length === 3 &&
      hottestSnapshot.visibleEvents[0]?.type === "tool_result" &&
      hottestSnapshot.visibleEvents[1]?.type === "permission_decision" &&
      hottestSnapshot.visibleEvents[2]?.type === "query_end",
    "trace visibility runtime should deterministically derive hottest tool focus and bounded visible event window",
  );

  const explicitToolSnapshot = deriveTraceVisibilitySnapshot({
    allEvents: events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: "read_file",
    runWindow: "all",
    hottestMode: true,
    limit: 10,
  });
  assert(
    !explicitToolSnapshot.hottestApplied &&
      explicitToolSnapshot.effectiveToolFocus === "read_file" &&
      explicitToolSnapshot.visibleRuns.length === 1 &&
      explicitToolSnapshot.visibleRuns[0]?.runIndex === 2,
    "trace visibility runtime should respect explicit tool focus without re-applying hottest override",
  );

  const emptySnapshot = deriveTraceVisibilitySnapshot({
    allEvents: [],
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
    hottestMode: true,
    limit: 20,
  });
  assert(
    !emptySnapshot.hottestApplied &&
      emptySnapshot.effectiveToolFocus === null &&
      emptySnapshot.visibleRuns.length === 0 &&
      emptySnapshot.flattenedVisibleEvents.length === 0 &&
      emptySnapshot.visibleEvents.length === 0,
    "trace visibility runtime should preserve deterministic empty-state visibility snapshot",
  );
}

function verifyTraceSummaryRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "tool_result", tool: "shell", outcome: "error", at: 1 },
    { type: "tool_result", tool: "shell", outcome: "rejected", at: 2 },
    {
      type: "permission_decision",
      tool: "shell",
      behavior: "deny",
      reason: "blocked",
      riskClass: "high_risk",
      at: 3,
    },
    { type: "tool_retry_guard", tool: "shell", streak: 2, guidance: "diagnose_before_retry", at: 4 },
    { type: "tool_failure_classified", tool: "shell", failureClass: "permission", streak: 2, at: 5 },
    { type: "tool_budget_guard", tool: "shell", count: 7, budget: 6, reason: "per_tool_limit", at: 6 },
    { type: "tool_result", tool: "read_file", outcome: "error", at: 7 },
    { type: "tool_failure_classified", tool: "read_file", failureClass: "runtime", streak: 1, at: 8 },
    { type: "continue", transition: { reason: "fallback_retry", fallbackModel: "fallback-a" }, iteration: 1, at: 9 },
    { type: "continue", transition: { reason: "fallback_retry", fallbackModel: "fallback-b" }, iteration: 2, at: 10 },
    {
      type: "fallback_suppressed",
      iteration: 3,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 11,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "reversible",
      blastRadius: "local",
      at: 12,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 13,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "hard_to_reverse",
      blastRadius: "shared",
      at: 14,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "hard_to_reverse",
      blastRadius: "shared",
      at: 15,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 4,
      priority: "now",
      reason: "deduplicated",
      at: 16,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 4,
      queueLimit: 4,
      priority: "next",
      reason: "capacity",
      at: 17,
    },
    {
      type: "queue_update",
      action: "dequeued",
      queueCount: 3,
      queueLimit: 4,
      priority: "later",
      reason: "manual",
      at: 18,
    },
    {
      type: "queue_update",
      action: "rejected",
      queueCount: 2,
      queueLimit: 4,
      reason: "stale",
      at: 19,
    },
  ];

  const hotspots = buildTraceHotspotSummaries(events, 3);
  assertArrayEquals(
    hotspots.map((item) => `${item.tool}:${item.total}:${item.errors}:${item.rejected}:${item.denied}`),
    ["shell:6:3:1:2", "read_file:2:2:0:0"],
    "trace summary runtime should aggregate hotspot counters deterministically",
  );
  assert(
    buildTraceHotspotParts(events, 2) === "shell=6 read_file=2",
    "trace summary runtime should emit deterministic hotspot parts ordering",
  );

  const riskProfileStats = buildTracePermissionRiskProfileStats(events);
  assert(
    riskProfileStats.total === 4 &&
      riskProfileStats.reversible === 1 &&
      riskProfileStats.mixed === 1 &&
      riskProfileStats.hardToReverse === 2 &&
      riskProfileStats.local === 1 &&
      riskProfileStats.workspace === 1 &&
      riskProfileStats.shared === 2,
    "trace summary runtime should aggregate permission risk profile matrix counters deterministically",
  );

  const fallbackStats = buildTraceFallbackStats(events);
  assert(
    fallbackStats.used === 2 &&
      fallbackStats.suppressed === 1 &&
      fallbackStats.latestSuppressed?.reason === "retry_strategy",
    "trace summary runtime should aggregate fallback usage/suppression counters deterministically",
  );

  const queuePriorityStats = buildTraceQueuePriorityStats(events, 4);
  assert(
    queuePriorityStats.total === 3 &&
      queuePriorityStats.queued.now === 1 &&
      queuePriorityStats.rejected.next === 1 &&
      queuePriorityStats.dequeued.later === 1 &&
      queuePriorityStats.latestQueueDepth === 2 &&
      queuePriorityStats.maxQueueDepth === 4 &&
      queuePriorityStats.pressure === "saturated",
    "trace summary runtime should aggregate queue priority counters and pressure deterministically",
  );

  const queueReasonStats = buildTraceQueueReasonStats(events);
  assert(
    queueReasonStats.total === 4 &&
      queueReasonStats.capacity === 1 &&
      queueReasonStats.stale === 1 &&
      queueReasonStats.manual === 1 &&
      queueReasonStats.deduplicated === 1,
    "trace summary runtime should aggregate queue reason counters deterministically",
  );
}

function verifyTracePermissionRiskRuntimeDeterministic(): void {
  assertArrayEquals(
    [...TRACE_PERMISSION_RISK_ORDER],
    ["critical", "high_risk", "interactive", "path_outside", "policy"],
    "trace permission risk runtime should expose deterministic risk ordering",
  );

  const events: QueryStreamEvent[] = [
    {
      type: "permission_decision",
      tool: "shell",
      behavior: "ask",
      reason: "high-risk shell mutation detected",
      riskClass: "high_risk",
      at: 1,
    },
    {
      type: "authorization_scope_notice",
      tool: "shell",
      riskClass: "high_risk",
      priorApprovals: 1,
      at: 2,
    },
    {
      type: "permission_risk_profile",
      tool: "file_write",
      riskClass: "path_outside",
      reason: "path outside workspace",
      reversibility: "mixed",
      blastRadius: "shared",
      at: 3,
    },
    {
      type: "permission_decision",
      tool: "file_write",
      behavior: "ask",
      reason: "policy fallback path",
      at: 4,
    },
    {
      type: "query_start",
      model: "demo-model",
      queueCount: 0,
      at: 5,
    },
  ];

  const counter = buildTracePermissionRiskCounter(events);
  assert(
    counter.critical === 0 &&
      counter.high_risk === 2 &&
      counter.interactive === 0 &&
      counter.path_outside === 1 &&
      counter.policy === 1,
    "trace permission risk runtime should aggregate deterministic risk counters from heterogeneous events",
  );

  const entries = deriveTracePermissionRiskEntries(counter);
  assertArrayEquals(
    entries.map((entry) => `${entry.risk}:${entry.count}`),
    ["high_risk:2", "path_outside:1", "policy:1"],
    "trace permission risk runtime should emit deterministic non-zero entries in canonical order",
  );

  const entriesFromEvents = deriveTracePermissionRiskEntriesFromEvents(events);
  assertArrayEquals(
    entriesFromEvents.map((entry) => `${entry.risk}:${entry.count}`),
    ["high_risk:2", "path_outside:1", "policy:1"],
    "trace permission risk runtime should deterministically match entries derived from prebuilt counters",
  );

  const empty = deriveTracePermissionRiskEntriesFromEvents([
    {
      type: "query_start",
      model: "demo-model",
      queueCount: 0,
      at: 10,
    },
  ]);
  assert(
    empty.length === 0,
    "trace permission risk runtime should return empty entries when no risk-bearing events exist",
  );
}

function verifyTraceToolingRuntimeDeterministic(): void {
  const failureEvents: QueryStreamEvent[] = [
    { type: "tool_failure_classified", tool: "shell", failureClass: "runtime", streak: 1, at: 1 },
    { type: "tool_failure_classified", tool: "shell", failureClass: "permission", streak: 2, at: 2 },
    { type: "tool_failure_classified", tool: "shell", failureClass: "runtime", streak: 3, at: 3 },
    { type: "tool_failure_classified", tool: "read_file", failureClass: "permission", streak: 1, at: 4 },
    { type: "tool_failure_classified", tool: "read_file", failureClass: "timeout", streak: 1, at: 5 },
  ];

  const failureStats = buildToolFailureClassStats({
    events: failureEvents,
    formatFailureClassLabel: (failureClass) => `label:${failureClass}`,
  });
  assert(
    failureStats.total === 5 &&
      failureStats.parts === "label:runtime=2 label:permission=2 label:timeout=1",
    "trace tooling runtime should build deterministic failure-class summary text with stable tie ordering",
  );

  const entries = deriveToolFailureClassEntries(
    new Map<ToolFailureClass, number>([
      ["runtime", 2],
      ["permission", 2],
      ["timeout", 1],
    ]),
  );
  assertArrayEquals(
    entries.map((entry) => `${entry.failureClass}:${entry.count}`),
    ["runtime:2", "permission:2", "timeout:1"],
    "trace tooling runtime should keep deterministic insertion order when failure-class counts tie",
  );

  const failureCounts = collectToolFailureClassCounts(failureEvents);
  assert(
    failureCounts.runtime === 2 &&
      failureCounts.permission === 2 &&
      failureCounts.timeout === 1 &&
      failureCounts.workspace === 0 &&
      failureCounts.not_found === 0 &&
      failureCounts.network === 0 &&
      failureCounts.validation === 0,
    "trace tooling runtime should collect deterministic per-class failure counters",
  );

  const budgetEvents: QueryStreamEvent[] = [
    { type: "tool_budget_guard", tool: "shell", count: 4, budget: 3, reason: "failure_backoff", at: 10 },
    { type: "tool_budget_guard", tool: "shell", count: 5, budget: 3, reason: "failure_backoff", at: 11 },
    { type: "tool_budget_guard", tool: "read_file", count: 3, budget: 3, reason: "per_tool_limit", at: 12 },
  ];
  const budgetStats = buildToolBudgetGuardReasonStats(budgetEvents);
  assert(
    budgetStats.total === 3 &&
      budgetStats.failureBackoff === 2 &&
      budgetStats.perToolLimit === 1 &&
      budgetStats.dominantReason === "failure_backoff",
    "trace tooling runtime should build deterministic budget-guard reason stats",
  );
  assert(
    countToolBudgetGuards([...failureEvents, ...budgetEvents]) === 3,
    "trace tooling runtime should count only tool-budget-guard events deterministically",
  );
}

function verifyTraceEventLineRuntimeDeterministic(): void {
  const promptDescriptor = deriveTracePromptCompiledLineDescriptor({
    type: "prompt_compiled",
    staticSections: 7,
    dynamicSections: 4,
    staticChars: 2100,
    dynamicChars: 640,
    totalChars: 2740,
    staticHash: "static-hash",
    dynamicHash: "dynamic-hash",
    modelLaunchTags: ["capybara-v8", "launch-x"],
    at: 1,
  });
  assert(
    promptDescriptor.key === "agent.trace.event.promptCompiled" &&
      promptDescriptor.vars.totalChars === 2740 &&
      promptDescriptor.hashPair === "static-hash/dynamic-hash" &&
      promptDescriptor.tags.join(",") === "capybara-v8,launch-x",
    "trace event line runtime should derive deterministic prompt compiled descriptor",
  );

  const queryStartSimple = deriveTraceQueryStartLineDescriptor({
    type: "query_start",
    model: "demo-model",
    queueCount: 0,
    at: 2,
  });
  assert(
    queryStartSimple.key === "agent.trace.event.queryStart" &&
      queryStartSimple.retryStrategy === undefined,
    "trace event line runtime should derive simple query-start descriptor without detailed fields",
  );

  const queryStartDetailed = deriveTraceQueryStartLineDescriptor({
    type: "query_start",
    model: "demo-model",
    queueCount: 2,
    lane: "background",
    retryMax: 3,
    fallbackEnabled: true,
    retryStrategy: "queue_pressure",
    at: 3,
  });
  assert(
    queryStartDetailed.key === "agent.trace.event.queryStartDetailed" &&
      queryStartDetailed.retryStrategy === "queue_pressure" &&
      queryStartDetailed.vars.laneKey === "agent.trace.queryLane.background" &&
      queryStartDetailed.vars.fallbackKey === "agent.trace.queryFallback.on",
    "trace event line runtime should derive detailed query-start descriptor with strategy",
  );

  const iterationDescriptor = deriveTraceIterationStartLineDescriptor({
    type: "iteration_start",
    iteration: 2,
    model: "demo-model",
    at: 3.5,
  });
  assert(
    iterationDescriptor.key === "agent.trace.event.iterationStart" &&
      iterationDescriptor.vars.iteration === 2 &&
      iterationDescriptor.vars.model === "demo-model",
    "trace event line runtime should derive deterministic iteration-start descriptor",
  );

  const retryDescriptor = deriveTraceRetryAttemptLineDescriptor({
    type: "retry_attempt",
    iteration: 2,
    model: "demo-model",
    lane: "foreground",
    attempt: 2,
    nextDelayMs: 1500,
    reason: "tool_error",
    retryStrategy: "queue_pressure",
    at: 4,
  });
  assert(
    retryDescriptor.vars.delaySec === "1.5" &&
      retryDescriptor.retryStrategy === "queue_pressure" &&
      retryDescriptor.vars.laneKey === "agent.trace.queryLane.foreground",
    "trace event line runtime should derive deterministic retry-attempt descriptor",
  );

  const permissionDescriptor = deriveTracePermissionDecisionLineDescriptor({
    type: "permission_decision",
    tool: "shell",
    behavior: "ask",
    reason: "high-risk",
    riskClass: "high_risk",
    at: 5,
  });
  assert(
    permissionDescriptor.key === "agent.trace.event.permissionDecision" &&
      permissionDescriptor.vars.behavior === "ask" &&
      permissionDescriptor.riskClass === "high_risk" &&
      permissionDescriptor.riskKey === "agent.trace.permissionRisk.high_risk",
    "trace event line runtime should derive deterministic permission-decision descriptor",
  );

  const queueDescriptor = deriveTraceQueueUpdateLineDescriptor({
    type: "queue_update",
    action: "queued",
    queueCount: 3,
    queueLimit: 8,
    priority: "later",
    reason: "deduplicated",
    at: 6,
  });
  assert(
    queueDescriptor.key === "agent.trace.event.queueUpdate" &&
      queueDescriptor.vars.queueCount === 3 &&
      queueDescriptor.vars.actionKey === "agent.trace.queueAction.queued" &&
      queueDescriptor.priority === "later" &&
      queueDescriptor.reason === "deduplicated" &&
      queueDescriptor.reasonKey === "agent.trace.queueReason.deduplicated",
    "trace event line runtime should derive deterministic queue-update descriptor",
  );

  const failureClassDescriptor = deriveTraceToolFailureClassifiedLineDescriptor({
    type: "tool_failure_classified",
    tool: "shell",
    failureClass: "runtime",
    streak: 2,
    fastGuarded: true,
    at: 7,
  });
  assert(
    failureClassDescriptor.key === "agent.trace.event.toolFailureClassified" &&
      failureClassDescriptor.vars.failureClass === "runtime" &&
      failureClassDescriptor.vars.failureClassKey === "agent.trace.toolFailureClass.runtime" &&
      failureClassDescriptor.vars.fastGuarded,
    "trace event line runtime should derive deterministic tool-failure-classified descriptor",
  );

  const budgetDescriptor = deriveTraceToolBudgetGuardLineDescriptor({
    type: "tool_budget_guard",
    tool: "shell",
    count: 8,
    budget: 6,
    reason: "failure_backoff",
    at: 8,
  });
  assert(
    budgetDescriptor.key === "agent.trace.event.toolBudgetGuard" &&
      budgetDescriptor.vars.reason === "failure_backoff" &&
      budgetDescriptor.vars.reasonKey === "agent.trace.toolBudgetReason.failure_backoff" &&
      budgetDescriptor.vars.count === 8,
    "trace event line runtime should derive deterministic tool-budget-guard descriptor",
  );

  const retryProfileDescriptor = deriveTraceRetryProfileUpdateLineDescriptor({
    type: "retry_profile_update",
    lane: "background",
    queueCount: 4,
    retryMax: 1,
    fallbackEnabled: false,
    retryStrategy: "background_load_shed",
    reason: "load_shed",
    at: 9,
  });
  assert(
    retryProfileDescriptor.key === "agent.trace.event.retryProfileUpdate" &&
      retryProfileDescriptor.vars.lane === "background" &&
      retryProfileDescriptor.vars.laneKey === "agent.trace.queryLane.background" &&
      retryProfileDescriptor.vars.fallbackState === "off" &&
      retryProfileDescriptor.vars.fallbackKey === "agent.trace.queryFallback.off" &&
      retryProfileDescriptor.vars.strategy === "background_load_shed" &&
      retryProfileDescriptor.vars.reason === "load_shed" &&
      retryProfileDescriptor.vars.reasonKey === "agent.trace.retryProfileReason.load_shed",
    "trace event line runtime should derive deterministic retry-profile-update descriptor",
  );

  const fallbackSuppressedDescriptor = deriveTraceFallbackSuppressedLineDescriptor({
    type: "fallback_suppressed",
    iteration: 3,
    model: "demo-model",
    lane: "foreground",
    reason: "retry_strategy",
    retryStrategy: "queue_pressure",
    at: 10,
  });
  assert(
    fallbackSuppressedDescriptor.key === "agent.trace.event.fallbackSuppressed" &&
      fallbackSuppressedDescriptor.vars.reason === "retry_strategy" &&
      fallbackSuppressedDescriptor.vars.reasonKey === "agent.trace.fallbackSuppressedReason.retry_strategy" &&
      fallbackSuppressedDescriptor.vars.laneKey === "agent.trace.queryLane.foreground" &&
      fallbackSuppressedDescriptor.vars.strategy === "queue_pressure",
    "trace event line runtime should derive deterministic fallback-suppressed descriptor",
  );

  const toolBatchStartDescriptor = deriveTraceToolBatchStartLineDescriptor({
    type: "tool_batch_start",
    iteration: 4,
    count: 3,
    at: 10.5,
  });
  assert(
    toolBatchStartDescriptor.key === "agent.trace.event.toolBatchStart" &&
      toolBatchStartDescriptor.vars.iteration === 4 &&
      toolBatchStartDescriptor.vars.count === 3,
    "trace event line runtime should derive deterministic tool-batch-start descriptor",
  );

  const toolBatchCompleteDescriptor = deriveTraceToolBatchCompleteLineDescriptor({
    type: "tool_batch_complete",
    iteration: 4,
    count: 3,
    errorCount: 1,
    at: 10.6,
  });
  assert(
    toolBatchCompleteDescriptor.key === "agent.trace.event.toolBatchComplete" &&
      toolBatchCompleteDescriptor.vars.count === 3 &&
      toolBatchCompleteDescriptor.vars.errorCount === 1,
    "trace event line runtime should derive deterministic tool-batch-complete descriptor",
  );

  const toolResultDescriptor = deriveTraceToolResultLineDescriptor({
    type: "tool_result",
    tool: "shell",
    outcome: "rejected",
    at: 10.7,
  });
  assert(
    toolResultDescriptor.key === "agent.trace.event.toolResult" &&
      toolResultDescriptor.vars.tool === "shell" &&
      toolResultDescriptor.vars.outcome === "rejected" &&
      toolResultDescriptor.vars.outcomeKey === "agent.trace.toolOutcome.rejected",
    "trace event line runtime should derive deterministic tool-result descriptor",
  );

  const toolRetryGuardDescriptor = deriveTraceToolRetryGuardLineDescriptor({
    type: "tool_retry_guard",
    tool: "shell",
    streak: 2,
    guidance: "diagnose_before_retry",
    at: 10.8,
  });
  assert(
    toolRetryGuardDescriptor.key === "agent.trace.event.toolRetryGuard" &&
      toolRetryGuardDescriptor.vars.tool === "shell" &&
      toolRetryGuardDescriptor.vars.streak === 2,
    "trace event line runtime should derive deterministic tool-retry-guard descriptor",
  );

  const toolFailureDiagnosisDescriptor = deriveTraceToolFailureDiagnosisLineDescriptor({
    type: "tool_failure_diagnosis",
    errorCount: 3,
    toolCount: 5,
    breakdown: "",
    continuationCount: 2,
    at: 10.9,
  });
  assert(
    toolFailureDiagnosisDescriptor.key === "agent.trace.event.toolFailureDiagnosis" &&
      toolFailureDiagnosisDescriptor.vars.errorCount === 3 &&
      toolFailureDiagnosisDescriptor.vars.toolCount === 5 &&
      toolFailureDiagnosisDescriptor.vars.continuationCount === 2 &&
      toolFailureDiagnosisDescriptor.vars.breakdown === "-",
    "trace event line runtime should derive deterministic tool-failure-diagnosis descriptor",
  );

  const continueFallbackDescriptor = deriveTraceContinueLineDescriptor({
    type: "continue",
    transition: {
      reason: "fallback_retry",
      fallbackModel: "fallback-model",
    },
    iteration: 2,
    at: 11,
  });
  const continueTokenDescriptor = deriveTraceContinueLineDescriptor({
    type: "continue",
    transition: {
      reason: "token_budget_continuation",
      attempt: 2,
    },
    iteration: 3,
    at: 12,
  });
  assert(
    continueFallbackDescriptor.vars.transitionReason === "fallback_retry" &&
      continueFallbackDescriptor.vars.fallbackModel === "fallback-model" &&
      continueFallbackDescriptor.reason.key === "agent.continue.fallbackRetry" &&
      continueFallbackDescriptor.reason.vars?.model === "fallback-model" &&
      continueTokenDescriptor.vars.transitionReason === "token_budget_continuation" &&
      continueTokenDescriptor.vars.attempt === 2 &&
      continueTokenDescriptor.reason.key === "agent.continue.tokenBudget" &&
      continueTokenDescriptor.reason.vars?.attempt === 2,
    "trace event line runtime should derive deterministic continue descriptor payload for fallback/token transitions",
  );

  const stopHookDescriptor = deriveTraceStopHookReviewLineDescriptor({
    type: "stop_hook_review",
    noteCount: 2,
    continuationCount: 1,
    at: 13,
  });
  assert(
    stopHookDescriptor.key === "agent.trace.event.stopHookReview" &&
      stopHookDescriptor.vars.notes === 2 &&
      stopHookDescriptor.vars.continuation === 1,
    "trace event line runtime should derive deterministic stop-hook-review descriptor",
  );

  const permissionProfileDescriptor = deriveTracePermissionRiskProfileLineDescriptor({
    type: "permission_risk_profile",
    tool: "shell",
    riskClass: undefined,
    reason: "policy fallback",
    reversibility: "mixed",
    blastRadius: "workspace",
    at: 14,
  });
  assert(
    permissionProfileDescriptor.key === "agent.trace.event.permissionRiskProfile" &&
      permissionProfileDescriptor.vars.riskClass === null &&
      permissionProfileDescriptor.vars.riskKey === "agent.trace.permissionRisk.policy" &&
      permissionProfileDescriptor.vars.reversibility === "mixed" &&
      permissionProfileDescriptor.vars.reversibilityKey === "agent.permission.prompt.reversibility.mixed" &&
      permissionProfileDescriptor.vars.blastRadius === "workspace" &&
      permissionProfileDescriptor.vars.blastRadiusKey === "agent.permission.prompt.blastRadius.workspace",
    "trace event line runtime should derive deterministic permission-risk-profile descriptor with null fallback risk class",
  );

  const scopeNoticeDescriptor = deriveTraceAuthorizationScopeNoticeLineDescriptor({
    type: "authorization_scope_notice",
    tool: "shell",
    riskClass: "high_risk",
    priorApprovals: 2,
    at: 15,
  });
  assert(
    scopeNoticeDescriptor.key === "agent.trace.event.authorizationScope" &&
      scopeNoticeDescriptor.vars.riskClass === "high_risk" &&
      scopeNoticeDescriptor.vars.riskKey === "agent.trace.permissionRisk.high_risk" &&
      scopeNoticeDescriptor.vars.count === 2,
    "trace event line runtime should derive deterministic authorization-scope descriptor",
  );

  const lifecycleDescriptor = deriveTraceCommandLifecycleLineDescriptor({
    type: "command_lifecycle",
    commandId: "cmd-1",
    command: "/trace summary",
    state: "failed",
    lane: "foreground",
    queued: false,
    terminalReason: "error",
    at: 16,
  });
  assert(
    lifecycleDescriptor.key === "agent.trace.event.commandLifecycle" &&
      lifecycleDescriptor.vars.state === "failed" &&
      lifecycleDescriptor.vars.stateKey === "agent.trace.commandLifecycle.state.failed" &&
      lifecycleDescriptor.vars.command === "/trace summary",
    "trace event line runtime should derive deterministic command-lifecycle descriptor",
  );

  const queryEndDescriptor = deriveTraceQueryEndLineDescriptor({
    type: "query_end",
    terminalReason: "completed",
    durationMs: 1234,
    at: 17,
  });
  assert(
    queryEndDescriptor.key === "agent.trace.event.queryEnd" &&
      queryEndDescriptor.vars.terminalReason === "completed" &&
      queryEndDescriptor.vars.terminalReasonKey === "agent.trace.terminal.completed" &&
      queryEndDescriptor.vars.durationSec === "1.2",
    "trace event line runtime should derive deterministic query-end descriptor",
  );
}

function verifyTraceEventRendererRuntimeDeterministic(locale: AppLocale): void {
  const renderContext = {
    t: (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key as TranslationKey, vars),
  };

  const queryStartLine = renderTraceEventLine(renderContext, {
    type: "query_start",
    model: "demo-model",
    queueCount: 2,
    lane: "background",
    retryMax: 3,
    fallbackEnabled: true,
    retryStrategy: "queue_pressure",
    at: 1,
  });
  assert(
    queryStartLine.includes(translate(locale, "agent.trace.queryLane.background")) &&
      queryStartLine.includes(translate(locale, "agent.trace.queryFallback.on")) &&
      queryStartLine.includes(translate(locale, "agent.trace.retryStrategy.queue_pressure")),
    "trace event renderer runtime should render detailed query-start line with lane/fallback/retry-strategy labels",
  );

  const queueUpdateLine = renderTraceEventLine(renderContext, {
    type: "queue_update",
    action: "queued",
    queueCount: 3,
    queueLimit: 8,
    priority: "later",
    reason: "deduplicated",
    at: 2,
  });
  assert(
    queueUpdateLine.includes(translate(locale, "agent.trace.queueAction.queued")) &&
      queueUpdateLine.includes(translate(locale, "agent.trace.queueReason.deduplicated")) &&
      queueUpdateLine.includes(translate(locale, "agent.queue.priority.later")),
    "trace event renderer runtime should render queue update with action, reason and priority labels",
  );

  const queryEndLine = renderTraceEventLine(renderContext, {
    type: "query_end",
    terminalReason: "stop_hook_prevented",
    durationMs: 2500,
    at: 3,
  });
  assert(
    queryEndLine.includes(translate(locale, "agent.trace.terminal.stopHookPrevented")) &&
      queryEndLine.includes("2.5"),
    "trace event renderer runtime should render query-end with normalized terminal reason label and duration",
  );
}

function verifyTraceLabelRuntimeDeterministic(locale: AppLocale): void {
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key as TranslationKey, vars);

  assert(
    formatTraceTerminalReasonLabel(t, "stop_hook_prevented") ===
      translate(locale, "agent.trace.terminal.stopHookPrevented"),
    "trace label runtime should normalize terminal reason labels deterministically",
  );
  assert(
    formatTraceRetryStrategyLabel(t, undefined) ===
      translate(locale, "agent.trace.retryStrategy.balanced"),
    "trace label runtime should default retry strategy to balanced when absent",
  );
  assert(
    formatTraceRetryStrategyLabel(t, "queue_pressure") ===
      translate(locale, "agent.trace.retryStrategy.queue_pressure"),
    "trace label runtime should map retry strategy ids deterministically",
  );
  assert(
    formatTraceQueuePriorityLabel(t, "later") ===
      translate(locale, "agent.queue.priority.later"),
    "trace label runtime should map queue priority ids deterministically",
  );
  assert(
    formatTraceToolFailureClassLabel(t, "runtime") ===
      translate(locale, "agent.trace.toolFailureClass.runtime"),
    "trace label runtime should map failure class ids deterministically",
  );
  assert(
    formatTraceToolBudgetReasonLabel(t, "failure_backoff") ===
      translate(locale, "agent.trace.toolBudgetReason.failure_backoff"),
    "trace label runtime should map tool budget reason ids deterministically",
  );
  assert(
    formatTraceFallbackSuppressedReasonLabel(
      t,
      "retry_strategy",
      translate(locale, "agent.command.unknown"),
    ) === translate(locale, "agent.trace.fallbackSuppressedReason.retry_strategy"),
    "trace label runtime should map known fallback-suppressed reasons deterministically",
  );
  assert(
    formatTraceFallbackSuppressedReasonLabel(
      t,
      "",
      translate(locale, "agent.command.unknown"),
    ) === translate(locale, "agent.command.unknown"),
    "trace label runtime should return unknown label when fallback reason is empty",
  );
}

function verifyTraceInvestigateRuntimeDeterministic(): void {
  const scopedCommand = buildTraceInvestigateSummaryCommand({
    tool: "shell",
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
  });
  assert(
    scopedCommand ===
      "/trace summary failure tool=shell runs=6 risk=high_risk reversibility=hard_to_reverse blast=shared",
    "trace investigate runtime should build scoped summary command deterministically",
  );

  const baseCommand = buildTraceInvestigateSummaryCommand({
    tool: "read_file",
    runWindow: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
  });
  assert(
    baseCommand === "/trace summary failure tool=read_file runs=all",
    "trace investigate runtime should omit scoped filters when all filters are disabled",
  );

  const descriptors = deriveTraceInvestigateRunbookLineDescriptors({
    tool: "shell",
    total: 9,
    errors: 4,
    rejected: 2,
    denied: 1,
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
  });
  assertArrayEquals(
    descriptors.map((line) => line.key),
    [
      "agent.command.trace.investigateRunbookTitle",
      "agent.command.trace.investigateRunbookScope",
      "agent.command.trace.investigateRunbookDiagnosis",
      "agent.command.trace.investigateRunbookDiagnosisItem",
      "agent.command.trace.investigateRunbookFix",
      "agent.command.trace.investigateRunbookFixItem",
      "agent.command.trace.investigateRunbookVerify",
      "agent.command.trace.investigateRunbookVerifyItemLint",
      "agent.command.trace.investigateRunbookVerifyItemBuild",
      "agent.command.trace.investigateRunbookVerifyItemTest",
      "agent.command.trace.investigateRunbookRollback",
      "agent.command.trace.investigateRunbookRollbackItem",
    ],
    "trace investigate runtime should emit deterministic runbook descriptor order",
  );
  assert(
    descriptors[1]?.vars?.tool === "shell" &&
      descriptors[1]?.vars?.total === 9 &&
      descriptors[1]?.vars?.errors === 4 &&
      descriptors[1]?.vars?.rejected === 2 &&
      descriptors[1]?.vars?.denied === 1 &&
      descriptors[3]?.vars?.command === scopedCommand,
    "trace investigate runtime should wire scope vars and diagnosis command deterministically",
  );
}

function verifyTraceInvestigateActionRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "tool_result", tool: "shell", outcome: "error", at: 1 },
    { type: "tool_result", tool: "shell", outcome: "rejected", at: 2 },
    {
      type: "permission_decision",
      tool: "shell",
      behavior: "deny",
      reason: "blocked",
      riskClass: "high_risk",
      at: 3,
    },
    { type: "tool_result", tool: "read_file", outcome: "error", at: 4 },
  ];
  const t = (key: string, vars?: Record<string, string | number>) =>
    `t:${key}:${JSON.stringify(vars ?? {})}`;

  const actionPlan = deriveTraceInvestigateActionPlan({
    t,
    visibleEvents: events,
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
    investigateWorkflowMode: true,
    investigateSubmitMode: true,
  });
  assert(
    actionPlan.hotspot?.tool === "shell" &&
      actionPlan.hotspot.total === 3 &&
      actionPlan.hotspot.errors === 1 &&
      actionPlan.hotspot.rejected === 1 &&
      actionPlan.hotspot.denied === 1 &&
      actionPlan.runbookLines.length === 12 &&
      actionPlan.workflowDescriptor?.metadata.source === "trace_investigate" &&
      actionPlan.workflowDescriptor.metadata.tool === "shell" &&
      actionPlan.submitPrompt ===
        't:agent.command.trace.investigatePrompt:{"tool":"shell","total":3,"errors":1,"rejected":1,"denied":1}',
    "trace investigate action runtime should derive deterministic hotspot/runbook/workflow/submit action plan",
  );

  const noActionPlan = deriveTraceInvestigateActionPlan({
    t,
    visibleEvents: [],
    runWindow: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    investigateWorkflowMode: true,
    investigateSubmitMode: true,
  });
  assert(
    noActionPlan.hotspot === null &&
      noActionPlan.runbookLines.length === 0 &&
      noActionPlan.workflowDescriptor === null &&
      noActionPlan.submitPrompt === null,
    "trace investigate action runtime should preserve deterministic empty-action plan",
  );
}

function verifyTraceInvestigateMessageRuntimeDeterministic(): void {
  const runbookLines = deriveTraceInvestigateRunbookLines({
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    tool: "shell",
    total: 9,
    errors: 4,
    rejected: 2,
    denied: 1,
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
  });
  assert(
    runbookLines.length === 12 &&
      runbookLines[0]?.startsWith("t:agent.command.trace.investigateRunbookTitle:") &&
      runbookLines[3]?.includes(
        "/trace summary failure tool=shell runs=6 risk=high_risk reversibility=hard_to_reverse blast=shared",
      ),
    "trace investigate message runtime should derive deterministic localized runbook lines",
  );

  assert(
    deriveTraceInvestigateSubmitResultLine({
      submitResult: {
        accepted: true,
        started: true,
        queueCount: 0,
        queueLimit: 8,
      },
      t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    }) === "t:agent.command.trace.investigateSubmitStarted:{}",
    "trace investigate message runtime should derive deterministic submit-started line",
  );
  assert(
    deriveTraceInvestigateSubmitResultLine({
      submitResult: {
        accepted: true,
        started: false,
        queueCount: 3,
        queueLimit: 8,
      },
      t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    }) === 't:agent.command.trace.investigateSubmitQueued:{"queue":3,"limit":8}',
    "trace investigate message runtime should derive deterministic submit-queued line",
  );
  assert(
    deriveTraceInvestigateSubmitResultLine({
      submitResult: {
        accepted: false,
        reason: "queue_full",
        queueCount: 8,
        queueLimit: 8,
      },
      t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    }) === 't:agent.command.trace.investigateSubmitQueueFull:{"queue":8,"limit":8}',
    "trace investigate message runtime should derive deterministic queue-full line",
  );
  assert(
    deriveTraceInvestigateSubmitResultLine({
      submitResult: {
        accepted: false,
        reason: "empty",
        queueCount: 0,
        queueLimit: 8,
      },
      t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    }) === "t:agent.command.trace.investigateSubmitEmpty:{}",
    "trace investigate message runtime should derive deterministic submit-empty line",
  );

  const message = deriveTraceInvestigateMessage({
    hotspot: {
      tool: "shell",
      total: 9,
      errors: 4,
      rejected: 2,
      denied: 1,
    },
    filterLabel: "all",
    warningLabel: "warn-only",
    runbookLines: ["runbook-1", "runbook-2"],
    includeRunbook: true,
    submitResultLine: "submit-line",
    workflowTask: {
      id: "task-1",
      type: "local_workflow",
      description: "desc",
    },
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
  });
  assert(
    message.startsWith(
      't:agent.command.trace.investigateTitle:{"tool":"shell"}\n' +
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":"warn-only"}\n' +
        't:agent.command.trace.investigateStats:{"total":9,"errors":4,"rejected":2,"denied":1}',
    ) &&
      message.includes("\n\nsubmit-line\n\n") &&
      message.includes("runbook-1\nrunbook-2") &&
      message.includes('t:agent.command.task.created:{"taskId":"task-1"}') &&
      message.includes('t:agent.command.task.createdType:{"type":"local_workflow"}'),
    "trace investigate message runtime should compose deterministic investigate message payload",
  );

  const emptyMessage = deriveTraceInvestigateMessage({
    hotspot: null,
    filterLabel: "all",
    warningLabel: "warn-only",
    runbookLines: [],
    includeRunbook: false,
    submitResultLine: null,
    workflowTask: null,
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
  });
  assert(
    emptyMessage ===
      't:agent.command.trace.investigateTitleEmpty:{}\n' +
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":"warn-only"}\n' +
        "t:agent.command.trace.hotspotsEmpty:{}",
    "trace investigate message runtime should preserve deterministic empty investigate branch",
  );
}

function verifyTraceListMessageRuntimeDeterministic(): void {
  const message = deriveTraceListMessage({
    visibleEvents: [
      { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
      { type: "tool_result", tool: "shell", outcome: "error", at: 2000 },
    ],
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatEventTime: (at) => `time:${at}`,
    formatEventLine: (event) => `line:${event.type}`,
    filterLabel: "all",
    warningLabel: "warn-only",
  });
  assert(
    message ===
      't:agent.command.trace.title:{"count":2}\n' +
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":"warn-only"}\n' +
        "[time:1000] line:query_start\n" +
        "[time:2000] line:tool_result",
    "trace list message runtime should compose deterministic title/filter/event line output",
  );

  const emptyMessage = deriveTraceListMessage({
    visibleEvents: [],
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatEventTime: (at) => `time:${at}`,
    formatEventLine: (event) => `line:${event.type}`,
    filterLabel: "all",
    warningLabel: "warn-only",
  });
  assert(
    emptyMessage ===
      't:agent.command.trace.title:{"count":0}\n' +
        "t:agent.command.trace.empty:{}",
    "trace list message runtime should preserve deterministic empty branch",
  );
}

function verifyTraceSummaryRenderRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 3,
      staticChars: 2000,
      dynamicChars: 600,
      totalChars: 2600,
      at: 1200,
    },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1800 },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 4,
      priority: "now",
      reason: "deduplicated",
      at: 2200,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 2600,
    },
    {
      type: "continue",
      transition: { reason: "fallback_retry", fallbackModel: "fallback-model" },
      iteration: 1,
      at: 3000,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 3600,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 4000, at: 5000 },
    { type: "query_start", model: "demo-model", queueCount: 0, at: 10000 },
    { type: "tool_result", tool: "shell", outcome: "result", at: 11000 },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 13000 },
  ];

  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });

  const allSnapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });
  assert(
    allSnapshot.runs.length === 2 &&
      allSnapshot.runs[0]?.runIndex === 1 &&
      allSnapshot.runs[0]?.durationSec === 4 &&
      allSnapshot.runs[0]?.latestPromptCompiled?.type === "prompt_compiled" &&
      allSnapshot.runs[0]?.hotspotParts === "shell=1" &&
      allSnapshot.runs[0]?.riskProfileStats?.total === 1 &&
      allSnapshot.runs[0]?.fallbackStats.used === 1 &&
      allSnapshot.runs[0]?.fallbackStats.suppressed === 1 &&
      allSnapshot.runs[0]?.queuePriorityStats.total === 1 &&
      allSnapshot.runs[0]?.queuePriorityStats.pressure === "busy",
    "trace summary render runtime should derive deterministic per-run snapshot fields",
  );
  assert(
    allSnapshot.overview.visibleEvents.length === 11 &&
      allSnapshot.overview.hotspotParts === "shell=1" &&
      allSnapshot.overview.riskProfileStats?.total === 1 &&
      allSnapshot.overview.fallbackStats.used === 1 &&
      allSnapshot.overview.fallbackStats.suppressed === 1 &&
      allSnapshot.overview.queuePriorityStats.total === 1,
    "trace summary render runtime should derive deterministic overview snapshot fields",
  );

  const limitedSnapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 1,
    queueLimit: 4,
  });
  assert(
    limitedSnapshot.runs.length === 1 &&
      limitedSnapshot.runs[0]?.runIndex === 2 &&
      limitedSnapshot.runs[0]?.durationSec === 3 &&
      limitedSnapshot.runs[0]?.latestPromptCompiled === null &&
      limitedSnapshot.runs[0]?.hotspotParts === "",
    "trace summary render runtime should deterministically apply run limit windowing",
  );
}

function verifyTraceSummaryLineRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 3,
      staticChars: 2000,
      dynamicChars: 600,
      totalChars: 2600,
      at: 1200,
    },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1800 },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const snapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });
  const run = snapshot.runs[0];
  assert(run, "trace summary line runtime deterministic test should include at least one run");

  const categoryEntries = deriveTraceSummaryCategoryEntries(run.categoryCounts);
  assertArrayEquals(
    categoryEntries.map((entry) => entry.category),
    TRACE_CATEGORY_ORDER.filter((category) => run.categoryCounts[category] > 0),
    "trace summary line runtime should derive category entries in deterministic bucket order",
  );
  assert(
    categoryEntries.every((entry) => entry.count === run.categoryCounts[entry.category]),
    "trace summary line runtime should preserve category counts in derived entries",
  );

  const baseDescriptor = deriveTraceSummaryRunBaseDescriptor({
    run,
    statusLabel: "completed",
    categoryParts: "query=1 prompt=1 tools=1",
  });
  assert(
    baseDescriptor.key === "agent.command.trace.summaryLine" &&
      baseDescriptor.vars.run === run.runIndex &&
      baseDescriptor.vars.duration === run.durationSec.toFixed(1) &&
      baseDescriptor.vars.events === run.visibleEvents.length &&
      baseDescriptor.vars.warns === run.warningCount &&
      baseDescriptor.vars.errors === run.errorCount &&
      baseDescriptor.vars.categories === "query=1 prompt=1 tools=1",
    "trace summary line runtime should derive deterministic run base descriptor payload",
  );

  assert(
    composeTraceSummaryRunLine("base", []) === "base" &&
      composeTraceSummaryRunLine("base", ["detail-1", "detail-2"]) ===
        "base\n  detail-1\n  detail-2",
    "trace summary line runtime should compose run line with stable detail indentation",
  );

  assert(
    composeTraceSummaryMessage({
      titleLine: "title",
      appliedFilterLine: "filter",
      overviewLines: [null, "overview-1", undefined, "overview-2"],
      runLines: ["run-1", "run-2"],
    }) === "title\nfilter\noverview-1\noverview-2\nrun-1\nrun-2",
    "trace summary line runtime should compose summary message in deterministic order while skipping empty overview lines",
  );
}

function verifyTraceSummaryOverviewRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1200 },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 1,
      queueLimit: 4,
      priority: "later",
      reason: "deduplicated",
      at: 1400,
    },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 1500,
    },
    {
      type: "continue",
      transition: { reason: "fallback_retry", fallbackModel: "fallback-model" },
      iteration: 1,
      at: 1600,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 1700,
    },
    {
      type: "tool_failure_classified",
      tool: "shell",
      failureClass: "runtime",
      streak: 1,
      at: 1750,
    },
    {
      type: "tool_budget_guard",
      tool: "shell",
      count: 3,
      budget: 2,
      reason: "failure_backoff",
      at: 1800,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const snapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });
  const lines = deriveTraceSummaryOverviewLineDescriptors({
    overview: snapshot.overview,
    riskProfileParts: "high_risk=1",
    nowLabel: "now",
    nextLabel: "next",
    laterLabel: "later",
    formatNumber: (value) => String(value),
    formatRetryStrategyLabel: (strategy) => `strategy:${strategy ?? "balanced"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatFallbackSuppressedReasonLabel: (reasonId) => `reason:${reasonId}`,
  });
  assertArrayEquals(
    lines.map((line) => line.key),
    [
      "agent.command.trace.summaryGlobalHotspots",
      "agent.command.trace.riskProfile",
      "agent.command.trace.riskProfileMatrix",
      "agent.command.trace.summaryGlobalFallbackDetailed",
      "agent.command.trace.summaryGlobalQueuePriority",
      "agent.command.trace.summaryGlobalFailureClasses",
      "agent.command.trace.summaryGlobalBudgetGuards",
    ],
    "trace summary overview runtime should emit deterministic overview descriptor order",
  );
  const fallbackLine = lines[3];
  assert(
    fallbackLine?.key === "agent.command.trace.summaryGlobalFallbackDetailed" &&
      fallbackLine.vars.reason === "reason:retry_strategy" &&
      fallbackLine.vars.strategy === "strategy:queue_pressure",
    "trace summary overview runtime should wire fallback reason and strategy formatters deterministically",
  );
  const failureLine = lines[5];
  assert(
    failureLine?.key === "agent.command.trace.summaryGlobalFailureClasses" &&
      typeof failureLine.vars.details === "string" &&
      failureLine.vars.details.includes("failure:runtime=1"),
    "trace summary overview runtime should wire failure-class formatter deterministically",
  );
  const budgetLine = lines[6];
  assert(
    budgetLine?.key === "agent.command.trace.summaryGlobalBudgetGuards" &&
      budgetLine.vars.count === "1",
    "trace summary overview runtime should wire budget-guard count formatter deterministically",
  );
}

function verifyTraceSummaryRunDetailRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 3,
      staticChars: 2000,
      dynamicChars: 600,
      totalChars: 2600,
      at: 1200,
    },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1400 },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 1500,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 4,
      priority: "next",
      reason: "admission",
      at: 1600,
    },
    {
      type: "continue",
      transition: { reason: "fallback_retry", fallbackModel: "fallback-model" },
      iteration: 1,
      at: 1700,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 1800,
    },
    {
      type: "tool_failure_classified",
      tool: "shell",
      failureClass: "runtime",
      streak: 1,
      at: 1900,
    },
    {
      type: "tool_budget_guard",
      tool: "shell",
      count: 2,
      budget: 1,
      reason: "failure_backoff",
      at: 2000,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const snapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });
  const run = snapshot.runs[0];
  assert(run, "trace summary run-detail runtime deterministic test should include one run");

  const lines = deriveTraceSummaryRunDetailLines({
    run,
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    formatRetryStrategyLabel: (strategy) => `strategy:${strategy ?? "balanced"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatFallbackSuppressedReasonLabel: (reasonId) => `reason:${reasonId}`,
    promptBucketLabel: "PROMPT",
    formatPromptLine: () => "prompt-line",
  });

  assert(
    lines.length === 7 &&
      lines[0] === "PROMPT: prompt-line" &&
      lines[1]?.startsWith("t:agent.command.trace.summaryHotspots:") &&
      lines[2]?.startsWith("t:agent.command.trace.riskProfileMatrix:") &&
      lines[3]?.startsWith("t:agent.command.trace.summaryFallbackDetailed:") &&
      lines[4]?.startsWith("t:agent.command.trace.summaryQueuePriority:") &&
      lines[5]?.startsWith("t:agent.command.trace.summaryFailureClasses:") &&
      lines[6]?.startsWith("t:agent.command.trace.summaryBudgetGuards:"),
    "trace summary run-detail runtime should emit deterministic detail-line ordering and keys",
  );

  assert(
    lines[3]?.includes("\"reason\":\"reason:retry_strategy\"") &&
      lines[3]?.includes("\"strategy\":\"strategy:queue_pressure\""),
    "trace summary run-detail runtime should pass fallback reason and strategy formatters deterministically",
  );
  assert(
    lines[4]?.includes("\"nextLabel\":\"NEXT\"") &&
      lines[4]?.includes("\"nextQueued\":\"n1\""),
    "trace summary run-detail runtime should pass queue-priority formatter payload deterministically",
  );
  assert(
    lines[5]?.includes("failure:runtime"),
    "trace summary run-detail runtime should pass failure-class formatter payload deterministically",
  );
}

function verifyTraceSummaryRunLinesRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 3,
      staticChars: 2000,
      dynamicChars: 600,
      totalChars: 2600,
      at: 1200,
    },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1400 },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 1500,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 4,
      priority: "next",
      reason: "admission",
      at: 1600,
    },
    {
      type: "continue",
      transition: { reason: "fallback_retry", fallbackModel: "fallback-model" },
      iteration: 1,
      at: 1700,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 1800,
    },
    {
      type: "tool_failure_classified",
      tool: "shell",
      failureClass: "runtime",
      streak: 1,
      at: 1900,
    },
    {
      type: "tool_budget_guard",
      tool: "shell",
      count: 2,
      budget: 1,
      reason: "failure_backoff",
      at: 2000,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
    { type: "query_start", model: "demo-model", queueCount: 0, at: 5000 },
    { type: "tool_result", tool: "fetch", outcome: "result", at: 5200 },
    { type: "query_end", terminalReason: "completed", durationMs: 1000, at: 6000 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const snapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });
  const lines = deriveTraceSummaryRunLines({
    runs: snapshot.runs,
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    formatTerminalReasonLabel: (reason) => `status:${reason}`,
    ongoingStatusLabel: "status:ongoing",
    formatRetryStrategyLabel: (strategy) => `strategy:${strategy ?? "balanced"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatFallbackSuppressedReasonLabel: (reasonId) => `reason:${reasonId}`,
    promptBucketLabel: "PROMPT",
    formatPromptLine: () => "prompt-line",
    formatBucketLabel: (category) => `bucket:${category}`,
  });

  assert(
    lines.length === 2 &&
      lines.every((line) => line.startsWith("t:agent.command.trace.summaryLine:")) &&
      lines.some((line) => line.includes("\n  PROMPT: prompt-line")) &&
      lines.some((line) => line.includes("\n  t:agent.command.trace.summaryHotspots:")) &&
      lines.some((line) => line.includes("\n  t:agent.command.trace.summaryFallbackDetailed:")),
    "trace summary run-lines runtime should emit deterministic run-line ordering with detail composition",
  );
  const promptRunLine = lines.find((line) => line.includes("\n  PROMPT: prompt-line"));
  const plainRunLine = lines.find((line) => !line.includes("\n  PROMPT: prompt-line"));
  assert(
    Boolean(promptRunLine) && Boolean(plainRunLine),
    "trace summary run-lines runtime deterministic test should include one prompt-rich run and one plain run",
  );
  assert(
    promptRunLine?.includes("\"status\":\"status:completed\"") &&
      promptRunLine.includes("bucket:query=2") &&
      promptRunLine.includes("bucket:prompt=1") &&
      promptRunLine.includes("bucket:tools="),
    "trace summary run-lines runtime should wire status and bucket formatting into base descriptor deterministically",
  );
  assert(
    plainRunLine?.includes("bucket:query=2") &&
      plainRunLine.includes("bucket:tools=1") &&
      !plainRunLine.includes("bucket:prompt="),
    "trace summary run-lines runtime should include only present bucket categories deterministically",
  );
}

function verifyTraceSummaryMessageRuntimeDeterministic(): void {
  const events: QueryStreamEvent[] = [
    { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
    {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 3,
      staticChars: 2000,
      dynamicChars: 600,
      totalChars: 2600,
      at: 1200,
    },
    { type: "tool_result", tool: "shell", outcome: "error", at: 1400 },
    {
      type: "permission_risk_profile",
      tool: "shell",
      riskClass: "high_risk",
      reason: "high-risk shell",
      reversibility: "mixed",
      blastRadius: "workspace",
      at: 1500,
    },
    {
      type: "queue_update",
      action: "queued",
      queueCount: 2,
      queueLimit: 4,
      priority: "next",
      reason: "admission",
      at: 1600,
    },
    {
      type: "continue",
      transition: { reason: "fallback_retry", fallbackModel: "fallback-model" },
      iteration: 1,
      at: 1700,
    },
    {
      type: "fallback_suppressed",
      iteration: 2,
      model: "demo-model",
      lane: "foreground",
      reason: "retry_strategy",
      retryStrategy: "queue_pressure",
      at: 1800,
    },
    {
      type: "tool_failure_classified",
      tool: "shell",
      failureClass: "runtime",
      streak: 1,
      at: 1900,
    },
    {
      type: "tool_budget_guard",
      tool: "shell",
      count: 2,
      budget: 1,
      reason: "failure_backoff",
      at: 2000,
    },
    { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
  ];
  const visibleRuns = buildVisibleTraceRunSummaries({
    events,
    filter: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    warningsOnly: false,
    failureFocus: false,
    toolFocus: null,
    runWindow: "all",
  });
  const summarySnapshot = deriveTraceSummarySnapshot({
    visibleRuns,
    limit: 8,
    queueLimit: 4,
  });

  const message = deriveTraceSummaryMessage({
    summarySnapshot,
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    formatTerminalReasonLabel: (reason) => `status:${reason}`,
    ongoingStatusLabel: "status:ongoing",
    formatRetryStrategyLabel: (strategy) => `strategy:${strategy ?? "balanced"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatFallbackSuppressedReasonLabel: (reasonId) => `reason:${reasonId}`,
    formatPermissionRiskLabel: (risk) => `risk:${risk}`,
    promptBucketLabel: "PROMPT",
    formatPromptLine: () => "prompt-line",
    formatBucketLabel: (category) => `bucket:${category}`,
    titleLine: "TITLE",
    appliedFilterLine: "FILTER",
    emptyLine: "EMPTY",
  });

  assert(
    message.startsWith("TITLE\nFILTER\n") &&
      message.includes("t:agent.command.trace.summaryGlobalHotspots:") &&
      message.includes("t:agent.command.trace.riskProfile:{\"risks\":\"risk:high_risk=1\"}") &&
      message.includes("t:agent.command.trace.summaryLine:"),
    "trace summary message runtime should compose deterministic summary title/filter/overview/run lines",
  );
  const filterIndex = message.indexOf("FILTER");
  const overviewIndex = message.indexOf("t:agent.command.trace.summaryGlobalHotspots:");
  const runIndex = message.indexOf("t:agent.command.trace.summaryLine:");
  assert(
    filterIndex >= 0 && overviewIndex > filterIndex && runIndex > overviewIndex,
    "trace summary message runtime should preserve deterministic line ordering: filter -> overview -> runs",
  );

  const emptySnapshot = deriveTraceSummarySnapshot({
    visibleRuns: [],
    limit: 8,
    queueLimit: 4,
  });
  const emptyMessage = deriveTraceSummaryMessage({
    summarySnapshot: emptySnapshot,
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    formatTerminalReasonLabel: (reason) => `status:${reason}`,
    ongoingStatusLabel: "status:ongoing",
    formatRetryStrategyLabel: (strategy) => `strategy:${strategy ?? "balanced"}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatFallbackSuppressedReasonLabel: (reasonId) => `reason:${reasonId}`,
    formatPermissionRiskLabel: (risk) => `risk:${risk}`,
    promptBucketLabel: "PROMPT",
    formatPromptLine: () => "prompt-line",
    formatBucketLabel: (category) => `bucket:${category}`,
    titleLine: "TITLE-EMPTY",
    appliedFilterLine: "FILTER-EMPTY",
    emptyLine: "EMPTY-LINE",
  });
  assert(
    emptyMessage === "TITLE-EMPTY\nEMPTY-LINE",
    "trace summary message runtime should preserve empty summary branch without applied-filter line",
  );
}

function verifyTraceSummaryDescriptorRuntimeDeterministic(): void {
  const quiet = deriveTraceSummaryFallbackDescriptor({
    scope: "run",
    stats: {
      used: 0,
      suppressed: 0,
      latestSuppressed: null,
    },
  });
  assert(
    quiet === null,
    "trace summary descriptor runtime should omit fallback descriptor when usage and suppression are zero",
  );

  const runDetailed = deriveTraceSummaryFallbackDescriptor({
    scope: "run",
    stats: {
      used: 2,
      suppressed: 3,
      latestSuppressed: {
        type: "fallback_suppressed",
        iteration: 4,
        model: "demo-model",
        lane: "foreground",
        reason: "retry_strategy",
        retryStrategy: "queue_pressure",
        at: 100,
      },
    },
  });
  assert(
    runDetailed?.key === "agent.command.trace.summaryFallbackDetailed" &&
      runDetailed.reasonId === "retry_strategy" &&
      runDetailed.retryStrategy === "queue_pressure" &&
      runDetailed.used === 2 &&
      runDetailed.suppressed === 3,
    "trace summary descriptor runtime should emit run detailed descriptor with reason and strategy",
  );

  const globalBase = deriveTraceSummaryFallbackDescriptor({
    scope: "global",
    stats: {
      used: 1,
      suppressed: 0,
      latestSuppressed: null,
    },
  });
  assert(
    globalBase?.key === "agent.command.trace.summaryGlobalFallback" &&
      globalBase.reasonId === null &&
      globalBase.retryStrategy === undefined,
    "trace summary descriptor runtime should emit global base descriptor when suppressed details are unavailable",
  );

  const queueDescriptor = deriveTraceSummaryQueuePriorityDescriptor({
    scope: "run",
    stats: {
      total: 2,
      queued: { now: 1, next: 0, later: 0 },
      dequeued: { now: 0, next: 1, later: 0 },
      rejected: { now: 0, next: 0, later: 1 },
      latestQueueDepth: 3,
      maxQueueDepth: 5,
      pressure: "busy",
    },
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    formatNumber: (value) => String(value),
  });
  assert(
    queueDescriptor?.key === "agent.command.trace.summaryQueuePriority" &&
      queueDescriptor.vars.nowLabel === "NOW" &&
      queueDescriptor.vars.nowQueued === "1" &&
      queueDescriptor.vars.nextDequeued === "1" &&
      queueDescriptor.vars.laterRejected === "1",
    "trace summary descriptor runtime should emit deterministic queue-priority descriptor payload",
  );
  assert(
    deriveTraceSummaryQueuePriorityDescriptor({
      scope: "global",
      stats: {
        total: 0,
        queued: { now: 0, next: 0, later: 0 },
        dequeued: { now: 0, next: 0, later: 0 },
        rejected: { now: 0, next: 0, later: 0 },
        latestQueueDepth: 0,
        maxQueueDepth: 0,
        pressure: "idle",
      },
      nowLabel: "NOW",
      nextLabel: "NEXT",
      laterLabel: "LATER",
      formatNumber: (value) => String(value),
    }) === null,
    "trace summary descriptor runtime should omit queue-priority descriptor when total is zero",
  );

  const failureDescriptor = deriveTraceSummaryFailureClassDescriptor({
    scope: "global",
    total: 2,
    details: "runtime=1 permission=1",
  });
  assert(
    failureDescriptor?.key === "agent.command.trace.summaryGlobalFailureClasses" &&
      failureDescriptor.vars.details === "runtime=1 permission=1",
    "trace summary descriptor runtime should emit deterministic failure-class descriptor payload",
  );
  assert(
    deriveTraceSummaryFailureClassDescriptor({
      scope: "run",
      total: 0,
      details: "",
    }) === null,
    "trace summary descriptor runtime should omit failure-class descriptor when total is zero",
  );

  const budgetDescriptor = deriveTraceSummaryBudgetGuardDescriptor({
    scope: "run",
    count: 3,
    formatNumber: (value) => String(value),
  });
  assert(
    budgetDescriptor?.key === "agent.command.trace.summaryBudgetGuards" &&
      budgetDescriptor.vars.count === "3",
    "trace summary descriptor runtime should emit deterministic budget-guard descriptor payload",
  );
  assert(
    deriveTraceSummaryBudgetGuardDescriptor({
      scope: "global",
      count: 0,
      formatNumber: (value) => String(value),
    }) === null,
    "trace summary descriptor runtime should omit budget-guard descriptor when count is zero",
  );

  const riskMatrixDescriptor = deriveTraceRiskProfileMatrixDescriptor({
    reversible: 1,
    mixed: 2,
    hardToReverse: 3,
    local: 4,
    workspace: 5,
    shared: 6,
    total: 6,
  });
  assert(
    riskMatrixDescriptor?.key === "agent.command.trace.riskProfileMatrix" &&
      riskMatrixDescriptor.vars.reversible === 1 &&
      riskMatrixDescriptor.vars.mixed === 2 &&
      riskMatrixDescriptor.vars.hardToReverse === 3 &&
      riskMatrixDescriptor.vars.local === 4 &&
      riskMatrixDescriptor.vars.workspace === 5 &&
      riskMatrixDescriptor.vars.shared === 6,
    "trace summary descriptor runtime should emit deterministic risk-profile matrix descriptor payload",
  );
  assert(
    deriveTraceRiskProfileMatrixDescriptor({
      reversible: 0,
      mixed: 0,
      hardToReverse: 0,
      local: 0,
      workspace: 0,
      shared: 0,
      total: 0,
    }) === null,
    "trace summary descriptor runtime should omit risk-profile matrix descriptor when total is zero",
  );
}

function verifyTraceFilterRuntimeDeterministic(): void {
  const snapshot = deriveTraceAppliedFilterLabelSnapshot({
    filterLabel: "all",
    warningsOnly: true,
    warningsOnlyLabel: "warnings-only",
    failureFocus: true,
    failureFocusLabel: "failure-focus",
    hottestMode: true,
    hottestApplied: true,
    hottestAppliedLabel: "hottest=shell",
    hottestNoDataLabel: "hottest=none",
    toolLabel: "tool=shell",
    runsAll: false,
    runsAllLabel: "runs=all",
    runsWindowLabel: "runs=6",
    riskLabel: "risk=high_risk",
    reversibilityLabel: "reversibility=hard_to_reverse",
    blastRadiusLabel: "blast=shared",
  });
  assertArrayEquals(
    snapshot.suffixes,
    [
      "warnings-only",
      "failure-focus",
      "hottest=shell",
      "tool=shell",
      "runs=6",
      "risk=high_risk",
      "reversibility=hard_to_reverse",
      "blast=shared",
    ],
    "trace filter runtime should preserve deterministic suffix ordering",
  );
  assert(
    snapshot.filterLabel === "all" &&
      snapshot.warningLabel ===
        " | warnings-only | failure-focus | hottest=shell | tool=shell | runs=6 | risk=high_risk | reversibility=hard_to_reverse | blast=shared",
    "trace filter runtime should emit deterministic warning label formatting",
  );

  const hottestNoData = deriveTraceAppliedFilterLabelSnapshot({
    filterLabel: "errors",
    warningsOnly: false,
    warningsOnlyLabel: "warnings-only",
    failureFocus: false,
    failureFocusLabel: "failure-focus",
    hottestMode: true,
    hottestApplied: false,
    hottestAppliedLabel: "hottest=shell",
    hottestNoDataLabel: "hottest=none",
    toolLabel: null,
    runsAll: true,
    runsAllLabel: "runs=all",
    runsWindowLabel: "runs=4",
    riskLabel: null,
    reversibilityLabel: null,
    blastRadiusLabel: null,
  });
  assertArrayEquals(
    hottestNoData.suffixes,
    ["hottest=none", "runs=all"],
    "trace filter runtime should emit hottest-no-data suffix when hottest mode has no tool",
  );
}

function verifyTraceHotspotsRuntimeDeterministic(): void {
  const descriptors = deriveTraceHotspotLineDescriptors([
    { tool: "shell", total: 5, errors: 3, rejected: 1, denied: 1 },
    { tool: "read_file", total: 2, errors: 2, rejected: 0, denied: 0 },
  ]);
  assertArrayEquals(
    descriptors.map((line) => line.key),
    ["agent.command.trace.hotspotLine", "agent.command.trace.hotspotLine"],
    "trace hotspots runtime should emit deterministic hotspot line descriptor keys",
  );
  assert(
    descriptors[0]?.vars.index === 1 &&
      descriptors[0]?.vars.tool === "shell" &&
      descriptors[1]?.vars.index === 2 &&
      descriptors[1]?.vars.tool === "read_file",
    "trace hotspots runtime should preserve deterministic hotspot line ordering and indices",
  );

  const noQueueSignal = buildTraceQueuePriorityStats([], 8);
  assert(
    !shouldRenderTraceHotspotsQueuePriority(noQueueSignal),
    "trace hotspots runtime should hide queue-priority line when no priority events and no queue depth",
  );
  const depthOnlySignal = buildTraceQueuePriorityStats(
    [
      {
        type: "queue_update",
        action: "queued",
        queueCount: 2,
        queueLimit: 8,
        at: 1,
      },
    ],
    8,
  );
  assert(
    shouldRenderTraceHotspotsQueuePriority(depthOnlySignal),
    "trace hotspots runtime should show queue-priority line when queue depth is non-zero even without priority events",
  );
  const queueVars = deriveTraceHotspotsQueuePriorityVars({
    stats: buildTraceQueuePriorityStats(
      [
        {
          type: "queue_update",
          action: "queued",
          queueCount: 3,
          queueLimit: 8,
          priority: "now",
          at: 2,
        },
        {
          type: "queue_update",
          action: "rejected",
          queueCount: 4,
          queueLimit: 8,
          priority: "next",
          at: 3,
        },
      ],
      8,
    ),
    queueLimit: 8,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
    pressureLabel: "busy",
    formatNumber: (value) => String(value),
  });
  assert(
    queueVars?.nowLabel === "NOW" &&
      queueVars?.nowQueued === "1" &&
      queueVars?.nextRejected === "1" &&
      queueVars?.depth === "4" &&
      queueVars?.limitSuffix === "/8" &&
      queueVars?.pressure === "busy",
    "trace hotspots runtime should derive deterministic queue-priority vars payload",
  );

  const metaLines = deriveTraceHotspotsMetaLineDescriptors({
    hotspotCount: 2,
    filterLabel: "all",
    warningLabel: "warn-only",
    riskProfileParts: "high=2",
    riskProfileMatrixVars: {
      reversible: 0,
      mixed: 1,
      hardToReverse: 2,
      local: 0,
      workspace: 0,
      shared: 3,
    },
    failureClassDetails: "runtime=1",
    budgetGuardCount: 2,
    queuePriorityVars: queueVars,
    hintCommand: "/trace summary failure tool=shell runs=all",
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    metaLines.map((line) => line.key),
    [
      "agent.command.trace.hotspotsTitle",
      "agent.command.trace.appliedFilter",
      "agent.command.trace.riskProfile",
      "agent.command.trace.riskProfileMatrix",
      "agent.command.trace.summaryFailureClasses",
      "agent.command.trace.summaryBudgetGuards",
      "agent.command.trace.hotspotsQueuePriority",
      "agent.command.trace.hotspotsHint",
    ],
    "trace hotspots runtime should emit deterministic meta line descriptor order",
  );
  assert(
    metaLines[0]?.vars.count === 2 &&
      metaLines[1]?.vars.filter === "all" &&
      metaLines[1]?.vars.warnings === "warn-only" &&
      metaLines[3]?.vars.hardToReverse === 2 &&
      metaLines[7]?.vars.command === "/trace summary failure tool=shell runs=all",
    "trace hotspots runtime should map deterministic meta line vars",
  );

  const scopedHint = buildTraceHotspotsHintCommand({
    topTool: "shell",
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
  });
  assert(
    scopedHint ===
      "/trace summary failure tool=shell runs=6 risk=high_risk reversibility=hard_to_reverse blast=shared",
    "trace hotspots runtime should build deterministic scoped hint command",
  );
  const unscopedHint = buildTraceHotspotsHintCommand({
    topTool: "read_file",
    runWindow: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
  });
  assert(
    unscopedHint === "/trace summary failure tool=read_file runs=all",
    "trace hotspots runtime should omit scope filters in unscoped hint command",
  );
  assert(
    buildTraceHotspotsHintCommand({
      topTool: null,
      runWindow: "all",
      riskFilter: "all",
      reversibilityFilter: "all",
      blastRadiusFilter: "all",
    }) === null,
    "trace hotspots runtime should return null hint when top tool is unavailable",
  );
}

function verifyTraceHotspotsMessageRuntimeDeterministic(): void {
  const message = deriveTraceHotspotsMessage({
    visibleEvents: [
      { type: "query_start", model: "demo-model", queueCount: 0, at: 1000 },
      { type: "tool_result", tool: "shell", outcome: "error", at: 1200 },
      { type: "tool_result", tool: "shell", outcome: "rejected", at: 1300 },
      {
        type: "permission_risk_profile",
        tool: "shell",
        riskClass: "high_risk",
        reason: "high-risk shell",
        reversibility: "hard_to_reverse",
        blastRadius: "shared",
        at: 1400,
      },
      {
        type: "queue_update",
        action: "queued",
        queueCount: 2,
        queueLimit: 8,
        priority: "now",
        reason: "admission",
        at: 1500,
      },
      {
        type: "queue_update",
        action: "rejected",
        queueCount: 3,
        queueLimit: 8,
        priority: "next",
        reason: "capacity",
        at: 1600,
      },
      {
        type: "tool_failure_classified",
        tool: "shell",
        failureClass: "runtime",
        streak: 1,
        at: 1700,
      },
      {
        type: "tool_budget_guard",
        tool: "shell",
        count: 2,
        budget: 1,
        reason: "failure_backoff",
        at: 1800,
      },
      { type: "query_end", terminalReason: "completed", durationMs: 3000, at: 4000 },
    ],
    limit: 8,
    queueLimit: 8,
    filterLabel: "all",
    warningLabel: "warn-only",
    runWindow: 6,
    riskFilter: "high_risk",
    reversibilityFilter: "hard_to_reverse",
    blastRadiusFilter: "shared",
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatPermissionRiskLabel: (risk) => `risk:${risk}`,
    formatQueuePressureLabel: (pressure) => `pressure:${pressure}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
  });
  assert(
    message.startsWith(
      't:agent.command.trace.hotspotsTitle:{"count":1}\n' +
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":"warn-only"}\n',
    ) &&
      message.includes('t:agent.command.trace.riskProfile:{"risks":"risk:high_risk=1"}') &&
      message.includes("t:agent.command.trace.riskProfileMatrix:") &&
      message.includes('t:agent.command.trace.summaryFailureClasses:{"details":"failure:runtime=1"}') &&
      message.includes('t:agent.command.trace.summaryBudgetGuards:{"count":"n1"}') &&
      message.includes("t:agent.command.trace.hotspotsQueuePriority:") &&
      message.includes('t:agent.command.trace.hotspotLine:{"index":1,"tool":"shell"'),
    "trace hotspots message runtime should compose deterministic meta and hotspot lines",
  );
  assert(
    message.includes('"pressure":"pressure:') &&
      message.includes(
        't:agent.command.trace.hotspotsHint:{"command":"/trace summary failure tool=shell runs=6 risk=high_risk reversibility=hard_to_reverse blast=shared"}',
      ),
    "trace hotspots message runtime should wire queue pressure and deterministic scoped hint command",
  );
  const hotspotLineIndex = message.indexOf('t:agent.command.trace.hotspotLine:{"index":1,"tool":"shell"');
  const hintLineIndex = message.indexOf("t:agent.command.trace.hotspotsHint:");
  assert(
    hotspotLineIndex >= 0 && hintLineIndex > hotspotLineIndex,
    "trace hotspots message runtime should render hint line after hotspot lines",
  );

  const emptyMessage = deriveTraceHotspotsMessage({
    visibleEvents: [],
    limit: 8,
    queueLimit: 8,
    filterLabel: "all",
    warningLabel: "warn-only",
    runWindow: "all",
    riskFilter: "all",
    reversibilityFilter: "all",
    blastRadiusFilter: "all",
    t: (key, vars) => `t:${key}:${JSON.stringify(vars ?? {})}`,
    formatNumber: (value) => `n${value}`,
    formatFailureClassLabel: (failureClass) => `failure:${failureClass}`,
    formatPermissionRiskLabel: (risk) => `risk:${risk}`,
    formatQueuePressureLabel: (pressure) => `pressure:${pressure}`,
    nowLabel: "NOW",
    nextLabel: "NEXT",
    laterLabel: "LATER",
  });
  assert(
    emptyMessage ===
      't:agent.command.trace.hotspotsTitle:{"count":0}\n' +
        't:agent.command.trace.appliedFilter:{"filter":"all","warnings":"warn-only"}\n' +
        "t:agent.command.trace.hotspotsEmpty:{}",
    "trace hotspots message runtime should preserve deterministic empty branch",
  );
}

async function verifyQueueOpsSummary(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/queue ops summary");
  assert(parsed, "parseSlashCommand should parse /queue ops summary");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "queue ops summary should not return error");

  const title = translate(locale, "agent.command.queue.opsTitle", { count: 1 });
  const summaryWindow = translate(locale, "agent.command.queue.opsSummaryWindow", {
    count: 1,
    pressure: translate(locale, "agent.trace.queuePressure.busy"),
    latest: 2,
    max: 2,
    limit: 8,
  });
  const actionSummary = translate(locale, "agent.command.queue.opsSummaryActions", {
    queued: 1,
    dequeued: 0,
    rejected: 0,
  });
  const reasonSummary = translate(locale, "agent.command.queue.opsSummaryReasons", {
    capacity: 0,
    stale: 0,
    manual: 0,
    deduplicated: 0,
    none: 1,
  });
  const prioritySummary = translate(locale, "agent.command.queue.opsSummaryPriorities", {
    now: 0,
    next: 0,
    later: 1,
    none: 0,
  });

  assert(result.message.includes(title), "queue ops summary should include title");
  assert(result.message.includes(summaryWindow), "queue ops summary should include pressure window line");
  assert(result.message.includes(actionSummary), "queue ops summary should include action stats");
  assert(result.message.includes(reasonSummary), "queue ops summary should include reason stats");
  assert(result.message.includes(prioritySummary), "queue ops summary should include priority stats");
}

async function verifyQueueOpsInvalidFilter(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/queue ops action=bogus");
  assert(parsed, "parseSlashCommand should parse /queue ops with invalid filter");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(result.error, "queue ops invalid filter should return error");
  assert(
    result.message.includes(translate(locale, "agent.command.queue.opsInvalidFilter")),
    "queue ops invalid filter should return guidance message",
  );
}

async function verifyQueueHeal(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const now = Date.now();
  const queuedQueries: QueuedQueryItem[] = [
    {
      id: "q-now",
      query:
        "/doctor queue investigate thread=thread-demo pressure=congested queue_limit=8 latest_depth=7 max_depth=8 queued_count=12",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 30_000,
      commandId: "cmd-q-now",
      commandLabel: "/doctor queue investigate",
      priority: "now",
    },
    {
      id: "q-dup",
      query:
        "/doctor queue investigate thread=thread-demo pressure=busy queue_limit=8 latest_depth=6 max_depth=7 queued_count=10",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 20_000,
      commandId: "cmd-q-dup",
      commandLabel: "/doctor queue investigate",
      priority: "next",
    },
    {
      id: "q-stale",
      query: "/trace hotspots failure runs=6",
      model: "demo-model",
      permissionMode: "default",
      queuedAt: now - 11 * 60_000,
      commandId: "cmd-q-stale",
      commandLabel: "/trace hotspots",
      priority: "later",
    },
  ];
  const parsed = parseSlashCommand("/queue heal");
  assert(parsed, "parseSlashCommand should parse /queue heal");

  const result = await registry.execute(parsed, createContext(locale, buildEvents(), { queuedQueries }));
  assert(!result.error, "queue heal should not return error");

  const summary = translate(locale, "agent.command.queue.healSummary", { before: 3, after: 1 });
  const staleLine = translate(locale, "agent.command.queue.healStaleRemoved", { count: 1, minutes: 10 });
  const duplicateLine = translate(locale, "agent.command.queue.healDuplicateRemoved", { removed: 1, groups: 1 });
  const nextStep = translate(locale, "agent.command.queue.healNextStep");

  assert(result.message.includes(summary), "queue heal should include summary line");
  assert(result.message.includes(staleLine), "queue heal should include stale removal line");
  assert(result.message.includes(duplicateLine), "queue heal should include duplicate removal line");
  assert(result.message.includes(nextStep), "queue heal should include next-step guidance");
}

async function verifyDoctorQueueInvestigateAutoDerive(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/doctor queue investigate");
  assert(parsed, "parseSlashCommand should parse /doctor queue investigate");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "doctor queue investigate should not return error");

  const title = translate(locale, "agent.command.doctor.queueInvestigateTitle");
  const scope = translate(locale, "agent.command.doctor.queueInvestigateScope", {
    pressure: translate(locale, "agent.trace.queuePressure.busy"),
    latest: 2,
    max: 2,
    limit: 8,
    queued: 1,
    dequeued: 0,
    rejected: 0,
    deduplicated: 0,
    capacity: 0,
    stale: 0,
    manual: 0,
    dominant: translate(locale, "agent.queue.priority.later"),
  });
  const diagnosisHeader = translate(locale, "agent.command.doctor.queueInvestigateDiagnosisHeader");
  const fixHealIfNeeded = translate(locale, "agent.command.doctor.queueInvestigateFixHealIfNeeded");
  const verifyHeader = translate(locale, "agent.command.doctor.queueInvestigateVerifyHeader");

  assert(result.message.includes(title), "doctor queue investigate should include title");
  assert(result.message.includes(scope), "doctor queue investigate should include derived scope line");
  assert(result.message.includes(diagnosisHeader), "doctor queue investigate should include diagnosis header");
  assert(result.message.includes(fixHealIfNeeded), "doctor queue investigate should include queue-heal fix guidance");
  assert(result.message.includes(verifyHeader), "doctor queue investigate should include verify header");
}

async function verifyStatusIncludesQueuePriority(locale: AppLocale) {
  const registry = createDefaultCommandRegistry();
  const events = buildEvents();
  const parsed = parseSlashCommand("/status");
  assert(parsed, "parseSlashCommand should parse /status");

  const result = await registry.execute(parsed, createContext(locale, events));
  assert(!result.error, "status command should not return error");

  const queuePriorityLine = translate(locale, "agent.command.status.queuePriority", {
    nowLabel: translate(locale, "agent.queue.priority.now"),
    now: 0,
    nextLabel: translate(locale, "agent.queue.priority.next"),
    next: 0,
    laterLabel: translate(locale, "agent.queue.priority.later"),
    later: 0,
  });
  const queuePressureLine = translate(locale, "agent.command.status.queuePressure", {
    pressure: translate(locale, "agent.trace.queuePressure.idle"),
  });
  const recoveryQueueLine = translate(locale, "agent.command.status.recoveryQueue", {
    count: 0,
    id: translate(locale, "agent.command.notSet"),
  });
  const recoveryPlanLine = translate(locale, "agent.command.status.recoveryPlan", {
    plan: translate(locale, "agent.command.recover.plan.none"),
  });
  assert(
    result.message.includes(queuePriorityLine),
    "status output should include queue priority breakdown",
  );
  assert(
    result.message.includes(queuePressureLine),
    "status output should include queue pressure label",
  );
  assert(
    result.message.includes(recoveryQueueLine),
    "status output should include recovery queue snapshot",
  );
  assert(
    result.message.includes(recoveryPlanLine),
    "status output should include recovery plan line",
  );
}

function verifyDoctorRecommendationPolicyDeterministic(): void {
  const input: DoctorRecommendationEntry[] = [
    { id: "inspectTasks", text: "inspect tasks" },
    { id: "recoverInvestigate", text: "recover investigate" },
    { id: "recoverPlan", text: "recover plan" },
    { id: "recoverPlan", text: "recover plan duplicate should be removed" },
    { id: "queueHeal", text: "queue heal" },
    { id: "queueInvestigate", text: "queue investigate" },
    { id: "reduceHighRiskApprovals", text: "high-risk approvals" },
  ];
  const ranked = prioritizeDoctorRecommendationEntries(input);
  assertArrayEquals(
    ranked.map((item) => item.id),
    [
      "recoverPlan",
      "queueHeal",
      "recoverInvestigate",
      "queueInvestigate",
      "inspectTasks",
      "reduceHighRiskApprovals",
    ],
    "doctor recommendation policy should be deterministic by id rank and deduplicate repeated ids",
  );
}

function verifyDiagnosisRecommendationTieBreakDeterministic(): void {
  const rows = [
    { id: "hotspot", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "fallback", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "recover_queueHeal", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "recover_recoverPlan", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "queue", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "zzz_custom", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
    { id: "aaa_custom", priorityScore: 20, matrixScore: 7, trendWeight: 2 },
  ];
  rows.sort(compareDiagnosisRecommendationPriority);
  assertArrayEquals(
    rows.map((item) => item.id),
    [
      "recover_recoverPlan",
      "recover_queueHeal",
      "queue",
      "hotspot",
      "fallback",
      "aaa_custom",
      "zzz_custom",
    ],
    "diagnosis recommendation tie-break should prefer known rank and fallback to lexical id ordering",
  );
}

function verifyDiagnosisRecommendationScorePolicyDeterministic(): void {
  const highestMatrix = deriveDiagnosisMatrixScore("hard_to_reverse", "shared");
  const mediumMatrix = deriveDiagnosisMatrixScore("mixed", "workspace");
  const lowestMatrix = deriveDiagnosisMatrixScore("reversible", "local");
  assert(highestMatrix === 6, "diagnosis matrix score should be 6 for hard_to_reverse + shared");
  assert(mediumMatrix === 4, "diagnosis matrix score should be 4 for mixed + workspace");
  assert(lowestMatrix === 2, "diagnosis matrix score should be 2 for reversible + local");

  const highPriority = deriveDiagnosisPriorityScore("high", highestMatrix, 2);
  const mediumPriority = deriveDiagnosisPriorityScore("medium", highestMatrix, 2);
  const lowPriority = deriveDiagnosisPriorityScore("low", highestMatrix, 2);
  assert(
    highPriority > mediumPriority && mediumPriority > lowPriority,
    "diagnosis priority score should rank high > medium > low under same matrix/trend",
  );

  const score = deriveDiagnosisRecommendationScore({
    severity: "high",
    reversibility: "mixed",
    blastRadius: "workspace",
    trendWeight: 1,
  });
  assert(
    score.matrixScore === mediumMatrix,
    "diagnosis recommendation score should reuse shared matrix scoring policy",
  );
  assert(
    score.priorityScore === deriveDiagnosisPriorityScore("high", mediumMatrix, 1),
    "diagnosis recommendation score should reuse shared priority scoring policy",
  );

  const blueprint = buildDiagnosisRecommendationBlueprint({
    id: "queue",
    label: "Queue diagnostics",
    reason: "Queue pressure is high",
    severity: "high",
    reversibility: "reversible",
    blastRadius: "local",
    trendWeight: 1,
    command: "/trace queue diagnostics",
  });
  assert(
    blueprint.matrixScore === deriveDiagnosisMatrixScore("reversible", "local"),
    "diagnosis recommendation blueprint should include shared matrix score",
  );
  assert(
    blueprint.priorityScore ===
      deriveDiagnosisPriorityScore("high", deriveDiagnosisMatrixScore("reversible", "local"), 1),
    "diagnosis recommendation blueprint should include shared priority score",
  );
  assert(
    blueprint.canRun,
    "diagnosis recommendation blueprint should default canRun=true when command is present",
  );
}

function verifyDiagnosisRecommendationTriggerPolicyDeterministic(): void {
  assert(
    shouldRecommendQueueDiagnosisByPressure("busy"),
    "queue diagnosis should be recommended when pressure is busy",
  );
  assert(
    shouldRecommendQueueDiagnosisByPressure("congested"),
    "queue diagnosis should be recommended when pressure is congested",
  );
  assert(
    shouldRecommendQueueDiagnosisByPressure("saturated"),
    "queue diagnosis should be recommended when pressure is saturated",
  );
  assert(
    !shouldRecommendQueueDiagnosisByPressure("idle"),
    "queue diagnosis should not be recommended when pressure is idle",
  );
  assert(
    deriveQueueDiagnosisRecommendationSeverity("busy") === "medium",
    "queue diagnosis severity should be medium when pressure is busy",
  );
  assert(
    deriveQueueDiagnosisRecommendationSeverity("congested") === "high" &&
      deriveQueueDiagnosisRecommendationSeverity("saturated") === "high",
    "queue diagnosis severity should be high when pressure is congested/saturated",
  );

  const failedStatuses = new Set(["failed", "aborted", "queue_full"]);
  const history = [
    { kind: "queue_diagnostics", status: "failed", command: "/trace queue tool=shell", at: 30 },
    { kind: "queue_diagnostics", status: "failed", command: "/trace queue tool=shell", at: 20 },
    { kind: "queue_diagnostics", status: "completed", command: "/trace queue tool=shell", at: 10 },
  ];
  const persistentFailureTrend = deriveDiagnosisTrendWeight({
    history,
    kind: "queue_diagnostics",
    command: "/trace queue tool=shell",
    failedStatuses,
    maxWindow: 3,
  });
  assert(
    persistentFailureTrend === 2,
    "diagnosis trend weight should be 2 for repeated adjacent failures",
  );

  const recoveringTrend = deriveDiagnosisTrendWeight({
    history: [
      { kind: "queue_diagnostics", status: "completed", command: "/trace queue tool=shell", at: 30 },
      { kind: "queue_diagnostics", status: "failed", command: "/trace queue tool=shell", at: 20 },
    ],
    kind: "queue_diagnostics",
    command: "/trace queue tool=shell",
    failedStatuses,
    maxWindow: 3,
  });
  assert(
    recoveringTrend === -1,
    "diagnosis trend weight should be -1 when the latest run recovers from previous failure",
  );

  assert(
    deriveHotspotDiagnosisRecommendationSeverity({ errors: 1, denied: 0 }) === "high" &&
      deriveHotspotDiagnosisRecommendationSeverity({ errors: 0, denied: 1 }) === "high" &&
      deriveHotspotDiagnosisRecommendationSeverity({ errors: 0, denied: 0 }) === "medium",
    "hotspot recommendation severity should escalate when errors/denied are present",
  );
  assert(
    deriveFallbackDiagnosisRecommendationSeverity({ suppressionRatioPct: 80 }) === "high" &&
      deriveFallbackDiagnosisRecommendationSeverity({ suppressionRatioPct: 20 }) === "medium",
    "fallback recommendation severity should follow suppression ratio threshold",
  );

  const replaySummaryRisk = deriveReplayFailedRecommendationRiskProfile({
    kind: "summary",
    dominantReversibility: "hard_to_reverse",
    dominantBlastRadius: "shared",
  });
  assert(
    replaySummaryRisk.reversibility === "reversible" && replaySummaryRisk.blastRadius === "local",
    "replay-failed risk profile should downgrade summary replay to reversible/local",
  );
  const replayInvestigateRisk = deriveReplayFailedRecommendationRiskProfile({
    kind: "investigate",
    dominantReversibility: "mixed",
    dominantBlastRadius: "workspace",
  });
  assert(
    replayInvestigateRisk.reversibility === "mixed" && replayInvestigateRisk.blastRadius === "workspace",
    "replay-failed risk profile should preserve dominant risk profile for non-summary kinds",
  );

  const queueHealTrend = deriveRecoverRecommendationTrendWeight({
    recommendation: "queueHeal",
    queueInvestigateTrendWeight: 2,
    recoverFailureTotal: 0,
    recoverHasFailureSignals: false,
  });
  const queueInvestigateTrend = deriveRecoverRecommendationTrendWeight({
    recommendation: "queueInvestigate",
    queueInvestigateTrendWeight: 2,
    recoverFailureTotal: 0,
    recoverHasFailureSignals: false,
  });
  const strictTrend = deriveRecoverRecommendationTrendWeight({
    recommendation: "recoverExecuteStrict",
    queueInvestigateTrendWeight: 0,
    recoverFailureTotal: 3,
    recoverHasFailureSignals: true,
  });
  const defaultRecoverTrend = deriveRecoverRecommendationTrendWeight({
    recommendation: "recoverPlan",
    queueInvestigateTrendWeight: 0,
    recoverFailureTotal: 3,
    recoverHasFailureSignals: true,
  });
  assert(queueHealTrend === 1, "recover trend policy should give queue-heal fixed trend boost");
  assert(
    queueInvestigateTrend === 2,
    "recover trend policy should pass through queue-investigate trend signal",
  );
  assert(
    strictTrend === 2,
    "recover trend policy should cap strict trend at 2 under high failures",
  );
  assert(
    defaultRecoverTrend === 2,
    "recover trend policy should escalate default recover recommendations under failure signals",
  );
}

function verifyDiagnosisRecommendationRuntimeBlueprintDeterministic(): void {
  const queueBusy = buildQueueDiagnosisRecommendationBlueprint({
    pressure: "busy",
    label: "Queue",
    reason: "Busy queue",
    command: "/trace queue",
    trendWeight: 1,
  });
  assert(queueBusy && queueBusy.id === "queue", "runtime queue builder should create queue blueprint when pressure is busy");
  const queueIdle = buildQueueDiagnosisRecommendationBlueprint({
    pressure: "idle",
    label: "Queue",
    reason: "Idle queue",
    command: "/trace queue",
    trendWeight: 1,
  });
  assert(queueIdle === null, "runtime queue builder should skip queue blueprint when pressure is idle");

  const hotspot = buildHotspotDiagnosisRecommendationBlueprint({
    label: "Hotspot",
    reason: "Tool hotspot",
    command: "/doctor queue investigate tool=shell",
    trendWeight: 2,
    errors: 1,
    denied: 0,
    reversibility: "mixed",
    blastRadius: "workspace",
  });
  assert(
    hotspot.id === "hotspot" && hotspot.severity === "high",
    "runtime hotspot builder should emit hotspot id with escalated severity",
  );

  const fallback = buildFallbackDiagnosisRecommendationBlueprint({
    label: "Fallback",
    reason: "Fallback suppression",
    command: "/doctor fallback investigate",
    trendWeight: 1,
    suppressionRatioPct: 80,
    reversibility: "mixed",
    blastRadius: "workspace",
  });
  assert(
    fallback.id === "fallback" && fallback.severity === "high",
    "runtime fallback builder should emit fallback id with high severity for high suppression ratio",
  );

  const replay = buildReplayFailedDiagnosisRecommendationBlueprint({
    kind: "summary",
    label: "Replay",
    reason: "Replay last failed command",
    command: "/trace summary",
    trendWeight: 1,
    dominantReversibility: "hard_to_reverse",
    dominantBlastRadius: "shared",
  });
  assert(
    replay.id === "replay_failed" &&
      replay.reversibility === "reversible" &&
      replay.blastRadius === "local",
    "runtime replay builder should downgrade summary replay risk profile",
  );

  const recover = buildRecoverDiagnosisRecommendationBlueprint({
    recommendation: "recoverExecuteStrict",
    label: "Recover strict",
    reason: "Failure signals present",
    severity: "high",
    command: "/recover execute --strict",
    queueInvestigateTrendWeight: 0,
    recoverFailureTotal: 2,
    recoverHasFailureSignals: true,
  });
  assert(
    recover.id === "recover_recoverExecuteStrict" && recover.trendWeight === 2,
    "runtime recover builder should emit recover id and strict trend weight policy",
  );
}

function verifyDoctorRecommendationRuntimeDeterministic(): void {
  assertArrayEquals(
    deriveDoctorFallbackRecommendationIds("retry_strategy"),
    ["relieveQueueForFallback"],
    "doctor fallback runtime should map retry_strategy to relieveQueueForFallback",
  );
  assertArrayEquals(
    deriveDoctorFallbackRecommendationIds("fallback_missing"),
    ["configureFallbackModel"],
    "doctor fallback runtime should map fallback_missing to configureFallbackModel",
  );
  assertArrayEquals(
    deriveDoctorFallbackRecommendationIds("gate_disabled"),
    ["enableFallbackGate"],
    "doctor fallback runtime should map gate_disabled to enableFallbackGate",
  );

  const toolFailureRecommendations = deriveDoctorToolFailureRecommendationIds({
    permission: 1,
    workspace: 1,
    timeout: 1,
    not_found: 1,
    network: 1,
    validation: 1,
    runtime: 1,
  });
  assertArrayEquals(
    toolFailureRecommendations,
    [
      "fixPermissionRuleForTools",
      "fixWorkspaceBoundaryFailures",
      "reduceToolTimeoutPressure",
      "checkNetworkAndEndpoint",
      "investigateMissingResources",
      "validateToolInputShape",
      "inspectToolRuntimeErrors",
    ],
    "doctor tool-failure runtime should preserve stable recommendation ordering",
  );

  assertArrayEquals(
    deriveDoctorBudgetRecommendationIds({
      perToolLimit: 1,
      failureBackoff: 1,
    }),
    ["tuneToolBudgetPolicy", "waitForFailureBackoffRecovery"],
    "doctor budget runtime should map guard stats to stable recommendations",
  );

  assert(
    shouldRecommendDoctorRelieveQueue(6, 8) && !shouldRecommendDoctorRelieveQueue(5, 8),
    "doctor queue runtime should trigger relieveQueue at >=75% queue usage",
  );
  assert(
    shouldRecommendDoctorAvoidDuplicateQueueSubmissions(3) &&
      !shouldRecommendDoctorAvoidDuplicateQueueSubmissions(2),
    "doctor queue dedup runtime should trigger at deduplicated count >=3",
  );
  assert(
    shouldRecommendDoctorInspectTasks(1) && !shouldRecommendDoctorInspectTasks(0),
    "doctor task runtime should trigger inspectTasks only when running tasks exist",
  );

  assertArrayEquals(
    deriveDoctorPermissionRecommendationIds({
      critical: 1,
      high_risk: 0,
      path_outside: 1,
      reversibilityHardToReverse: 1,
      blastShared: 0,
    }),
    [
      "reduceHighRiskApprovals",
      "keepWorkspaceBoundaries",
      "explicitConfirmationForIrreversible",
    ],
    "doctor permission runtime should map risk counters to stable recommendations",
  );
}

function verifyDoctorEnvironmentRuntimeDeterministic(): void {
  const apiReadyLine = deriveDoctorApiStateLine("claude-opus-4.6");
  const apiMissingLine = deriveDoctorApiStateLine(undefined);
  assert(
    apiReadyLine.level === "ok" &&
      apiReadyLine.key === "agent.command.doctor.apiReady" &&
      apiReadyLine.vars?.model === "claude-opus-4.6",
    "doctor environment runtime should map current model to apiReady line",
  );
  assert(
    apiMissingLine.level === "ok" && apiMissingLine.key === "agent.command.doctor.apiMissing",
    "doctor environment runtime should map missing model to apiMissing line",
  );

  const workspaceMissing = deriveDoctorWorkspaceMissing();
  assert(
    workspaceMissing.line.level === "warn" &&
      workspaceMissing.line.key === "agent.command.doctor.workspaceMissing",
    "doctor environment runtime should classify missing workspace as warn line",
  );
  assertArrayEquals(
    workspaceMissing.recommendationIds,
    ["selectWorkspace"],
    "doctor environment runtime should recommend selectWorkspace when workspace is missing",
  );

  const workspaceOk = deriveDoctorWorkspaceOk("C:/repo/demo", "123");
  assert(
    workspaceOk.line.level === "ok" &&
      workspaceOk.line.key === "agent.command.doctor.workspaceOk" &&
      workspaceOk.line.vars?.workspace === "C:/repo/demo" &&
      workspaceOk.line.vars?.count === "123",
    "doctor environment runtime should map workspace probe success to workspaceOk line with formatted count",
  );
  assertArrayEquals(
    workspaceOk.recommendationIds,
    [],
    "doctor environment runtime should not emit workspace recommendations on workspace success",
  );

  const workspaceFail = deriveDoctorWorkspaceFail("C:/repo/demo", "permission denied");
  assert(
    workspaceFail.line.level === "fail" &&
      workspaceFail.line.key === "agent.command.doctor.workspaceFail" &&
      workspaceFail.line.vars?.workspace === "C:/repo/demo" &&
      workspaceFail.line.vars?.error === "permission denied",
    "doctor environment runtime should classify workspace probe failure as fail line",
  );
  assertArrayEquals(
    workspaceFail.recommendationIds,
    [],
    "doctor environment runtime should not emit workspace recommendations on workspace failure",
  );

  const gitOk = deriveDoctorGitLineFromSnapshot({
    workspace: "C:/repo/demo",
    snapshot: {
      is_git_repo: true,
      branch: "feature/codex",
      default_branch: "main",
    },
    unknownLabel: "unknown",
  });
  assert(
    gitOk.hasGitRepo &&
      gitOk.line.level === "ok" &&
      gitOk.line.key === "agent.command.doctor.gitOk" &&
      gitOk.line.vars?.branch === "feature/codex" &&
      gitOk.line.vars?.base === "main",
    "doctor environment runtime should map git snapshot success to gitOk line",
  );
  assertArrayEquals(
    gitOk.recommendationIds,
    [],
    "doctor environment runtime should not emit recommendations for healthy git snapshot",
  );

  const gitMissing = deriveDoctorGitLineFromSnapshot({
    workspace: "C:/repo/demo",
    snapshot: {
      is_git_repo: false,
    },
    unknownLabel: "unknown",
  });
  assert(
    !gitMissing.hasGitRepo &&
      gitMissing.line.level === "warn" &&
      gitMissing.line.key === "agent.command.doctor.gitMissing" &&
      gitMissing.line.vars?.workspace === "C:/repo/demo",
    "doctor environment runtime should map non-git workspace to gitMissing warn line",
  );
  assertArrayEquals(
    gitMissing.recommendationIds,
    ["initGit"],
    "doctor environment runtime should recommend initGit when workspace is not a git repo",
  );

  const gitFail = deriveDoctorGitLineFromError("snapshot timeout");
  assert(
    gitFail.line.level === "warn" &&
      gitFail.line.key === "agent.command.doctor.gitFail" &&
      gitFail.line.vars?.error === "snapshot timeout",
    "doctor environment runtime should map git snapshot error to gitFail warn line",
  );
  assertArrayEquals(
    gitFail.recommendationIds,
    ["checkGit"],
    "doctor environment runtime should recommend checkGit on git snapshot error",
  );
}

function verifyDoctorRecommendationTextRuntimeDeterministic(locale: AppLocale): void {
  const recommendationIds = Object.keys(
    DOCTOR_RECOMMENDATION_TEXT_DESCRIPTOR_MAP,
  ) as DoctorRecommendationId[];
  assert(
    recommendationIds.length > 0,
    "doctor recommendation text runtime should expose at least one recommendation descriptor",
  );

  for (const recommendationId of recommendationIds) {
    const descriptor = getDoctorRecommendationTextDescriptor(recommendationId);
    assert(
      descriptor.key.startsWith("agent.command.doctor.recommend."),
      `doctor recommendation text runtime should use doctor recommend namespace: ${recommendationId}`,
    );
    const vars = getDoctorRecommendationTextVars(recommendationId, {
      workspace: "C:/repo/demo",
      fallbackWorkspace: "N/A",
    });
    if (recommendationId === "initGit") {
      assert(
        vars?.workspace === "C:/repo/demo",
        "doctor recommendation text runtime should inject explicit workspace for initGit recommendation",
      );
    } else {
      assert(
        vars === undefined,
        `doctor recommendation text runtime should not inject vars for non-initGit recommendation: ${recommendationId}`,
      );
    }
    const rendered = translate(locale, descriptor.key, vars);
    assert(
      rendered !== descriptor.key,
      `doctor recommendation text runtime should resolve translation key: ${descriptor.key}`,
    );
  }

  const fallbackVars = getDoctorRecommendationTextVars("initGit", {
    workspace: null,
    fallbackWorkspace: "C:/repo/fallback",
  });
  assert(
    fallbackVars?.workspace === "C:/repo/fallback",
    "doctor recommendation text runtime should fallback workspace var for initGit when explicit workspace is absent",
  );
}

function verifyDoctorPromptRuntimeDeterministic(): void {
  const missingLines = deriveDoctorPromptSectionLineDescriptors({
    lastPromptCompiled: null,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    missingLines.map((line) => line.key),
    ["agent.command.doctor.promptStatsMissing"],
    "doctor prompt runtime should emit promptStatsMissing warning when prompt_compiled event is absent",
  );
  assert(
    missingLines[0]?.level === "warn",
    "doctor prompt runtime should mark missing prompt stats as warn line",
  );

  const sectionMetadata = [
    { id: "intro", kind: "static", owner: "core", mutable: false },
    { id: "cyber-risk", kind: "static", owner: "safeguards", mutable: false, modelLaunchTag: "capybara-v8" },
    { id: "env", kind: "dynamic", owner: "runtime", mutable: true },
  ] as const;
  const governance = summarizeDoctorPromptGovernance([...sectionMetadata]);
  assert(
    governance.ownerCounts.core === 1 &&
      governance.ownerCounts.safeguards === 1 &&
      governance.ownerCounts.runtime === 1 &&
      governance.immutableCount === 2 &&
      governance.modelLaunchCount === 1,
    "doctor prompt runtime should summarize prompt governance counters deterministically",
  );

  const promptLines = deriveDoctorPromptSectionLineDescriptors({
    lastPromptCompiled: {
      type: "prompt_compiled",
      staticSections: 7,
      dynamicSections: 4,
      staticChars: 2100,
      dynamicChars: 640,
      totalChars: 2740,
      staticHash: "static-demo-hash",
      dynamicHash: "dynamic-demo-hash",
      modelLaunchTags: ["capybara-v8", "prompt-governance"],
      sectionMetadata: [...sectionMetadata],
      at: Date.now(),
    },
    formatNumber: (value) => `#${value}`,
  });
  assertArrayEquals(
    promptLines.map((line) => line.key),
    [
      "agent.command.doctor.promptStats",
      "agent.command.doctor.promptHashes",
      "agent.command.doctor.promptTags",
      "agent.command.doctor.promptGovernance",
    ],
    "doctor prompt runtime should emit prompt section lines in deterministic order",
  );
  assert(
    promptLines.every((line) => line.level === "ok"),
    "doctor prompt runtime should classify emitted prompt section lines as ok",
  );
  assert(
    promptLines[0]?.vars?.staticSections === "#7" &&
      promptLines[0]?.vars?.totalChars === "#2740",
    "doctor prompt runtime should use provided number formatter for prompt stats vars",
  );
  assert(
    promptLines[2]?.vars?.tags === "capybara-v8, prompt-governance",
    "doctor prompt runtime should join model launch tags with comma-space",
  );
  assert(
    promptLines[3]?.vars?.core === "#1" &&
      promptLines[3]?.vars?.immutable === "#2" &&
      promptLines[3]?.vars?.launch === "#1",
    "doctor prompt runtime should emit governance vars from summarized metadata",
  );
}

function verifyDoctorOperationalSectionRuntimeDeterministic(): void {
  const stressed = deriveDoctorOperationalSectionRuntime({
    usage: {
      totalTokensLabel: "165",
      modelCountLabel: "1",
    },
    queryProfile: {
      laneLabel: "Foreground",
      retriesLabel: "2",
      fallbackLabel: "On",
      strategyLabel: "queue_pressure",
    },
    fallback: {
      used: 1,
      suppressed: 4,
      usedLabel: "1",
      suppressedLabel: "4",
      suppressionWarnThresholdPct: 50,
      latestSuppressed: {
        countLabel: "4",
        reasonLabel: "retry_strategy",
        strategyLabel: "background_load_shed",
        reasonId: "retry_strategy",
      },
      formatNumber: (value) => String(value),
    },
    tooling: {
      toolFailure: {
        total: 2,
        detailsLabel: "permission=1 timeout=1",
        counts: {
          permission: 1,
          workspace: 0,
          timeout: 1,
          not_found: 0,
          network: 0,
          validation: 0,
          runtime: 0,
        },
      },
      budgetGuard: {
        total: 3,
        perToolLimit: 1,
        perToolLimitLabel: "1",
        failureBackoff: 2,
        failureBackoffLabel: "2",
        dominantLabel: "failure_backoff",
      },
    },
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.usageStats",
      "agent.command.doctor.queryProfile",
      "agent.command.doctor.fallbackActivity",
      "agent.command.doctor.fallbackSuppressedRatio",
      "agent.command.doctor.fallbackSuppressed",
      "agent.command.doctor.toolFailureSummary",
      "agent.command.doctor.toolBudgetGuardSummary",
    ],
    "doctor operational runtime should emit query/fallback/tooling lines in deterministic order",
  );
  assertArrayEquals(
    stressed.recommendationIds,
    [
      "relieveQueueForFallback",
      "fixPermissionRuleForTools",
      "reduceToolTimeoutPressure",
      "tuneToolBudgetPolicy",
      "waitForFailureBackoffRecovery",
    ],
    "doctor operational runtime should emit deterministic recommendation sequence across fallback/tooling domains",
  );
  assert(
    stressed.lines[3]?.level === "warn" &&
      stressed.lines[4]?.level === "warn" &&
      stressed.lines[5]?.level === "warn" &&
      stressed.lines[6]?.level === "warn",
    "doctor operational runtime should elevate suppression/tooling lines to warn under stressed inputs",
  );

  const quiet = deriveDoctorOperationalSectionRuntime({
    usage: {
      totalTokensLabel: "0",
      modelCountLabel: "0",
    },
    queryProfile: null,
    fallback: {
      used: 0,
      suppressed: 0,
      usedLabel: "0",
      suppressedLabel: "0",
      suppressionWarnThresholdPct: 50,
      latestSuppressed: null,
      formatNumber: (value) => String(value),
    },
    tooling: {
      toolFailure: {
        total: 0,
        detailsLabel: "-",
        counts: {
          permission: 0,
          workspace: 0,
          timeout: 0,
          not_found: 0,
          network: 0,
          validation: 0,
          runtime: 0,
        },
      },
      budgetGuard: {
        total: 0,
        perToolLimit: 0,
        perToolLimitLabel: "0",
        failureBackoff: 0,
        failureBackoffLabel: "0",
        dominantLabel: "not-set",
      },
    },
  });
  assertArrayEquals(
    quiet.lines.map((line) => line.key),
    [
      "agent.command.doctor.usageStats",
      "agent.command.doctor.toolFailureSummary",
      "agent.command.doctor.toolBudgetGuardSummary",
    ],
    "doctor operational runtime should skip optional query/fallback lines in quiet mode",
  );
  assert(
    quiet.lines.every((line) => line.level === "ok"),
    "doctor operational runtime should keep lines at ok level in quiet mode",
  );
  assertArrayEquals(
    quiet.recommendationIds,
    [],
    "doctor operational runtime should not emit fallback/tooling recommendations in quiet mode",
  );
}

function verifyDoctorQueueSectionRuntimeDeterministic(): void {
  const stressed = deriveDoctorQueueSectionRuntime({
    queueCount: 8,
    queueLimit: 8,
    queueDeduplicatedCount: 3,
    runningTaskCount: 2,
    totalTaskCount: 5,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.queueFull",
      "agent.command.doctor.queueDeduplicated",
      "agent.command.doctor.tasks",
    ],
    "doctor queue runtime should emit queue health, deduplicated, and task lines in deterministic order",
  );
  assert(
    stressed.lines[0]?.level === "warn" &&
      stressed.lines[1]?.level === "warn" &&
      stressed.lines[2]?.level === "ok",
    "doctor queue runtime should classify stressed queue and deduplicated lines as warn",
  );
  assertArrayEquals(
    stressed.recommendationIds,
    ["relieveQueue", "avoidDuplicateQueueSubmissions", "inspectTasks"],
    "doctor queue runtime should emit deterministic queue recommendation sequence under pressure",
  );

  const quiet = deriveDoctorQueueSectionRuntime({
    queueCount: 1,
    queueLimit: 8,
    queueDeduplicatedCount: 0,
    runningTaskCount: 0,
    totalTaskCount: 2,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    quiet.lines.map((line) => line.key),
    [
      "agent.command.doctor.queueHealthy",
      "agent.command.doctor.queueDeduplicated",
      "agent.command.doctor.tasks",
    ],
    "doctor queue runtime should emit healthy queue line when load is low",
  );
  assert(
    quiet.lines.every((line) => line.level === "ok"),
    "doctor queue runtime should keep quiet queue lines at ok level",
  );
  assertArrayEquals(
    quiet.recommendationIds,
    [],
    "doctor queue runtime should not emit queue recommendations in quiet mode",
  );
}

function verifyDoctorRecoverySectionRuntimeDeterministic(): void {
  const healthy = deriveDoctorRecoverySectionRuntime({
    stateKind: "none",
    stateLastMessageId: null,
    interruptionReasonLabel: null,
    notSetLabel: "not-set",
    queueCount: 0,
    queueLimit: 8,
    queueDeduplicatedCount: 0,
    queueRejectedCount: 0,
    failureTotal: 0,
  });
  assertArrayEquals(
    healthy.lines.map((line) => line.key),
    ["agent.command.doctor.recoveryHealthy"],
    "doctor recovery runtime should emit healthy line when no interruption exists",
  );
  assert(
    healthy.lines[0]?.format === "doctor" && healthy.lines[0]?.level === "ok",
    "doctor recovery runtime should format healthy recovery line with doctor prefix",
  );
  assertArrayEquals(
    healthy.recommendations,
    [],
    "doctor recovery runtime should not emit recovery recommendations in healthy mode",
  );

  const interrupted = deriveDoctorRecoverySectionRuntime({
    stateKind: "awaiting_assistant",
    stateLastMessageId: "msg-123",
    interruptionReasonLabel: "awaiting_assistant",
    notSetLabel: "not-set",
    queueCount: 8,
    queueLimit: 8,
    queueDeduplicatedCount: 3,
    queueRejectedCount: 1,
    failureTotal: 2,
  });
  assertArrayEquals(
    interrupted.lines.map((line) => line.key),
    [
      "agent.command.doctor.recoveryInterrupted",
      "agent.command.doctor.recoveryLadderTitle",
      "agent.command.doctor.recoveryLadderPlan",
      "agent.command.doctor.recoveryLadderHeal",
      "agent.command.doctor.recoveryLadderAuto",
      "agent.command.doctor.recoveryLadderStrict",
      "agent.command.doctor.recoveryLadderInvestigate",
    ],
    "doctor recovery runtime should emit deterministic interrupted runbook lines",
  );
  assert(
    interrupted.lines[0]?.format === "doctor" &&
      interrupted.lines[0]?.level === "warn" &&
      interrupted.lines[0]?.vars?.reason === "awaiting_assistant" &&
      interrupted.lines[0]?.vars?.id === "msg-123",
    "doctor recovery runtime should include interruption reason/id on warned recovery line",
  );
  assert(
    interrupted.lines.slice(1).every((line) => line.format === "plain"),
    "doctor recovery runtime should keep runbook ladder lines in plain formatting",
  );
  assertArrayEquals(
    interrupted.recommendations,
    [
      "queueHeal",
      "queueInvestigate",
      "recoverAuto",
      "recoverExecuteStrict",
      "recoverPlan",
      "resumeInterruptedTurn",
      "recoverInvestigate",
    ],
    "doctor recovery runtime should emit deterministic recommendation order under interruption pressure",
  );
}

function verifyDoctorPermissionSectionRuntimeDeterministic(): void {
  const emptyCounters = createEmptyDoctorPermissionRiskCounters();
  assert(
    emptyCounters.critical === 0 &&
      emptyCounters.high_risk === 0 &&
      emptyCounters.path_outside === 0 &&
      emptyCounters.blastShared === 0,
    "doctor permission runtime should initialize empty risk counters at zero",
  );

  const counters = collectDoctorPermissionRiskCounters(buildEvents(1700000000000));
  assert(
    counters.high_risk === 1 &&
      counters.path_outside === 1 &&
      counters.scopeNotices === 1 &&
      counters.reversibilityMixed === 1 &&
      counters.reversibilityHardToReverse === 1 &&
      counters.blastShared === 2,
    "doctor permission runtime should aggregate permission/risk-profile counters deterministically from trace events",
  );

  const stressed = deriveDoctorPermissionSectionRuntime({
    events: buildEvents(1700000000000),
    permissionMode: "default",
    permissionRuleCount: 3,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.permissions",
      "agent.command.doctor.permissionRiskSummary",
      "agent.command.doctor.permissionRiskProfileSummary",
      "agent.command.doctor.permissionRiskHigh",
    ],
    "doctor permission runtime should emit deterministic permission section lines in stressed mode",
  );
  assert(
    stressed.lines[3]?.level === "warn",
    "doctor permission runtime should elevate high-risk summary line to warn when high-risk counters exist",
  );
  assertArrayEquals(
    stressed.recommendationIds,
    ["reduceHighRiskApprovals", "keepWorkspaceBoundaries", "explicitConfirmationForIrreversible"],
    "doctor permission runtime should emit deterministic permission recommendation sequence",
  );

  const quiet = deriveDoctorPermissionSectionRuntime({
    events: [],
    permissionMode: "full_access",
    permissionRuleCount: 0,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    quiet.lines.map((line) => line.key),
    [
      "agent.command.doctor.permissions",
      "agent.command.doctor.permissionRiskSummary",
      "agent.command.doctor.permissionRiskProfileSummary",
    ],
    "doctor permission runtime should omit high-risk warning line in quiet mode",
  );
  assert(
    quiet.lines.every((line) => line.level === "ok"),
    "doctor permission runtime should keep quiet permission lines at ok level",
  );
  assertArrayEquals(
    quiet.recommendationIds,
    [],
    "doctor permission runtime should not emit permission recommendations when counters are zero",
  );
}

function verifyDoctorQueueInvestigateRuntimeDeterministic(): void {
  const stressed = deriveDoctorQueueInvestigateRuntime({
    kv: {
      pressure: "congested",
      queue_limit: "10",
      latest_depth: "7",
      max_depth: "9",
      queued_count: "12",
      dequeued_count: "5",
      rejected_count: "2",
      deduplicated_count: "3",
      capacity_rejections: "1",
      stale_rejections: "0",
      manual_rejections: "1",
      dominant_priority: "now",
    },
    fallback: {
      pressure: "busy",
      queueLimit: 8,
      latestDepth: 2,
      maxDepth: 4,
      queuedCount: 1,
      dequeuedCount: 0,
      rejectedCount: 0,
      deduplicatedCount: 0,
      capacityRejections: 0,
      staleRejections: 0,
      manualRejections: 0,
      dominantPriorityLabel: "later",
    },
    labels: {
      pressureById: {
        idle: "idle",
        busy: "busy",
        congested: "congested",
        saturated: "saturated",
      },
      priorityById: {
        now: "now",
        next: "next",
        later: "later",
      },
    },
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.queueInvestigateTitle",
      "agent.command.doctor.queueInvestigateScope",
      "agent.command.doctor.queueInvestigateAssessmentHigh",
      "agent.command.doctor.queueInvestigateDiagnosisHeader",
      "agent.command.doctor.queueInvestigateDiagnosisQueueOps",
      "agent.command.doctor.queueInvestigateDiagnosisTraceHotspots",
      "agent.command.doctor.queueInvestigateFixHeader",
      "agent.command.doctor.queueInvestigateFixHeal",
      "agent.command.doctor.queueInvestigateFixCompact",
      "agent.command.doctor.queueInvestigateFixPriority",
      "agent.command.doctor.queueInvestigateVerifyHeader",
      "agent.command.doctor.queueInvestigateVerifyStatus",
      "agent.command.doctor.queueInvestigateVerifyQueueOps",
      "agent.command.doctor.queueInvestigateVerifyOutcome",
    ],
    "doctor queue investigate runtime should emit deterministic high-pressure line sequence",
  );
  assert(
    stressed.lines[1]?.vars?.pressure === "congested" &&
      stressed.lines[1]?.vars?.dominant === "now" &&
      stressed.assessmentKey === "agent.command.doctor.queueInvestigateAssessmentHigh" &&
      stressed.fixHealKey === "agent.command.doctor.queueInvestigateFixHeal",
    "doctor queue investigate runtime should apply kv overrides for pressure/dominant and high-pressure healing guidance",
  );

  const quiet = deriveDoctorQueueInvestigateRuntime({
    kv: {},
    fallback: {
      pressure: "busy",
      queueLimit: 8,
      latestDepth: 2,
      maxDepth: 2,
      queuedCount: 1,
      dequeuedCount: 0,
      rejectedCount: 0,
      deduplicatedCount: 0,
      capacityRejections: 0,
      staleRejections: 0,
      manualRejections: 0,
      dominantPriorityLabel: "later",
    },
    labels: {
      pressureById: {
        idle: "idle",
        busy: "busy",
        congested: "congested",
        saturated: "saturated",
      },
      priorityById: {
        now: "now",
        next: "next",
        later: "later",
      },
    },
    formatNumber: (value) => String(value),
  });
  assert(
    quiet.assessmentKey === "agent.command.doctor.queueInvestigateAssessmentNormal" &&
      quiet.fixHealKey === "agent.command.doctor.queueInvestigateFixHealIfNeeded",
    "doctor queue investigate runtime should emit normal assessment and conditional-heal fix guidance in quiet mode",
  );
  assert(
    quiet.lines[1]?.vars?.pressure === "busy" &&
      quiet.lines[1]?.vars?.dominant === "later",
    "doctor queue investigate runtime should preserve fallback pressure/dominant labels when kv overrides are absent",
  );
}

function verifyDoctorFallbackInvestigateRuntimeDeterministic(): void {
  const stressed = deriveDoctorFallbackInvestigateRuntime({
    kv: {
      fallback_suppressed: "4",
      fallback_used: "1",
      retry_events: "9",
      suppression_ratio_pct: "80",
    },
    queuePressure: "idle",
    queuePressureLabel: "idle",
    reasonLabel: "retry_strategy",
    strategyLabel: "background_load_shed",
    suppressionWarnThresholdPct: 50,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.fallbackInvestigateTitle",
      "agent.command.doctor.fallbackInvestigateScope",
      "agent.command.doctor.fallbackInvestigateAssessmentHigh",
      "agent.command.doctor.fallbackInvestigateDiagnosisHeader",
      "agent.command.doctor.fallbackInvestigateDiagnosisTraceSummary",
      "agent.command.doctor.fallbackInvestigateDiagnosisQueueHotspots",
      "agent.command.doctor.fallbackInvestigateFixHeader",
      "agent.command.doctor.fallbackInvestigateFixPolicy",
      "agent.command.doctor.fallbackInvestigateFixQueue",
      "agent.command.doctor.fallbackInvestigateVerifyHeader",
      "agent.command.doctor.fallbackInvestigateVerifyStatus",
      "agent.command.doctor.fallbackInvestigateVerifyDoctor",
      "agent.command.doctor.fallbackInvestigateVerifyOutcome",
    ],
    "doctor fallback investigate runtime should emit deterministic high-risk line sequence",
  );
  assert(
    stressed.fallbackSuppressed === 4 &&
      stressed.fallbackUsed === 1 &&
      stressed.retryEvents === 9 &&
      stressed.suppressionRatioPct === 80 &&
      stressed.assessmentKey === "agent.command.doctor.fallbackInvestigateAssessmentHigh",
    "doctor fallback investigate runtime should parse fallback metrics and mark high assessment when suppression ratio exceeds threshold",
  );
  assert(
    stressed.lines[1]?.vars?.reason === "retry_strategy" &&
      stressed.lines[1]?.vars?.strategy === "background_load_shed" &&
      stressed.lines[1]?.vars?.pressure === "idle",
    "doctor fallback investigate runtime should carry reason/strategy/pressure labels into scope vars",
  );

  const quiet = deriveDoctorFallbackInvestigateRuntime({
    kv: {
      fallback_suppressed: "0",
      fallback_used: "5",
      retry_events: "2",
    },
    queuePressure: "busy",
    queuePressureLabel: "busy",
    reasonLabel: "none",
    strategyLabel: "balanced",
    suppressionWarnThresholdPct: 50,
    formatNumber: (value) => String(value),
  });
  assert(
    quiet.suppressionRatioPct === 0 &&
      quiet.assessmentKey === "agent.command.doctor.fallbackInvestigateAssessmentNormal",
    "doctor fallback investigate runtime should emit normal assessment when suppression ratio stays below threshold",
  );
}

function verifyDoctorRecoverInvestigateRuntimeDeterministic(): void {
  const stats = deriveDoctorRecoverInvestigateStats({
    failure: {
      query_end_aborted: 1,
      query_end_error: 2,
      query_end_max_iterations: 3,
      query_end_stop_hook_prevented: 4,
      lifecycle_failed: 5,
      lifecycle_aborted: 6,
    },
    failureTotal: 21,
    queueRejectedCount: 7,
    queueDeduplicatedCount: 2,
  });
  assert(
    stats.queryEndAborted === 1 &&
      stats.queryEndError === 2 &&
      stats.queryEndMaxIterations === 3 &&
      stats.queryEndStopHookPrevented === 4 &&
      stats.lifecycleFailed === 5 &&
      stats.lifecycleAborted === 6 &&
      stats.queueRejected === 7,
    "doctor recover investigate runtime should derive recover stats deterministically from event signals snapshot",
  );

  const stressed = deriveDoctorRecoverInvestigateRuntime({
    stateKind: "awaiting_assistant",
    stateLabel: "awaiting_assistant",
    messageIdLabel: "msg-123",
    queueCount: 7,
    queueLimit: 8,
    queueDeduplicatedCount: 0,
    queueRejectedCount: 1,
    failureTotal: 3,
    pressureLabel: "congested",
    runningTaskCount: 2,
    stats,
    formatNumber: (value) => String(value),
  });
  assertArrayEquals(
    stressed.lines.map((line) => line.key),
    [
      "agent.command.doctor.recoverInvestigateTitle",
      "agent.command.doctor.recoverInvestigateScope",
      "agent.command.doctor.recoverInvestigateAssessmentHigh",
      "agent.command.doctor.recoverInvestigateDiagnosisHeader",
      "agent.command.doctor.recoverInvestigateDiagnosisRecoverState",
      "agent.command.doctor.recoverInvestigateDiagnosisTraceSummary",
      "agent.command.doctor.recoverInvestigateFixHeader",
      "agent.command.doctor.recoverInvestigateFixResume",
      "agent.command.doctor.recoverInvestigateFixQueueHeal",
      "agent.command.doctor.recoverInvestigateFixExecuteStrict",
      "agent.command.doctor.recoverInvestigateVerifyHeader",
      "agent.command.doctor.recoverInvestigateVerifyRecoverStatus",
      "agent.command.doctor.recoverInvestigateVerifyDoctor",
      "agent.command.doctor.recoverInvestigateVerifyOutcome",
    ],
    "doctor recover investigate runtime should emit deterministic high-pressure line sequence",
  );
  assert(
    stressed.assessmentKey === "agent.command.doctor.recoverInvestigateAssessmentHigh" &&
      stressed.fixResumeKey === "agent.command.doctor.recoverInvestigateFixResume" &&
      stressed.fixQueueHealKey === "agent.command.doctor.recoverInvestigateFixQueueHeal" &&
      stressed.fixExecuteStrictKey === "agent.command.doctor.recoverInvestigateFixExecuteStrict",
    "doctor recover investigate runtime should emit strict/heal/resume fixes for interrupted and pressured state",
  );
  assert(
    stressed.lines[1]?.vars?.state === "awaiting_assistant" &&
      stressed.lines[1]?.vars?.message === "msg-123" &&
      stressed.lines[1]?.vars?.queue === "7" &&
      stressed.lines[1]?.vars?.limit === "8" &&
      stressed.lines[1]?.vars?.pressure === "congested" &&
      stressed.lines[1]?.vars?.running === "2" &&
      stressed.lines[1]?.vars?.rejected === "7",
    "doctor recover investigate runtime should include deterministic scope vars for stressed case",
  );

  const quiet = deriveDoctorRecoverInvestigateRuntime({
    stateKind: "none",
    stateLabel: "none",
    messageIdLabel: "not-set",
    queueCount: 1,
    queueLimit: 8,
    queueDeduplicatedCount: 0,
    queueRejectedCount: 0,
    failureTotal: 0,
    pressureLabel: "busy",
    runningTaskCount: 0,
    stats: {
      queryEndAborted: 0,
      queryEndError: 0,
      queryEndMaxIterations: 0,
      queryEndStopHookPrevented: 0,
      lifecycleFailed: 0,
      lifecycleAborted: 0,
      queueRejected: 0,
    },
    formatNumber: (value) => String(value),
  });
  assert(
    quiet.assessmentKey === "agent.command.doctor.recoverInvestigateAssessmentNormal" &&
      quiet.fixResumeKey === "agent.command.doctor.recoverInvestigateFixResumeIfNeeded" &&
      quiet.fixQueueHealKey === "agent.command.doctor.recoverInvestigateFixQueueHealIfNeeded" &&
      quiet.fixExecuteStrictKey === "agent.command.doctor.recoverInvestigateFixExecuteStrictIfNeeded",
    "doctor recover investigate runtime should emit if-needed fixes in quiet non-interrupted mode",
  );
}

function verifyDoctorStatusRuntimeDeterministic(): void {
  const suppressionRatio = deriveDoctorFallbackSuppressionRatioPct({
    used: 1,
    suppressed: 4,
  });
  assert(
    suppressionRatio === 80,
    "doctor status runtime should compute fallback suppression ratio percent",
  );
  assert(
    shouldWarnDoctorFallbackSuppressionRatio({
      used: 1,
      suppressed: 4,
      thresholdPct: 50,
    }),
    "doctor status runtime should warn when suppression ratio reaches threshold",
  );
  assert(
    !shouldWarnDoctorFallbackSuppressionRatio({
      used: 4,
      suppressed: 1,
      thresholdPct: 50,
    }),
    "doctor status runtime should not warn when suppression ratio stays below threshold",
  );

  const queueFull = deriveDoctorQueueHealthStatus(8, 8);
  const queueHigh = deriveDoctorQueueHealthStatus(6, 8);
  const queueHealthy = deriveDoctorQueueHealthStatus(2, 8);
  assert(
    queueFull.level === "full" && queueFull.pct === 100,
    "doctor status runtime should classify full queue state",
  );
  assert(
    queueHigh.level === "high" && queueHigh.pct === 75,
    "doctor status runtime should classify high queue state at 75%",
  );
  assert(
    queueHealthy.level === "healthy" && queueHealthy.pct === 25,
    "doctor status runtime should classify healthy queue state below 75%",
  );

  assert(
    shouldWarnDoctorToolFailureSummary(1) && !shouldWarnDoctorToolFailureSummary(0),
    "doctor status runtime should warn tool-failure summary when failures exist",
  );
  assert(
    shouldWarnDoctorBudgetGuardSummary(1) && !shouldWarnDoctorBudgetGuardSummary(0),
    "doctor status runtime should warn budget summary when guard events exist",
  );
  assert(
    shouldWarnDoctorQueueDeduplicated(1) && !shouldWarnDoctorQueueDeduplicated(0),
    "doctor status runtime should warn deduplicated queue summary when count > 0",
  );
  assert(
    shouldWarnDoctorPermissionRiskHigh({ critical: 1, highRisk: 0 }) &&
      shouldWarnDoctorPermissionRiskHigh({ critical: 0, highRisk: 1 }) &&
      !shouldWarnDoctorPermissionRiskHigh({ critical: 0, highRisk: 0 }),
    "doctor status runtime should warn permission high-risk summary when critical/high-risk counters exist",
  );
}

function verifyDoctorLineRuntimeDeterministic(): void {
  const queueFullLine = deriveDoctorQueueLineDescriptor(8, 8);
  const queueHighLine = deriveDoctorQueueLineDescriptor(6, 8);
  const queueHealthyLine = deriveDoctorQueueLineDescriptor(2, 8);
  assert(
    queueFullLine.level === "warn" && queueFullLine.key === "agent.command.doctor.queueFull",
    "doctor line runtime should map queue full state to queueFull warn line",
  );
  assert(
    queueHighLine.level === "warn" && queueHighLine.key === "agent.command.doctor.queueHigh",
    "doctor line runtime should map queue high state to queueHigh warn line",
  );
  assert(
    queueHealthyLine.level === "ok" && queueHealthyLine.key === "agent.command.doctor.queueHealthy",
    "doctor line runtime should map healthy queue state to queueHealthy ok line",
  );

  const suppressionWarnLine = deriveDoctorFallbackSuppressionRatioLineDescriptor({
    used: 1,
    suppressed: 4,
    thresholdPct: 50,
  });
  const suppressionNoWarnLine = deriveDoctorFallbackSuppressionRatioLineDescriptor({
    used: 4,
    suppressed: 1,
    thresholdPct: 50,
  });
  assert(
    suppressionWarnLine?.level === "warn" && suppressionWarnLine.vars.ratio === 80,
    "doctor line runtime should emit fallback suppression warn line when ratio threshold is reached",
  );
  assert(
    suppressionNoWarnLine === null,
    "doctor line runtime should skip fallback suppression line when ratio stays below threshold",
  );

  assert(
    deriveDoctorToolFailureLineLevel(1) === "warn" && deriveDoctorToolFailureLineLevel(0) === "ok",
    "doctor line runtime should map tool-failure totals to warn/ok levels",
  );
  assert(
    deriveDoctorBudgetGuardLineLevel(1) === "warn" && deriveDoctorBudgetGuardLineLevel(0) === "ok",
    "doctor line runtime should map budget-guard totals to warn/ok levels",
  );
  assert(
    deriveDoctorQueueDeduplicatedLineLevel(1) === "warn" &&
      deriveDoctorQueueDeduplicatedLineLevel(0) === "ok",
    "doctor line runtime should map deduplicated queue counts to warn/ok levels",
  );
  assert(
    deriveDoctorPermissionRiskHighLineLevel(1, 0) === "warn" &&
      deriveDoctorPermissionRiskHighLineLevel(0, 1) === "warn" &&
      deriveDoctorPermissionRiskHighLineLevel(0, 0) === "ok",
    "doctor line runtime should map permission high-risk counters to warn/ok levels",
  );
  assert(
    formatDoctorLine("ok", "healthy") === "[OK] healthy" &&
      formatDoctorLine("warn", "danger") === "[WARN] danger" &&
      formatDoctorLine("fail", "fatal") === "[FAIL] fatal",
    "doctor line runtime should format line prefixes deterministically",
  );
}

function verifyDoctorSectionRuntimeDeterministic(): void {
  assertArrayEquals(
    [...DOCTOR_SECTION_ORDER],
    [
      "header",
      "workspace",
      "git",
      "query",
      "fallback",
      "tooling",
      "prompt",
      "queue",
      "recovery",
      "permission",
      "recommend",
    ],
    "doctor section runtime should expose deterministic default section order",
  );

  const composer = createDoctorSectionComposer();
  composer.addLine("queue", "queue-1");
  composer.addLine("header", "header-1");
  composer.addLine("git", "git-1");
  composer.addLine("queue", "queue-2");
  composer.appendLines("recovery", ["recover-1", "recover-2"]);
  composer.appendLines("fallback", []);
  composer.addLine("recommend", "recommend-1");

  assertArrayEquals(
    composer.buildLines(),
    ["header-1", "git-1", "queue-1", "queue-2", "recover-1", "recover-2", "recommend-1"],
    "doctor section runtime should flatten non-empty sections in fixed order",
  );

  const queueSnapshot = composer.getSectionLines("queue");
  queueSnapshot.push("mutated-locally");
  assert(
    composer.getSectionLines("queue").length === 2,
    "doctor section runtime should return section snapshots that do not mutate internal state",
  );
}

function verifyThreadTitleRuntimeDeterministic(): void {
  assert(
    deriveThreadNameFromQuery("/trace summary runs=all", "New Thread") === "Trace Summary",
    "thread title runtime should summarize known slash commands deterministically",
  );
  assert(
    deriveThreadNameFromQuery("/super custom --mode=fast", "New Thread") === "Super Custom",
    "thread title runtime should summarize unknown slash commands without option noise",
  );
  assert(
    deriveThreadNameFromQuery(
      "Please optimize workspace sidebar thread list truncation behavior and performance.",
      "New Thread",
    ) === "Optimize sidebar...",
    "thread title runtime should infer semantic action/topic labels and compact long titles",
  );
  assert(
    deriveThreadNameFromQuery("\u4fee\u590d \u767b\u5f55 \u7a97\u53e3 \u9000\u51fa \u95ee\u9898", "\u65b0\u7ebf\u7a0b") ===
      "\u4fee\u590d \u7a97\u53e3 \u9000\u51fa",
    "thread title runtime should infer Chinese semantic labels deterministically",
  );
  assert(
    deriveThreadNameFromQuery("   ", "New Thread") === "New Thread",
    "thread title runtime should use fallback when query is empty",
  );
}

async function main() {
  const locale: AppLocale = "en-US";
  await verifyPromptExportShape(locale);
  console.log("PASS command: /prompt export payload shape");

  await verifyTracePromptSummaryShortcut(locale);
  console.log("PASS command: /trace prompt summary path");

  await verifyTraceIncludesRetryStrategy(locale);
  console.log("PASS command: /trace retry strategy details");

  await verifyTraceIncludesCommandLifecycle(locale);
  console.log("PASS command: /trace command lifecycle");

  await verifyTraceIncludesQueuePriority(locale);
  console.log("PASS command: /trace queue priority");

  await verifyTraceIncludesPermissionRiskProfile(locale);
  console.log("PASS command: /trace permission risk profile");

  await verifyTraceSummaryIncludesFallbackStats(locale);
  console.log("PASS command: /trace summary fallback stats");

  await verifyTraceHotspotsIncludesQueuePressure(locale);
  console.log("PASS command: /trace hotspots queue pressure");

  await verifyTraceSupportsRiskProfileFilters(locale);
  console.log("PASS command: /trace risk profile filters");

  await verifyTraceSupportsRiskProfileAliasFilters(locale);
  console.log("PASS command: /trace risk profile alias filters");

  await verifyDoctorIncludesQueryProfile(locale);
  console.log("PASS command: /doctor query profile");

  await verifyDoctorRecommendsQueueHealUnderPressure(locale);
  console.log("PASS command: /doctor queue-heal recommendation");

  await verifyDoctorRecommendsQueueHealUnderPressure("ja-JP");
  console.log("PASS command: /doctor queue-heal recommendation (ja-JP locale)");

  await verifyDoctorRecommendsQueueHealUnderPressure("zh-CN");
  console.log("PASS command: /doctor queue-heal recommendation (zh-CN locale)");

  await verifyDoctorRecoveryLadderLowPressure(locale);
  console.log("PASS command: /doctor recovery ladder (low pressure)");

  await verifyDoctorFallbackInvestigate(locale);
  console.log("PASS command: /doctor fallback investigate");

  await verifyDoctorRecoverInvestigate(locale);
  console.log("PASS command: /doctor recover investigate");

  await verifyDoctorRecoverInvestigateDeduplicatedQueue(locale);
  console.log("PASS command: /doctor recover investigate deduplicated queue");

  await verifyRecoverInvestigateShortcut(locale);
  console.log("PASS command: /recover investigate shortcut");

  await verifyRecoverResumeReusesQueuedRecovery(locale);
  console.log("PASS command: /recover resume queued-reuse");

  await verifyRecoverResumeReusesQueuedRecoveryAcrossLocales(locale);
  console.log("PASS command: /recover resume cross-locale queued-reuse");

  await verifyRecoverResumeQueueFullGuidance(locale);
  console.log("PASS command: /recover resume queue-full guidance");

  await verifyRecoverAutoPolicyNext(locale);
  console.log("PASS command: /recover auto policy");

  await verifyRecoverExecuteChecklist(locale);
  console.log("PASS command: /recover execute checklist");

  await verifyRecoverExecuteStrictGate(locale);
  console.log("PASS command: /recover execute strict gate");

  await verifyRecoverExecuteStrictNoop(locale);
  console.log("PASS command: /recover execute strict noop");

  await verifyRecoverExecuteStrictPass(locale);
  console.log("PASS command: /recover execute strict pass");

  await verifyRecoverPlanRunbook(locale);
  console.log("PASS command: /recover plan runbook");

  await verifyRecoverRunbookAlias(locale);
  console.log("PASS command: /recover runbook alias");

  await verifyRecoverStrictAlias(locale);
  console.log("PASS command: /recover strict alias");

  await verifyRecoverStatusIncludesPlanAndQueuedRecovery(locale);
  console.log("PASS command: /recover status plan");

  await verifyRecoverStatusMatchesQueuedRecoveryAcrossLocales(locale);
  console.log("PASS command: /recover status cross-locale queued recovery");

  await verifyRecoverRunbookBlueprintMatrix();
  console.log("PASS policy: recover runbook blueprint matrix");

  await verifyRecoverRecommendationPresentationPlanner();
  console.log("PASS policy: recover recommendation presentation planner");

  verifyRecoverCommandRuntimeDeterministic();
  console.log("PASS policy: recover command runtime policy");

  verifyTraceRunRuntimeDeterministic();
  console.log("PASS policy: trace run runtime policy");

  verifyTraceCommandParseRuntimeDeterministic();
  console.log("PASS policy: trace command parse runtime policy");

  verifyTraceFilterLabelOptionsRuntimeDeterministic();
  console.log("PASS policy: trace filter-label options runtime policy");

  verifyTraceMessageOptionsRuntimeDeterministic();
  console.log("PASS policy: trace message-options runtime policy");

  verifyQueueOpsFilterRuntimeDeterministic();
  console.log("PASS policy: queue ops filter runtime policy");

  verifyQueueOpsRuntimeDeterministic();
  console.log("PASS policy: queue ops runtime policy");

  verifyQueueMaintenanceRuntimeDeterministic();
  console.log("PASS policy: queue maintenance runtime policy");

  verifyRuntimeSnapshotPublishPolicyDeterministic();
  console.log("PASS policy: runtime snapshot publish policy");

  verifyRecoverResumeRuntimeDeterministic();
  console.log("PASS policy: recover resume runtime policy");

  verifyTraceVisibilityRuntimeDeterministic();
  console.log("PASS policy: trace visibility runtime policy");

  verifyTraceSummaryRuntimeDeterministic();
  console.log("PASS policy: trace summary runtime policy");

  verifyTracePermissionRiskRuntimeDeterministic();
  console.log("PASS policy: trace permission risk runtime policy");

  verifyTraceToolingRuntimeDeterministic();
  console.log("PASS policy: trace tooling runtime policy");

  verifyTraceEventLineRuntimeDeterministic();
  console.log("PASS policy: trace event-line runtime policy");

  verifyTraceEventRendererRuntimeDeterministic(locale);
  console.log("PASS policy: trace event renderer runtime policy");

  verifyTraceLabelRuntimeDeterministic(locale);
  console.log("PASS policy: trace label runtime policy");

  verifyTraceInvestigateRuntimeDeterministic();
  console.log("PASS policy: trace investigate runtime policy");

  verifyTraceInvestigateActionRuntimeDeterministic();
  console.log("PASS policy: trace investigate action runtime policy");

  verifyTraceInvestigateMessageRuntimeDeterministic();
  console.log("PASS policy: trace investigate message runtime policy");

  verifyTraceListMessageRuntimeDeterministic();
  console.log("PASS policy: trace list message runtime policy");

  verifyTraceSummaryRenderRuntimeDeterministic();
  console.log("PASS policy: trace summary render runtime policy");

  verifyTraceSummaryLineRuntimeDeterministic();
  console.log("PASS policy: trace summary line runtime policy");

  verifyTraceSummaryOverviewRuntimeDeterministic();
  console.log("PASS policy: trace summary overview runtime policy");

  verifyTraceSummaryRunDetailRuntimeDeterministic();
  console.log("PASS policy: trace summary run-detail runtime policy");

  verifyTraceSummaryRunLinesRuntimeDeterministic();
  console.log("PASS policy: trace summary run-lines runtime policy");

  verifyTraceSummaryMessageRuntimeDeterministic();
  console.log("PASS policy: trace summary message runtime policy");

  verifyTraceSummaryDescriptorRuntimeDeterministic();
  console.log("PASS policy: trace summary descriptor runtime policy");

  verifyTraceFilterRuntimeDeterministic();
  console.log("PASS policy: trace filter runtime policy");

  verifyTraceHotspotsRuntimeDeterministic();
  console.log("PASS policy: trace hotspots runtime policy");

  verifyTraceHotspotsMessageRuntimeDeterministic();
  console.log("PASS policy: trace hotspots message runtime policy");

  verifyDoctorRecommendationPolicyDeterministic();
  console.log("PASS policy: doctor recommendation deterministic ranking");

  verifyDiagnosisRecommendationTieBreakDeterministic();
  console.log("PASS policy: diagnosis recommendation deterministic tie-break");

  verifyDiagnosisRecommendationScorePolicyDeterministic();
  console.log("PASS policy: diagnosis recommendation deterministic score policy");

  verifyDiagnosisRecommendationTriggerPolicyDeterministic();
  console.log("PASS policy: diagnosis recommendation deterministic trigger policy");

  verifyDiagnosisRecommendationRuntimeBlueprintDeterministic();
  console.log("PASS policy: diagnosis recommendation runtime blueprint policy");

  verifyDoctorRecommendationRuntimeDeterministic();
  console.log("PASS policy: doctor recommendation runtime policy");

  verifyDoctorEnvironmentRuntimeDeterministic();
  console.log("PASS policy: doctor environment runtime policy");

  verifyDoctorRecommendationTextRuntimeDeterministic(locale);
  console.log("PASS policy: doctor recommendation text runtime policy");

  verifyDoctorPromptRuntimeDeterministic();
  console.log("PASS policy: doctor prompt runtime policy");

  verifyDoctorOperationalSectionRuntimeDeterministic();
  console.log("PASS policy: doctor operational section runtime policy");

  verifyDoctorQueueSectionRuntimeDeterministic();
  console.log("PASS policy: doctor queue section runtime policy");

  verifyDoctorRecoverySectionRuntimeDeterministic();
  console.log("PASS policy: doctor recovery section runtime policy");

  verifyDoctorPermissionSectionRuntimeDeterministic();
  console.log("PASS policy: doctor permission section runtime policy");

  verifyDoctorQueueInvestigateRuntimeDeterministic();
  console.log("PASS policy: doctor queue investigate runtime policy");

  verifyDoctorFallbackInvestigateRuntimeDeterministic();
  console.log("PASS policy: doctor fallback investigate runtime policy");

  verifyDoctorRecoverInvestigateRuntimeDeterministic();
  console.log("PASS policy: doctor recover investigate runtime policy");

  verifyDoctorStatusRuntimeDeterministic();
  console.log("PASS policy: doctor status runtime policy");

  verifyDoctorLineRuntimeDeterministic();
  console.log("PASS policy: doctor line runtime policy");

  verifyDoctorSectionRuntimeDeterministic();
  console.log("PASS policy: doctor section runtime policy");

  verifyThreadTitleRuntimeDeterministic();
  console.log("PASS policy: thread title runtime policy");

  await verifyDoctorQueueInvestigateAutoDerive(locale);
  console.log("PASS command: /doctor queue investigate (auto derive)");

  await verifyQueueOpsSummary(locale);
  console.log("PASS command: /queue ops summary");

  await verifyQueueOpsInvalidFilter(locale);
  console.log("PASS command: /queue ops invalid filter");

  await verifyQueueHeal(locale);
  console.log("PASS command: /queue heal");

  await verifyStatusIncludesQueuePriority(locale);
  console.log("PASS command: /status queue priority");

  console.log("All agent command verification cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
