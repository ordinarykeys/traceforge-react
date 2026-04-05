export interface ToolCallLike {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolRunResult<TToolCall extends ToolCallLike = ToolCallLike> {
  toolCall: TToolCall;
  result: string;
}

interface ToolBatch<TToolCall extends ToolCallLike> {
  isConcurrencySafe: boolean;
  toolCalls: TToolCall[];
}

export interface RunToolsParams<TToolCall extends ToolCallLike = ToolCallLike> {
  toolCalls: TToolCall[];
  isConcurrencySafe: (toolCall: TToolCall) => boolean;
  runSingleTool: (toolCall: TToolCall) => Promise<string>;
  onToolError?: (toolCall: TToolCall, error: unknown) => string;
  shouldAbort?: () => boolean;
  createAbortResult?: (toolCall: TToolCall) => string;
  onToolStart?: (toolCall: TToolCall) => void;
  onToolComplete?: (toolCall: TToolCall, result: string) => void;
}

function partitionToolCalls<TToolCall extends ToolCallLike>(
  toolCalls: TToolCall[],
  isConcurrencySafe: (toolCall: TToolCall) => boolean,
): ToolBatch<TToolCall>[] {
  return toolCalls.reduce<ToolBatch<TToolCall>[]>((acc, toolCall) => {
    const safe = isConcurrencySafe(toolCall);
    const last = acc[acc.length - 1];
    if (safe && last?.isConcurrencySafe) {
      last.toolCalls.push(toolCall);
    } else {
      acc.push({ isConcurrencySafe: safe, toolCalls: [toolCall] });
    }
    return acc;
  }, []);
}

export async function runTools<TToolCall extends ToolCallLike>(
  params: RunToolsParams<TToolCall>,
): Promise<ToolRunResult<TToolCall>[]> {
  const { toolCalls, isConcurrencySafe, runSingleTool, onToolStart, onToolComplete } = params;
  const onToolError =
    params.onToolError ??
    ((toolCall: TToolCall, error: unknown) =>
      `Error: Tool "${toolCall.function.name}" execution crashed: ${String(error)}`);
  const shouldAbort = params.shouldAbort ?? (() => false);
  const createAbortResult =
    params.createAbortResult ??
    ((toolCall: TToolCall) => `Error: Tool "${toolCall.function.name}" skipped: turn interrupted.`);
  const results: ToolRunResult<TToolCall>[] = [];
  let aborted = false;

  for (const batch of partitionToolCalls(toolCalls, isConcurrencySafe)) {
    if (!aborted && shouldAbort()) {
      aborted = true;
    }

    if (aborted) {
      for (const toolCall of batch.toolCalls) {
        onToolStart?.(toolCall);
        const result = createAbortResult(toolCall);
        onToolComplete?.(toolCall, result);
        results.push({ toolCall, result });
      }
      continue;
    }

    if (batch.isConcurrencySafe) {
      for (const toolCall of batch.toolCalls) {
        onToolStart?.(toolCall);
      }
      const batchResults = await Promise.all(
        batch.toolCalls.map(async (toolCall) => {
          let result: string;
          try {
            result = await runSingleTool(toolCall);
          } catch (error) {
            result = onToolError(toolCall, error);
          }
          onToolComplete?.(toolCall, result);
          return { toolCall, result };
        }),
      );
      results.push(...batchResults);
      continue;
    }

    for (const toolCall of batch.toolCalls) {
      if (shouldAbort()) {
        aborted = true;
      }
      onToolStart?.(toolCall);
      if (aborted) {
        const abortResult = createAbortResult(toolCall);
        onToolComplete?.(toolCall, abortResult);
        results.push({ toolCall, result: abortResult });
        continue;
      }
      let result: string;
      try {
        result = await runSingleTool(toolCall);
      } catch (error) {
        result = onToolError(toolCall, error);
      }
      onToolComplete?.(toolCall, result);
      results.push({ toolCall, result });
    }
  }

  return results;
}
