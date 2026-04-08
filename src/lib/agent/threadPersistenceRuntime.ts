import type { AgentMessage, AgentStepData } from "@/lib/agent/QueryEngine";

export interface PersistedThreadState {
  order: string[];
  signatures: Record<string, string>;
}

export interface PersistedMessageCacheEntry {
  signature: string;
  compacted: AgentMessage;
  payloadSize: number;
}

export type PersistedMessageCache = Map<string, PersistedMessageCacheEntry>;

const SNAPSHOT_SAMPLE_SIZE = 32;
export const THREAD_AUTOSAVE_IDLE_MS = 1_200;
const PERSISTED_MESSAGE_CONTENT_LIMIT = 40_000;
const PERSISTED_REPORT_CONTENT_LIMIT = 16_000;
const PERSISTED_STEP_LOG_LINES_LIMIT = 180;
const PERSISTED_STEP_LOG_LINE_CHARS_LIMIT = 900;
const PERSISTED_TOOL_ARGS_CHARS_LIMIT = 8_000;
const PERSISTED_TOOL_PREVIEW_CHARS_LIMIT = 3_000;
const PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS = 280_000;
const PERSISTED_BUDGET_RECENT_MESSAGE_COUNT = 8;
const PERSISTED_BUDGET_OLD_MESSAGE_CONTENT_LIMIT = 4_500;
const PERSISTED_BUDGET_OLD_MESSAGE_REPORT_LIMIT = 1_400;
const PERSISTED_BUDGET_OLD_STEP_LOG_LINES_LIMIT = 60;
const PERSISTED_BUDGET_OLD_STEP_LOG_LINE_CHARS_LIMIT = 360;
const PERSISTED_BUDGET_OLD_TOOL_ARGS_CHARS_LIMIT = 1_800;
const PERSISTED_BUDGET_OLD_TOOL_PREVIEW_CHARS_LIMIT = 900;
const PERSISTED_BUDGET_HARD_MIN_CONTENT_LIMIT = 220;
const PERSISTED_BUDGET_HARD_MIN_REPORT_LIMIT = 120;
const PERSISTED_BUDGET_HARD_MIN_LOG_LINES = 8;
const PERSISTED_BUDGET_HARD_MIN_LOG_LINE_CHARS_LIMIT = 140;
const PERSISTED_BUDGET_HARD_MIN_TOOL_ARGS_CHARS_LIMIT = 420;
const PERSISTED_BUDGET_HARD_MIN_TOOL_PREVIEW_CHARS_LIMIT = 240;
const PERSISTED_BUDGET_MINIMAL_CONTENT = "[persisted-pruned]";
const PERSISTED_BUDGET_MINIMAL_REPORT = "[persisted-pruned-report]";

function summarizeText(value: string | undefined): string {
  if (!value) return "0";
  const head = value.slice(0, SNAPSHOT_SAMPLE_SIZE);
  const tail = value.slice(-SNAPSHOT_SAMPLE_SIZE);
  return `${value.length}:${head}:${tail}`;
}

function truncateForPersistence(value: string | undefined, maxChars: number): string {
  const text = value ?? "";
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const marker = "\n...[persisted-trimmed]...\n";
  const available = Math.max(16, maxChars - marker.length);
  const headLen = Math.max(8, Math.floor(available * 0.72));
  const tailLen = Math.max(8, available - headLen);
  return `${text.slice(0, headLen)}${marker}${text.slice(-tailLen)}`;
}

function compactStepForPersistence(step: AgentStepData): AgentStepData {
  const logs = (step.logs ?? [])
    .slice(-PERSISTED_STEP_LOG_LINES_LIMIT)
    .map((line) => truncateForPersistence(line, PERSISTED_STEP_LOG_LINE_CHARS_LIMIT));
  const toolRender = step.toolRender
    ? {
        ...step.toolRender,
        callArguments: truncateForPersistence(step.toolRender.callArguments, PERSISTED_TOOL_ARGS_CHARS_LIMIT),
        outcomePreview: truncateForPersistence(step.toolRender.outcomePreview, PERSISTED_TOOL_PREVIEW_CHARS_LIMIT),
      }
    : undefined;
  return {
    ...step,
    logs,
    toolRender,
  };
}

function compactMessageForPersistence(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: truncateForPersistence(message.content, PERSISTED_MESSAGE_CONTENT_LIMIT),
    report: truncateForPersistence(message.report, PERSISTED_REPORT_CONTENT_LIMIT),
    steps: message.steps?.map(compactStepForPersistence),
  };
}

