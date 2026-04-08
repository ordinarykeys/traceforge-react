import type {
  PermissionRiskClass,
  QueryStreamEvent,
  ToolFailureClass,
} from "./query/events";

export interface TracePromptCompiledLineDescriptor {
  key: "agent.trace.event.promptCompiled";
  vars: {
    staticSections: number;
    dynamicSections: number;
    staticChars: number;
    dynamicChars: number;
    totalChars: number;
  };
  hashPair: string | null;
  tags: string[];
}

export function deriveTracePromptCompiledLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "prompt_compiled" }>,
): TracePromptCompiledLineDescriptor {
  return {
    key: "agent.trace.event.promptCompiled",
    vars: {
      staticSections: event.staticSections,
      dynamicSections: event.dynamicSections,
      staticChars: event.staticChars,
      dynamicChars: event.dynamicChars,
      totalChars: event.totalChars,
    },
    hashPair:
      event.staticHash && event.dynamicHash
        ? `${event.staticHash}/${event.dynamicHash}`
        : null,
    tags: Array.isArray(event.modelLaunchTags) ? [...event.modelLaunchTags] : [],
  };
}

export interface TraceQueryStartLineDescriptor {
  key: "agent.trace.event.queryStart" | "agent.trace.event.queryStartDetailed";
  vars:
    | {
        model: string;
        queueCount: number;
      }
    | {
        model: string;
        queueCount: number;
        lane: "foreground" | "background";
        retries: string;
        fallbackState: "on" | "off";
        laneKey: string;
        fallbackKey: string;
      };
  retryStrategy: string | undefined;
}

export function deriveTraceQueryStartLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "query_start" }>,
): TraceQueryStartLineDescriptor {
  const detailed =
    event.lane !== undefined ||
    event.retryMax !== undefined ||
    event.fallbackEnabled !== undefined ||
    event.retryStrategy !== undefined;

  if (!detailed) {
    return {
      key: "agent.trace.event.queryStart",
      vars: {
        model: event.model,
        queueCount: event.queueCount,
      },
      retryStrategy: event.retryStrategy,
    };
  }

  return {
    key: "agent.trace.event.queryStartDetailed",
    vars: {
      model: event.model,
      queueCount: event.queueCount,
      lane: event.lane ?? "foreground",
      retries:
        typeof event.retryMax === "number" ? String(event.retryMax) : "-",
      fallbackState: event.fallbackEnabled === true ? "on" : "off",
      laneKey: `agent.trace.queryLane.${event.lane ?? "foreground"}`,
      fallbackKey: `agent.trace.queryFallback.${event.fallbackEnabled === true ? "on" : "off"}`,
    },
    retryStrategy: event.retryStrategy,
  };
}

export interface TraceRetryAttemptLineDescriptor {
  key: "agent.trace.event.retryAttempt";
  vars: {
    iteration: number;
    model: string;
    lane: "foreground" | "background";
    laneKey: string;
    attempt: number;
    delaySec: string;
    reason: string;
  };
  retryStrategy: string | undefined;
}

export function deriveTraceRetryAttemptLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "retry_attempt" }>,
): TraceRetryAttemptLineDescriptor {
  return {
    key: "agent.trace.event.retryAttempt",
    vars: {
      iteration: event.iteration,
      model: event.model,
      lane: event.lane ?? "foreground",
      laneKey: `agent.trace.queryLane.${event.lane ?? "foreground"}`,
      attempt: event.attempt,
      delaySec: (event.nextDelayMs / 1000).toFixed(1),
      reason: event.reason,
    },
    retryStrategy: event.retryStrategy,
  };
}

export interface TraceRetryProfileUpdateLineDescriptor {
  key: "agent.trace.event.retryProfileUpdate";
  vars: {
    lane: "foreground" | "background";
    queue: number;
    retries: number;
    fallbackState: "on" | "off";
    laneKey: string;
    fallbackKey: string;
    strategy: string | undefined;
    reason: string;
    reasonKey: string;
  };
}

export function deriveTraceRetryProfileUpdateLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "retry_profile_update" }>,
): TraceRetryProfileUpdateLineDescriptor {
  return {
    key: "agent.trace.event.retryProfileUpdate",
    vars: {
      lane: event.lane,
      queue: event.queueCount,
      retries: event.retryMax,
      fallbackState: event.fallbackEnabled ? "on" : "off",
      laneKey: `agent.trace.queryLane.${event.lane}`,
      fallbackKey: `agent.trace.queryFallback.${event.fallbackEnabled ? "on" : "off"}`,
      strategy: event.retryStrategy,
      reason: event.reason,
      reasonKey: `agent.trace.retryProfileReason.${event.reason}`,
    },
  };
}

