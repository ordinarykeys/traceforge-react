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
  onRetryAttempt?: (attempt: number, error: unknown, nextDelayMs: number) => void;
  signal?: AbortSignal;
}

export type QueryDeps = {
  callModel: (params: CallModelParams) => Promise<LLMCompletionResponse>;
};

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
      onRetryAttempt,
      signal,
    }) =>
      withRetry(
        async () => {
          const res = await fetch(`${baseUrl}/chat/completions`, {
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
            signal,
          });

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