function compactStepForBudget(
  step: AgentStepData,
  options: {
    logLinesLimit: number;
    lineCharsLimit: number;
    argsCharsLimit: number;
    previewCharsLimit: number;
  },
): AgentStepData {
  const logs = (step.logs ?? [])
    .slice(-Math.max(1, options.logLinesLimit))
    .map((line) => truncateForPersistence(line, Math.max(16, options.lineCharsLimit)));
  const toolRender = step.toolRender
    ? {
        ...step.toolRender,
        callArguments: truncateForPersistence(step.toolRender.callArguments, Math.max(24, options.argsCharsLimit)),
        outcomePreview: truncateForPersistence(step.toolRender.outcomePreview, Math.max(24, options.previewCharsLimit)),
      }
    : undefined;
  return {
    ...step,
    logs,
    toolRender,
  };
}

function compactMessageForBudget(
  message: AgentMessage,
  options: {
    contentLimit: number;
    reportLimit: number;
    logLinesLimit: number;
    lineCharsLimit: number;
    argsCharsLimit: number;
    previewCharsLimit: number;
  },
): AgentMessage {
  return {
    ...message,
    content: truncateForPersistence(message.content, Math.max(24, options.contentLimit)),
    report: truncateForPersistence(message.report, Math.max(24, options.reportLimit)),
    steps: message.steps?.map((step) =>
      compactStepForBudget(step, {
        logLinesLimit: options.logLinesLimit,
        lineCharsLimit: options.lineCharsLimit,
        argsCharsLimit: options.argsCharsLimit,
        previewCharsLimit: options.previewCharsLimit,
      }),
    ),
  };
}

function estimatePersistedMessagePayloadSize(message: AgentMessage): number {
  let total = 0;
  total += message.id.length;
  total += message.role.length;
  total += message.status?.length ?? 0;
  total += message.content?.length ?? 0;
  total += message.report?.length ?? 0;
  const steps = message.steps ?? [];
  for (const step of steps) {
    total += step.id.length + step.title.length + step.status.length;
    for (const line of step.logs ?? []) {
      total += line.length;
    }
    if (step.toolRender) {
      total += step.toolRender.toolName.length;
      total += step.toolRender.argsSummary.length;
      total += step.toolRender.callArguments?.length ?? 0;
      total += step.toolRender.outcome.length;
      total += step.toolRender.outcomePreview?.length ?? 0;
    }
  }
  return total;
}

