import type { AgentMessage } from "../QueryEngine";

export interface StopHookContext {
  messages: AgentMessage[];
  assistantMessage: AgentMessage;
  iteration: number;
}

export interface StopHookResult {
  blockingMessage?: string;
  preventContinuation?: boolean;
  note?: string;
  continuationMessage?: string;
}

export type StopHook = (context: StopHookContext) => StopHookResult | Promise<StopHookResult>;

export interface StopHooksExecutionResult {
  blockingErrors: string[];
  preventContinuation: boolean;
  notes: string[];
  continuationMessages: string[];
}

export async function executeStopHooks(
  hooks: StopHook[],
  context: StopHookContext,
): Promise<StopHooksExecutionResult> {
  const result: StopHooksExecutionResult = {
    blockingErrors: [],
    preventContinuation: false,
    notes: [],
    continuationMessages: [],
  };

  for (const hook of hooks) {
    const hookResult = await hook(context);
    if (!hookResult) continue;

    if (hookResult.blockingMessage) {
      result.blockingErrors.push(hookResult.blockingMessage);
    }
    if (hookResult.note) {
      result.notes.push(hookResult.note);
    }
    if (hookResult.continuationMessage) {
      result.continuationMessages.push(hookResult.continuationMessage);
    }
    if (hookResult.preventContinuation) {
      result.preventContinuation = true;
    }
  }

  return result;
}