export interface TraceFallbackSuppressedLineDescriptor {
  key: "agent.trace.event.fallbackSuppressed";
  vars: {
    iteration: number;
    model: string;
    lane: "foreground" | "background";
    laneKey: string;
    reason: string;
    reasonKey: string;
    strategy: string | undefined;
  };
}

export function deriveTraceFallbackSuppressedLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "fallback_suppressed" }>,
): TraceFallbackSuppressedLineDescriptor {
  return {
    key: "agent.trace.event.fallbackSuppressed",
    vars: {
      iteration: event.iteration,
      model: event.model,
      lane: event.lane,
      reason: event.reason,
      laneKey: `agent.trace.queryLane.${event.lane}`,
      reasonKey: `agent.trace.fallbackSuppressedReason.${event.reason}`,
      strategy: event.retryStrategy,
    },
  };
}

export interface TraceIterationStartLineDescriptor {
  key: "agent.trace.event.iterationStart";
  vars: {
    iteration: number;
    model: string;
  };
}

export function deriveTraceIterationStartLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "iteration_start" }>,
): TraceIterationStartLineDescriptor {
  return {
    key: "agent.trace.event.iterationStart",
    vars: {
      iteration: event.iteration,
      model: event.model,
    },
  };
}

export interface TraceToolBatchStartLineDescriptor {
  key: "agent.trace.event.toolBatchStart";
  vars: {
    iteration: number;
    count: number;
  };
}

export function deriveTraceToolBatchStartLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_batch_start" }>,
): TraceToolBatchStartLineDescriptor {
  return {
    key: "agent.trace.event.toolBatchStart",
    vars: {
      iteration: event.iteration,
      count: event.count,
    },
  };
}

export interface TraceToolBatchCompleteLineDescriptor {
  key: "agent.trace.event.toolBatchComplete";
  vars: {
    count: number;
    errorCount: number;
  };
}

export function deriveTraceToolBatchCompleteLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_batch_complete" }>,
): TraceToolBatchCompleteLineDescriptor {
  return {
    key: "agent.trace.event.toolBatchComplete",
    vars: {
      count: event.count,
      errorCount: event.errorCount,
    },
  };
}

export interface TraceToolResultLineDescriptor {
  key: "agent.trace.event.toolResult";
  vars: {
    tool: string;
    outcome: Extract<QueryStreamEvent, { type: "tool_result" }>["outcome"];
    outcomeKey: string;
  };
}

export function deriveTraceToolResultLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_result" }>,
): TraceToolResultLineDescriptor {
  return {
    key: "agent.trace.event.toolResult",
    vars: {
      tool: event.tool,
      outcome: event.outcome,
      outcomeKey: `agent.trace.toolOutcome.${event.outcome}`,
    },
  };
}

export interface TraceToolRetryGuardLineDescriptor {
  key: "agent.trace.event.toolRetryGuard";
  vars: {
    tool: string;
    streak: number;
  };
}

export function deriveTraceToolRetryGuardLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_retry_guard" }>,
): TraceToolRetryGuardLineDescriptor {
  return {
    key: "agent.trace.event.toolRetryGuard",
    vars: {
      tool: event.tool,
      streak: event.streak,
    },
  };
}

export interface TraceToolFailureDiagnosisLineDescriptor {
  key: "agent.trace.event.toolFailureDiagnosis";
  vars: {
    errorCount: number;
    toolCount: number;
    continuationCount: number;
    breakdown: string;
  };
}

export function deriveTraceToolFailureDiagnosisLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_failure_diagnosis" }>,
): TraceToolFailureDiagnosisLineDescriptor {
  return {
    key: "agent.trace.event.toolFailureDiagnosis",
    vars: {
      errorCount: event.errorCount,
      toolCount: event.toolCount,
      continuationCount: event.continuationCount,
      breakdown: event.breakdown || "-",
    },
  };
}