export function compactMessagesForPersistence(
  messages: AgentMessage[],
  cache?: PersistedMessageCache,
): AgentMessage[] {
  const activeMessageIds = new Set<string>();
  const persisted = messages.map((message) => {
    activeMessageIds.add(message.id);
    const signature = getMessagePersistenceSignature(message);
    const cached = cache?.get(message.id);
    if (cached && cached.signature === signature) {
      return cached.compacted;
    }
    const compacted = compactMessageForPersistence(message);
    const payloadSize = estimatePersistedMessagePayloadSize(compacted);
    cache?.set(message.id, {
      signature,
      compacted,
      payloadSize,
    });
    return compacted;
  });

  if (cache) {
    for (const cachedMessageId of cache.keys()) {
      if (!activeMessageIds.has(cachedMessageId)) {
        cache.delete(cachedMessageId);
      }
    }
  }

  let totalSize = 0;
  for (const message of persisted) {
    const cached = cache?.get(message.id);
    if (cached && cached.compacted === message) {
      totalSize += cached.payloadSize;
      continue;
    }
    totalSize += estimatePersistedMessagePayloadSize(message);
  }
  if (totalSize <= PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS) {
    return persisted;
  }

  const budgetProtectedStart = Math.max(0, persisted.length - PERSISTED_BUDGET_RECENT_MESSAGE_COUNT);
  for (let index = 0; index < budgetProtectedStart && totalSize > PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS; index += 1) {
    const current = persisted[index];
    const tightened = compactMessageForBudget(current, {
      contentLimit: PERSISTED_BUDGET_OLD_MESSAGE_CONTENT_LIMIT,
      reportLimit: PERSISTED_BUDGET_OLD_MESSAGE_REPORT_LIMIT,
      logLinesLimit: PERSISTED_BUDGET_OLD_STEP_LOG_LINES_LIMIT,
      lineCharsLimit: PERSISTED_BUDGET_OLD_STEP_LOG_LINE_CHARS_LIMIT,
      argsCharsLimit: PERSISTED_BUDGET_OLD_TOOL_ARGS_CHARS_LIMIT,
      previewCharsLimit: PERSISTED_BUDGET_OLD_TOOL_PREVIEW_CHARS_LIMIT,
    });
    const delta = estimatePersistedMessagePayloadSize(current) - estimatePersistedMessagePayloadSize(tightened);
    if (delta > 0) {
      persisted[index] = tightened;
      totalSize -= delta;
    }
  }

  if (totalSize <= PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS) {
    return persisted;
  }

  for (let index = 0; index < budgetProtectedStart && totalSize > PERSISTED_THREAD_PAYLOAD_BUDGET_CHARS; index += 1) {
    const current = persisted[index];
    const hardened = compactMessageForBudget(current, {
      contentLimit: PERSISTED_BUDGET_HARD_MIN_CONTENT_LIMIT,
      reportLimit: PERSISTED_BUDGET_HARD_MIN_REPORT_LIMIT,
      logLinesLimit: PERSISTED_BUDGET_HARD_MIN_LOG_LINES,
      lineCharsLimit: PERSISTED_BUDGET_HARD_MIN_LOG_LINE_CHARS_LIMIT,
      argsCharsLimit: PERSISTED_BUDGET_HARD_MIN_TOOL_ARGS_CHARS_LIMIT,
      previewCharsLimit: PERSISTED_BUDGET_HARD_MIN_TOOL_PREVIEW_CHARS_LIMIT,
    });
    const minimal: AgentMessage = {
      ...hardened,
      content: hardened.content ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
      report: hardened.report ? PERSISTED_BUDGET_MINIMAL_REPORT : "",
      steps: hardened.steps?.map((step) => ({
        ...step,
        logs: step.logs.length > 0 ? [PERSISTED_BUDGET_MINIMAL_CONTENT] : [],
        toolRender: step.toolRender
          ? {
              ...step.toolRender,
              callArguments: step.toolRender.callArguments ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
              outcomePreview: step.toolRender.outcomePreview ? PERSISTED_BUDGET_MINIMAL_CONTENT : "",
            }
          : undefined,
      })),
    };
    const delta = estimatePersistedMessagePayloadSize(current) - estimatePersistedMessagePayloadSize(minimal);
    if (delta > 0) {
      persisted[index] = minimal;
      totalSize -= delta;
    }
  }

  return persisted;
}

export function getMessageContentSnapshot(message: AgentMessage): string {
  return summarizeText(message.content);
}

export function getPreviousArgsSnapshot(previousCallArgsByTool: Record<string, string>): string {
  const entries = Object.entries(previousCallArgsByTool);
  if (entries.length === 0) return "";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, args]) => `${tool}:${summarizeText(args)}`)
    .join("|");
}

export function getMessageStepsSnapshot(message: AgentMessage): string {
  if (!message.steps || message.steps.length === 0) {
    return "";
  }

  return message.steps
    .map((step) => {
      const toolSnapshot = step.toolRender
        ? `${step.toolRender.toolName}:${step.toolRender.outcome}:${summarizeText(step.toolRender.outcomePreview)}`
        : "";
      const lastLog = step.logs.length > 0 ? step.logs[step.logs.length - 1] : "";
      return `${step.id}:${step.status}:${step.logs.length}:${summarizeText(lastLog)}:${toolSnapshot}`;
    })
    .join("|");
}

export function getMessagePersistenceSignature(message: AgentMessage): string {
  const stepSnapshot = getMessageStepsSnapshot(message);
  return [
    message.id,
    message.role,
    message.status ?? "",
    summarizeText(message.content),
    summarizeText(message.report),
    stepSnapshot,
  ].join("#");
}

export function buildPersistedThreadStateFromPersisted(messages: AgentMessage[]): PersistedThreadState {
  const order: string[] = [];
  const signatures: Record<string, string> = {};
  for (const message of messages) {
    order.push(message.id);
    signatures[message.id] = getMessagePersistenceSignature(message);
  }
  return { order, signatures };
}

export function seedPersistedMessageCacheFromPersisted(
  messages: AgentMessage[],
  cache: PersistedMessageCache,
): void {
  cache.clear();
  for (const message of messages) {
    cache.set(message.id, {
      signature: getMessagePersistenceSignature(message),
      compacted: message,
      payloadSize: estimatePersistedMessagePayloadSize(message),
    });
  }
}
