import type { AgentMessage } from "@/lib/agent/QueryEngine";

export interface ToolArgsHistorySnapshot {
  startIndex: number;
  windowMessages: AgentMessage[];
  windowSignatures: string[];
  lookup: Map<string, Record<string, string>>;
  rolling: Map<string, string>;
  rollingRecord: Record<string, string>;
}

const TOOL_ARGS_SIGNATURE_TEXT_SAMPLE_CHARS = 48;
const HASH_FNV_OFFSET_BASIS = 2166136261;
const HASH_FNV_PRIME = 16777619;

function mixSignatureHash(hash: number, value: string): number {
  let next = hash >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, HASH_FNV_PRIME);
    next >>>= 0;
  }
  return next;
}

function mixSignatureNumber(hash: number, value: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
  let next = (hash ^ normalized) >>> 0;
  next = Math.imul(next, HASH_FNV_PRIME);
  return next >>> 0;
}

function sampleSignatureText(value: string | undefined): string {
  if (!value) {
    return "0";
  }
  const maxChars = TOOL_ARGS_SIGNATURE_TEXT_SAMPLE_CHARS;
  const midIndex = Math.floor(value.length / 2);
  const midCode = value.charCodeAt(midIndex) || 0;
  const head = value.slice(0, maxChars);
  const tail = value.slice(-maxChars);
  return `${value.length}:${midCode}:${head}:${tail}`;
}

function computeToolArgsMessageSignature(message: AgentMessage): string {
  let hash = HASH_FNV_OFFSET_BASIS;
  hash = mixSignatureHash(hash, message.id);
  const steps = message.steps ?? [];
  hash = mixSignatureNumber(hash, steps.length);
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    hash = mixSignatureHash(hash, step.id);
    hash = mixSignatureHash(hash, step.toolRender?.toolName ?? "");
    hash = mixSignatureHash(hash, sampleSignatureText(step.toolRender?.callArguments));
  }
  return `${steps.length}:${hash.toString(16)}`;
}

function computeWindowSignatures(windowMessages: AgentMessage[]): string[] {
  return windowMessages.map((message) => computeToolArgsMessageSignature(message));
}

function getIncrementalStartIndex(
  cache: ToolArgsHistorySnapshot | null,
  startIndex: number,
  nextWindowSignatures: string[],
  nextWindowMessages: AgentMessage[],
): number | null {
  if (!cache) return null;
  if (cache.startIndex !== startIndex) return null;
  if (cache.windowMessages.length > nextWindowMessages.length) return null;

  const sharedLength = cache.windowMessages.length;
  for (let index = 0; index < sharedLength; index += 1) {
    if (cache.windowSignatures[index] !== nextWindowSignatures[index]) {
      return index;
    }
  }
  return sharedLength;
}

function applyMessageStepsToRolling(
  message: AgentMessage,
  rolling: Map<string, string>,
  rollingRecord: Record<string, string>,
  emptyRecord: Record<string, string>,
): Record<string, string> {
  if (!message.steps || message.steps.length === 0) {
    return rollingRecord;
  }
  let changed = false;
  for (const step of message.steps) {
    const toolName = step.toolRender?.toolName;
    const callArgs = step.toolRender?.callArguments;
    if (!toolName || !callArgs) continue;
    if (rolling.get(toolName) === callArgs) continue;
    rolling.set(toolName, callArgs);
    changed = true;
  }
  if (!changed) {
    return rollingRecord;
  }
  return rolling.size === 0 ? emptyRecord : Object.fromEntries(rolling.entries());
}

export function buildPreviousToolArgsLookup(
  messages: AgentMessage[],
  scanWindow: number,
  cache: ToolArgsHistorySnapshot | null,
  emptyRecord: Record<string, string>,
): { lookup: Map<string, Record<string, string>>; snapshot: ToolArgsHistorySnapshot } {
  const startIndex = Math.max(0, messages.length - Math.max(1, scanWindow));
  const windowMessages = messages.slice(startIndex);
  const windowSignatures = computeWindowSignatures(windowMessages);
  const incrementalStartIndex = getIncrementalStartIndex(
    cache,
    startIndex,
    windowSignatures,
    windowMessages,
  );

  if (cache && incrementalStartIndex !== null) {
    if (
      incrementalStartIndex === windowMessages.length &&
      cache.windowMessages.length === windowMessages.length
    ) {
      return { lookup: cache.lookup, snapshot: cache };
    }

    const lookup = new Map<string, Record<string, string>>();
    const sharedLength = Math.min(cache.windowMessages.length, windowMessages.length);
    const safeStartIndex = Math.min(Math.max(incrementalStartIndex, 0), sharedLength);

    for (let index = 0; index < safeStartIndex; index += 1) {
      const previousMessageId = cache.windowMessages[index]?.id;
      const nextMessageId = windowMessages[index]?.id;
      if (!previousMessageId || !nextMessageId) continue;
      const previousRecord = cache.lookup.get(previousMessageId) ?? emptyRecord;
      lookup.set(nextMessageId, previousRecord);
    }

    let rolling: Map<string, string>;
    let rollingRecord: Record<string, string>;
    if (safeStartIndex >= cache.windowMessages.length) {
      rolling = new Map(cache.rolling);
      rollingRecord = cache.rollingRecord;
    } else {
      const seedMessageId = cache.windowMessages[safeStartIndex]?.id;
      rollingRecord = (seedMessageId ? cache.lookup.get(seedMessageId) : null) ?? emptyRecord;
      rolling = new Map(Object.entries(rollingRecord));
    }

    for (let index = safeStartIndex; index < windowMessages.length; index += 1) {
      const message = windowMessages[index];
      lookup.set(message.id, rollingRecord);
      rollingRecord = applyMessageStepsToRolling(message, rolling, rollingRecord, emptyRecord);
    }

    const snapshot: ToolArgsHistorySnapshot = {
      startIndex,
      windowMessages,
      windowSignatures,
      lookup,
      rolling,
      rollingRecord,
    };
    return { lookup, snapshot };
  }

  const lookup = new Map<string, Record<string, string>>();
  const rolling = new Map<string, string>();
  let rollingRecord: Record<string, string> = emptyRecord;

  for (const message of windowMessages) {
    lookup.set(message.id, rollingRecord);
    rollingRecord = applyMessageStepsToRolling(message, rolling, rollingRecord, emptyRecord);
  }

  const snapshot: ToolArgsHistorySnapshot = {
    startIndex,
    windowMessages,
    windowSignatures,
    lookup,
    rolling,
    rollingRecord,
  };
  return { lookup, snapshot };
}