export interface TraceContinueLineDescriptor {
  key: "agent.trace.event.continue";
  reason: {
    key:
      | "agent.continue.toolResults"
      | "agent.continue.fallbackRetry"
      | "agent.continue.tokenBudget"
      | "agent.continue.stopHookRetry"
      | "agent.continue.none";
    vars?: {
      model?: string;
      attempt?: number;
    };
  };
  vars: {
    transitionReason: Extract<QueryStreamEvent, { type: "continue" }>["transition"]["reason"];
    fallbackModel?: string;
    attempt?: number;
  };
}

export function deriveTraceContinueLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "continue" }>,
): TraceContinueLineDescriptor {
  const transition = event.transition;
  let reason: TraceContinueLineDescriptor["reason"];
  switch (transition.reason) {
    case "tool_results":
      reason = { key: "agent.continue.toolResults" };
      break;
    case "fallback_retry":
      reason = {
        key: "agent.continue.fallbackRetry",
        vars: { model: "fallbackModel" in transition ? transition.fallbackModel : "" },
      };
      break;
    case "token_budget_continuation":
      reason = {
        key: "agent.continue.tokenBudget",
        vars: { attempt: "attempt" in transition ? transition.attempt : 1 },
      };
      break;
    case "stop_hook_retry":
      reason = {
        key: "agent.continue.stopHookRetry",
        vars: { attempt: "attempt" in transition ? transition.attempt : 1 },
      };
      break;
    default:
      reason = { key: "agent.continue.none" };
      break;
  }
  return {
    key: "agent.trace.event.continue",
    reason,
    vars: {
      transitionReason: transition.reason,
      fallbackModel: "fallbackModel" in transition ? transition.fallbackModel : undefined,
      attempt: "attempt" in transition ? transition.attempt : undefined,
    },
  };
}

export interface TraceStopHookReviewLineDescriptor {
  key: "agent.trace.event.stopHookReview";
  vars: {
    notes: number;
    continuation: number;
  };
}

export function deriveTraceStopHookReviewLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "stop_hook_review" }>,
): TraceStopHookReviewLineDescriptor {
  return {
    key: "agent.trace.event.stopHookReview",
    vars: {
      notes: event.noteCount,
      continuation: event.continuationCount,
    },
  };
}

export interface TracePermissionDecisionLineDescriptor {
  key: "agent.trace.event.permissionDecision";
  vars: {
    behavior: "allow" | "ask" | "deny";
    tool: string;
    reason: string;
  };
  riskClass: PermissionRiskClass | null;
  riskKey: string | null;
}

export function deriveTracePermissionDecisionLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "permission_decision" }>,
): TracePermissionDecisionLineDescriptor {
  return {
    key: "agent.trace.event.permissionDecision",
    vars: {
      behavior: event.behavior,
      tool: event.tool,
      reason: event.reason,
    },
    riskClass: event.riskClass ?? null,
    riskKey: event.riskClass ? `agent.trace.permissionRisk.${event.riskClass}` : null,
  };
}

export interface TracePermissionRiskProfileLineDescriptor {
  key: "agent.trace.event.permissionRiskProfile";
  vars: {
    tool: string;
    riskClass: PermissionRiskClass | null;
    riskKey: string;
    reversibility: Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["reversibility"];
    reversibilityKey: string;
    blastRadius: Extract<QueryStreamEvent, { type: "permission_risk_profile" }>["blastRadius"];
    blastRadiusKey: string;
  };
}

export function deriveTracePermissionRiskProfileLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "permission_risk_profile" }>,
): TracePermissionRiskProfileLineDescriptor {
  return {
    key: "agent.trace.event.permissionRiskProfile",
    vars: {
      tool: event.tool,
      riskClass: event.riskClass ?? null,
      riskKey: event.riskClass
        ? `agent.trace.permissionRisk.${event.riskClass}`
        : "agent.trace.permissionRisk.policy",
      reversibility: event.reversibility,
      reversibilityKey: `agent.permission.prompt.reversibility.${event.reversibility}`,
      blastRadius: event.blastRadius,
      blastRadiusKey: `agent.permission.prompt.blastRadius.${event.blastRadius}`,
    },
  };
}

export interface TraceAuthorizationScopeNoticeLineDescriptor {
  key: "agent.trace.event.authorizationScope";
  vars: {
    tool: string;
    riskClass: PermissionRiskClass;
    riskKey: string;
    count: number;
  };
}

export function deriveTraceAuthorizationScopeNoticeLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "authorization_scope_notice" }>,
): TraceAuthorizationScopeNoticeLineDescriptor {
  return {
    key: "agent.trace.event.authorizationScope",
    vars: {
      tool: event.tool,
      riskClass: event.riskClass,
      riskKey: `agent.trace.permissionRisk.${event.riskClass}`,
      count: event.priorApprovals,
    },
  };
}

