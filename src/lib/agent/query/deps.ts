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
}

export interface CallModelParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  tools: unknown[];
  temperature?: number;
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
          maxRetries: 3,
          signal,
          onRetry: (attempt, err) => {
            console.warn(`Retry attempt ${attempt} due to:`, err);
          },
        },
      ),
  };
}
