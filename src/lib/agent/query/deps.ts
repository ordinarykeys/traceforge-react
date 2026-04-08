import { withRetry } from "../apiUtils";

export interface LLMCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

export interface CallModelParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  tools: unknown[];
  temperature?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  requestTimeoutMs?: number;
  onRetryAttempt?: (attempt: number, error: unknown, nextDelayMs: number) => void;
  signal?: AbortSignal;
}

export type QueryDeps = {
  callModel: (params: CallModelParams) => Promise<LLMCompletionResponse>;
};

const REQUEST_TIMEOUT_DEFAULT_MS = 240_000;
const REQUEST_TIMEOUT_MIN_MS = 10_000;
const REQUEST_TIMEOUT_MAX_MS = 15 * 60_000;

function clampRequestTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return REQUEST_TIMEOUT_DEFAULT_MS;
  }
  const rounded = Math.round(value);
  if (rounded < REQUEST_TIMEOUT_MIN_MS) return REQUEST_TIMEOUT_MIN_MS;
  if (rounded > REQUEST_TIMEOUT_MAX_MS) return REQUEST_TIMEOUT_MAX_MS;
  return rounded;
}

function createAttemptAbortSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const onParentAbort = () => {
    controller.abort();
  };

  if (parentSignal?.aborted) {
    controller.abort();
  } else if (parentSignal) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut,
  };
}

export function productionDeps(): QueryDeps {
  return {
    callModel: async ({
      baseUrl,
      apiKey,
      model,
      messages,
      tools,
      temperature = 0.3,
      maxRetries = 3,
      retryBaseDelayMs = 1000,
      retryMaxDelayMs = 15000,
      requestTimeoutMs = REQUEST_TIMEOUT_DEFAULT_MS,
      onRetryAttempt,
      signal,
    }) =>
      withRetry(
        async () => {
          const timeoutMs = clampRequestTimeoutMs(requestTimeoutMs);
          const attemptAbort = createAttemptAbortSignal(signal, timeoutMs);
          let res: Response;
          try {
            res = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages,
                tools,
                temperature,
              }),
              signal: attemptAbort.signal,
            });
          } catch (error) {
            if (attemptAbort.didTimeout() && !signal?.aborted) {
              throw new Error(`LLM request timeout after ${timeoutMs}ms`);
            }
            throw error;
          } finally {
            attemptAbort.cleanup();
          }

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(`LLM API error: ${res.status} ${JSON.stringify(errorData)}`);
          }
          return (await res.json()) as LLMCompletionResponse;
        },
        {
          maxRetries,
          baseDelay: retryBaseDelayMs,
          maxDelay: retryMaxDelayMs,
          signal,
          onRetry: (attempt, err, nextDelayMs) => {
            console.warn(`Retry attempt ${attempt} due to:`, err);
            onRetryAttempt?.(attempt, err, nextDelayMs);
          },
        },
      ),
  };
}