export interface TraceQueueUpdateLineDescriptor {
  key: "agent.trace.event.queueUpdate";
  vars: {
    action: "queued" | "dequeued" | "rejected";
    actionKey: string;
    queueCount: number;
    queueLimit: number;
  };
  priority: Extract<QueryStreamEvent, { type: "queue_update" }>["priority"];
  reason: Extract<QueryStreamEvent, { type: "queue_update" }>["reason"];
  reasonKey: string | null;
}

export function deriveTraceQueueUpdateLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "queue_update" }>,
): TraceQueueUpdateLineDescriptor {
  return {
    key: "agent.trace.event.queueUpdate",
    vars: {
      action: event.action,
      actionKey: `agent.trace.queueAction.${event.action}`,
      queueCount: event.queueCount,
      queueLimit: event.queueLimit,
    },
    priority: event.priority,
    reason: event.reason,
    reasonKey: event.reason ? `agent.trace.queueReason.${event.reason}` : null,
  };
}

export interface TraceCommandLifecycleLineDescriptor {
  key: "agent.trace.event.commandLifecycle";
  vars: {
    state: Extract<QueryStreamEvent, { type: "command_lifecycle" }>["state"];
    stateKey: string;
    command: string;
  };
}

export function deriveTraceCommandLifecycleLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "command_lifecycle" }>,
): TraceCommandLifecycleLineDescriptor {
  return {
    key: "agent.trace.event.commandLifecycle",
    vars: {
      state: event.state,
      stateKey: `agent.trace.commandLifecycle.state.${event.state}`,
      command: event.command,
    },
  };
}

export interface TraceQueryEndLineDescriptor {
  key: "agent.trace.event.queryEnd";
  vars: {
    terminalReason: Extract<QueryStreamEvent, { type: "query_end" }>["terminalReason"];
    terminalReasonKey: string;
    durationSec: string;
  };
}

export function deriveTraceQueryEndLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "query_end" }>,
): TraceQueryEndLineDescriptor {
  const terminalReasonKey = (() => {
    switch (event.terminalReason) {
      case "completed":
        return "agent.trace.terminal.completed";
      case "aborted":
        return "agent.trace.terminal.aborted";
      case "stop_hook_prevented":
        return "agent.trace.terminal.stopHookPrevented";
      case "max_iterations":
        return "agent.trace.terminal.maxIterations";
      case "error":
        return "agent.trace.terminal.error";
      default:
        return `agent.trace.terminal.${event.terminalReason}`;
    }
  })();
  return {
    key: "agent.trace.event.queryEnd",
    vars: {
      terminalReason: event.terminalReason,
      terminalReasonKey,
      durationSec: (event.durationMs / 1000).toFixed(1),
    },
  };
}

export interface TraceToolFailureClassifiedLineDescriptor {
  key: "agent.trace.event.toolFailureClassified";
  vars: {
    tool: string;
    failureClass: ToolFailureClass;
    failureClassKey: string;
    streak: number;
    fastGuarded: boolean;
  };
}

export function deriveTraceToolFailureClassifiedLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_failure_classified" }>,
): TraceToolFailureClassifiedLineDescriptor {
  return {
    key: "agent.trace.event.toolFailureClassified",
    vars: {
      tool: event.tool,
      failureClass: event.failureClass,
      failureClassKey: `agent.trace.toolFailureClass.${event.failureClass}`,
      streak: event.streak,
      fastGuarded: event.fastGuarded === true,
    },
  };
}

export interface TraceToolBudgetGuardLineDescriptor {
  key: "agent.trace.event.toolBudgetGuard";
  vars: {
    tool: string;
    count: number;
    budget: number;
    reason: Extract<QueryStreamEvent, { type: "tool_budget_guard" }>["reason"];
    reasonKey: string;
  };
}

export function deriveTraceToolBudgetGuardLineDescriptor(
  event: Extract<QueryStreamEvent, { type: "tool_budget_guard" }>,
): TraceToolBudgetGuardLineDescriptor {
  return {
    key: "agent.trace.event.toolBudgetGuard",
    vars: {
      tool: event.tool,
      count: event.count,
      budget: event.budget,
      reason: event.reason,
      reasonKey: `agent.trace.toolBudgetReason.${event.reason}`,
    },
  };
}
