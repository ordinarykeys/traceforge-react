import type { Continue, Terminal } from "./transitions";

export type PermissionRiskClass =
  | "critical"
  | "high_risk"
  | "interactive"
  | "path_outside"
  | "policy";
export type PermissionReversibilityLevel = "reversible" | "mixed" | "hard_to_reverse";
export type PermissionBlastRadiusLevel = "local" | "workspace" | "shared";
export type QueryQueuePriority = "now" | "next" | "later";
export type QueryRetryStrategy =
  | "balanced"
  | "queue_pressure"
  | "background_conservative"
  | "background_load_shed";
export type ToolFailureClass =
  | "permission"
  | "workspace"
  | "timeout"
  | "not_found"
  | "network"
  | "validation"
  | "runtime";

export type PromptSectionOwner = "core" | "safeguards" | "runtime";
export type PromptSectionKind = "static" | "dynamic";

export interface PromptCompiledSectionMetadata {
  id: string;
  kind: PromptSectionKind;
  owner: PromptSectionOwner;
  mutable: boolean;
  modelLaunchTag?: string;
}

export type QueryStreamEvent =
  | {
      type: "prompt_compiled";
      staticSections: number;
      dynamicSections: number;
      staticChars: number;
      dynamicChars: number;
      totalChars: number;
      staticSectionIds?: string[];
      dynamicSectionIds?: string[];
      staticHash?: string;
      dynamicHash?: string;
      modelLaunchTags?: string[];
      sectionMetadata?: PromptCompiledSectionMetadata[];
      at: number;
    }
  | {
      type: "query_start";
      model: string;
      queueCount: number;
      lane?: "foreground" | "background";
      retryMax?: number;
      fallbackEnabled?: boolean;
      retryStrategy?: QueryRetryStrategy;
      at: number;
    }
  | {
      type: "iteration_start";
      iteration: number;
      model: string;
      at: number;
    }
  | {
      type: "retry_attempt";
      iteration: number;
      model: string;
      lane?: "foreground" | "background";
      attempt: number;
      nextDelayMs: number;
      reason: string;
      retryStrategy?: QueryRetryStrategy;
      at: number;
    }
  | {
      type: "retry_profile_update";
      lane: "foreground" | "background";
      queueCount: number;
      retryMax: number;
      fallbackEnabled: boolean;
      retryStrategy: QueryRetryStrategy;
      reason: "queue_depth_change" | "load_shed";
      at: number;
    }
  | {
      type: "fallback_suppressed";
      iteration: number;
      model: string;
      lane: "foreground" | "background";
      reason:
        | "retry_strategy"
        | "gate_disabled"
        | "fallback_missing"
        | "same_model"
        | "already_retried";
      retryStrategy?: QueryRetryStrategy;
      fallbackModel?: string | null;
      at: number;
    }
  | {
      type: "tool_batch_start";
      iteration: number;
      count: number;
      at: number;
    }
  | {
      type: "tool_batch_complete";
      iteration: number;
      count: number;
      errorCount: number;
      at: number;
    }
  | {
      type: "tool_result";
      tool: string;
      outcome: "result" | "rejected" | "error";
      at: number;
    }
  | {
      type: "tool_retry_guard";
      tool: string;
      streak: number;
      guidance: "diagnose_before_retry";
      at: number;
    }
  | {
      type: "tool_failure_classified";
      tool: string;
      failureClass: ToolFailureClass;
      streak: number;
      fastGuarded?: boolean;
      at: number;
    }
  | {
      type: "tool_failure_diagnosis";
      errorCount: number;
      toolCount: number;
      breakdown: string;
      continuationCount: number;
      at: number;
    }
  | {
      type: "tool_budget_guard";
      tool: string;
      count: number;
      budget: number;
      reason: "per_tool_limit" | "failure_backoff";
      at: number;
    }
  | {
      type: "continue";
      transition: Continue;
      iteration: number;
      at: number;
    }
  | {
      type: "stop_hook_review";
      noteCount: number;
      continuationCount: number;
      at: number;
    }
  | {
      type: "query_end";
      terminalReason: "completed" | "aborted" | "stop_hook_prevented" | "max_iterations" | "error";
      durationMs: number;
      at: number;
      error?: string;
    }
  | {
      type: "permission_decision";
      tool: string;
      behavior: "allow" | "ask" | "deny";
      reason: string;
      riskClass?: PermissionRiskClass;
      at: number;
    }
  | {
      type: "permission_risk_profile";
      tool: string;
      riskClass?: PermissionRiskClass;
      reason: string;
      reversibility: PermissionReversibilityLevel;
      blastRadius: PermissionBlastRadiusLevel;
      at: number;
    }
  | {
      type: "authorization_scope_notice";
      tool: string;
      riskClass: PermissionRiskClass;
      priorApprovals: number;
      at: number;
    }
  | {
      type: "queue_update";
      action: "queued" | "dequeued" | "rejected";
      queueCount: number;
      queueLimit: number;
      reason?: "capacity" | "stale" | "manual" | "deduplicated";
      priority?: QueryQueuePriority;
      at: number;
    }
  | {
      type: "command_lifecycle";
      commandId: string;
      command: string;
      state: "queued" | "started" | "completed" | "failed" | "aborted";
      lane: "foreground" | "background";
      queued: boolean;
      terminalReason?: Terminal["reason"] | "slash_command_error";
      at: number;
    };

export interface QueryStreamSnapshot {
  events: QueryStreamEvent[];
  lastTerminal: Terminal | null;
}
