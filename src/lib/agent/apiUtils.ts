/**
 * Utility for retrying asynchronous operations with exponential backoff and jitter.
 * Inspired by Claude-Code's withRetry pattern.
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number; // ms
  maxDelay?: number; // ms
  onRetry?: (attempt: number, error: any, nextDelay: number) => void;
  shouldRetry?: (error: any) => boolean;
  signal?: AbortSignal;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 15000,
    onRetry,
    shouldRetry = defaultShouldRetry,
    signal
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (signal?.aborted) {
      throw new Error("Operation aborted by user");
    }

    try {
      return await operation(attempt);
    } catch (error: any) {
      lastError = error;

      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay
      );
      const jitter = Math.random() * 0.3 * delay;
      const nextDelay = delay + jitter;

      if (onRetry) {
        onRetry(attempt, error, nextDelay);
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("Operation aborted by user"));
        };
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        }, nextDelay);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }

  throw lastError;
}

function defaultShouldRetry(error: any): boolean {
  // Retry on network errors (fetch throws for network errors)
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }

  // Retry on common server-side transient errors
  const statusFromMessage =
    error?.message?.match(/\b(?:llm api (?:error|\u9519\u8bef)|http(?:\s+status)?)\s*:?\s*(\d{3})\b/i)?.[1] ??
    error?.message?.match(/\bstatus(?:\s*code)?\s*:?\s*(\d{3})\b/i)?.[1];
  const status = error?.status ?? statusFromMessage;
  if (status !== undefined && status !== null) {
    const statusCode = parseInt(String(status), 10);
    return [429, 500, 502, 503, 504, 529].includes(statusCode);
  }

  // Also check error message content
  const msg = String(error?.message ?? "").toLowerCase();
  return msg.includes("overloaded") || msg.includes("rate limit") || msg.includes("timeout");
}
