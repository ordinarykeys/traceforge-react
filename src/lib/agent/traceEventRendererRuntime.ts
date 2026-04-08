import type { QueryStreamEvent } from "./query/events";
import {
  formatTraceQueuePriorityLabel,
  formatTraceRetryStrategyLabel,
} from "./traceLabelRuntime";
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
} from "./traceEventLineRuntime";

export interface TraceEventLineRenderContext {
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function renderTraceEventLine(
  context: TraceEventLineRenderContext,
  event: QueryStreamEvent,
): string {
  switch (event.type) {
    case "prompt_compiled":
      {
        const descriptor = deriveTracePromptCompiledLineDescriptor(event);
        const baseLine = context.t(descriptor.key, descriptor.vars);
        const suffix: string[] = [];
        if (descriptor.hashPair) {
          suffix.push(`hash=${descriptor.hashPair}`);
        }
        if (descriptor.tags.length > 0) {
          suffix.push(`tags=${descriptor.tags.join(",")}`);
        }
        if (suffix.length === 0) {
          return baseLine;
        }
        return `${baseLine} | ${suffix.join(" | ")}`;
      }
    case "query_start": {
      const descriptor = deriveTraceQueryStartLineDescriptor(event);
      if (descriptor.key === "agent.trace.event.queryStart") {
        return context.t(descriptor.key, descriptor.vars);
      }
      const detailedVars = descriptor.vars as Extract<
        typeof descriptor.vars,
        { lane: "foreground" | "background" }
      >;
      const baseLine = context.t(descriptor.key, {
        model: detailedVars.model,
        queueCount: detailedVars.queueCount,
        lane: context.t(detailedVars.laneKey),
        retries: detailedVars.retries,
        fallback: context.t(detailedVars.fallbackKey),
      });
      if (!descriptor.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatTraceRetryStrategyLabel(context.t, descriptor.retryStrategy);
      return `${baseLine} | ${context.t("agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "iteration_start":
      {
        const descriptor = deriveTraceIterationStartLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "retry_attempt": {
      const descriptor = deriveTraceRetryAttemptLineDescriptor(event);
      const baseLine = context.t(descriptor.key, {
        iteration: descriptor.vars.iteration,
        model: descriptor.vars.model,
        lane: context.t(descriptor.vars.laneKey),
        attempt: descriptor.vars.attempt,
        delaySec: descriptor.vars.delaySec,
        reason: descriptor.vars.reason,
      });
      if (!descriptor.retryStrategy) {
        return baseLine;
      }
      const strategyLabel = formatTraceRetryStrategyLabel(context.t, descriptor.retryStrategy);
      return `${baseLine} | ${context.t("agent.trace.retryStrategyLabel", { strategy: strategyLabel })}`;
    }
    case "retry_profile_update":
      {
        const descriptor = deriveTraceRetryProfileUpdateLineDescriptor(event);
        return context.t(descriptor.key, {
          lane: context.t(descriptor.vars.laneKey),
          queue: descriptor.vars.queue,
          retries: descriptor.vars.retries,
          fallback: context.t(descriptor.vars.fallbackKey),
          strategy: formatTraceRetryStrategyLabel(context.t, descriptor.vars.strategy),
          reason: context.t(descriptor.vars.reasonKey),
        });
      }
    case "fallback_suppressed":
      {
        const descriptor = deriveTraceFallbackSuppressedLineDescriptor(event);
        return context.t(descriptor.key, {
          iteration: descriptor.vars.iteration,
          model: descriptor.vars.model,
          lane: context.t(descriptor.vars.laneKey),
          reason: context.t(descriptor.vars.reasonKey),
          strategy: formatTraceRetryStrategyLabel(context.t, descriptor.vars.strategy),
        });
      }
    case "tool_batch_start":
      {
        const descriptor = deriveTraceToolBatchStartLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "tool_batch_complete":
      {
        const descriptor = deriveTraceToolBatchCompleteLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "tool_result":
      {
        const descriptor = deriveTraceToolResultLineDescriptor(event);
        return context.t(descriptor.key, {
          tool: descriptor.vars.tool,
          outcome: context.t(descriptor.vars.outcomeKey),
        });
      }
    case "tool_retry_guard":
      {
        const descriptor = deriveTraceToolRetryGuardLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "tool_failure_classified":
      {
        const descriptor = deriveTraceToolFailureClassifiedLineDescriptor(event);
        return context.t(descriptor.key, {
          tool: descriptor.vars.tool,
          failureClass: context.t(descriptor.vars.failureClassKey),
          streak: descriptor.vars.streak,
          fastGuard: descriptor.vars.fastGuarded ? " [fast-guard]" : "",
        });
      }
    case "tool_failure_diagnosis":
      {
        const descriptor = deriveTraceToolFailureDiagnosisLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "tool_budget_guard":
      {
        const descriptor = deriveTraceToolBudgetGuardLineDescriptor(event);
        return context.t(descriptor.key, {
          tool: descriptor.vars.tool,
          count: descriptor.vars.count,
          budget: descriptor.vars.budget,
          reason: context.t(descriptor.vars.reasonKey),
        });
      }
    case "continue":
      {
        const descriptor = deriveTraceContinueLineDescriptor(event);
        const reason = context.t(descriptor.reason.key, descriptor.reason.vars);
        return context.t(descriptor.key, { reason });
      }
    case "stop_hook_review":
      {
        const descriptor = deriveTraceStopHookReviewLineDescriptor(event);
        return context.t(descriptor.key, descriptor.vars);
      }
    case "permission_decision":
      {
        const descriptor = deriveTracePermissionDecisionLineDescriptor(event);
        const baseLine = context.t(descriptor.key, descriptor.vars);
        if (!descriptor.riskKey) {
          return baseLine;
        }
        const riskLabel = context.t(descriptor.riskKey);
        return `${baseLine} | ${context.t("agent.trace.permissionRiskLabel", { risk: riskLabel })}`;
      }
    case "permission_risk_profile":
      {
        const descriptor = deriveTracePermissionRiskProfileLineDescriptor(event);
        return context.t(descriptor.key, {
          tool: descriptor.vars.tool,
          risk: context.t(descriptor.vars.riskKey),
          reversibility: context.t(descriptor.vars.reversibilityKey),
          blastRadius: context.t(descriptor.vars.blastRadiusKey),
        });
      }
    case "authorization_scope_notice":
      {
        const descriptor = deriveTraceAuthorizationScopeNoticeLineDescriptor(event);
        return context.t(descriptor.key, {
          tool: descriptor.vars.tool,
          risk: context.t(descriptor.vars.riskKey),
          count: descriptor.vars.count,
        });
      }
    case "queue_update": {
      const descriptor = deriveTraceQueueUpdateLineDescriptor(event);
      const reasonLabel = descriptor.reasonKey
        ? context.t(descriptor.reasonKey)
        : "";
      const priorityLabel = formatTraceQueuePriorityLabel(context.t, descriptor.priority);
      return context.t(descriptor.key, {
        action: context.t(descriptor.vars.actionKey),
        queueCount: descriptor.vars.queueCount,
        queueLimit: descriptor.vars.queueLimit,
        reason: `${priorityLabel ? ` [${priorityLabel}]` : ""}${reasonLabel ? ` (${reasonLabel})` : ""}`,
      });
    }
    case "command_lifecycle":
      {
        const descriptor = deriveTraceCommandLifecycleLineDescriptor(event);
        return context.t(descriptor.key, {
          state: context.t(descriptor.vars.stateKey),
          command: descriptor.vars.command,
        });
      }
    case "query_end":
      {
        const descriptor = deriveTraceQueryEndLineDescriptor(event);
        return context.t(descriptor.key, {
          terminalReason: context.t(descriptor.vars.terminalReasonKey),
          durationSec: descriptor.vars.durationSec,
        });
      }
    default:
      return context.t("agent.trace.event.unknown");
  }
}
