import { createDefaultCommandRegistry } from "../src/lib/agent/commands";
import { parseSlashCommand } from "../src/lib/agent/commands/parser";
import type { CommandContext } from "../src/lib/agent/commands/types";
import type { PermissionRule } from "../src/lib/agent/permissions/toolPermissions";
import type { QueryStreamEvent } from "../src/lib/agent/query/events";
import { AgentTaskManager } from "../src/lib/agent/tasks/TaskManager";
import type { AgentMessage, UsageSnapshot } from "../src/lib/agent/QueryEngine";
import { translate, type AppLocale, type TranslationKey } from "../src/lib/i18n";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

function createContext(locale: AppLocale, events: QueryStreamEvent[]): Omit<CommandContext, "parsed"> {
  const permissionRules: PermissionRule[] = [];
  const messages: AgentMessage[] = [];
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

  return {
    workingDir: "C:/repo/demo",
    threadId: "thread-demo",
    currentModel: "demo-model",
    locale,
    queueCount: 0,
    queueLimit: 8,
    queueByPriority: {
      now: 0,
      next: 0,
      later: 0,
    },
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
    getRecentQueryEvents: (limit = 120) => events.slice(-Math.max(1, limit)),
    clearQueryEvents: () => {
      events.length = 0;
    },
    submitFollowupQuery: () => ({
      accepted: false,
      reason: "empty",
      queueCount: 0,
      queueLimit: 8,
    }),
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
  assert(
    result.message.includes(queuePriorityLine),
    "status output should include queue priority breakdown",
  );
  assert(
    result.message.includes(queuePressureLine),
    "status output should include queue pressure label",
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

  await verifyDoctorFallbackInvestigate(locale);
  console.log("PASS command: /doctor fallback investigate");

  await verifyStatusIncludesQueuePriority(locale);
  console.log("PASS command: /status queue priority");

  console.log("All agent command verification cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
