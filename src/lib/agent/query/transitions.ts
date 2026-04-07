export type Continue =
  | { reason: "tool_results" }
  | { reason: "token_budget_continuation"; attempt: number }
  | { reason: "fallback_retry"; fallbackModel: string }
  | { reason: "stop_hook_retry"; attempt: number };

export type Terminal =
  | { reason: "completed" }
  | { reason: "aborted" }
  | { reason: "stop_hook_prevented" }
  | { reason: "max_iterations" }
  | { reason: "error"; error: unknown };
