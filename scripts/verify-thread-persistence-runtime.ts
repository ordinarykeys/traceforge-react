import type { AgentMessage } from "../src/lib/agent/QueryEngine";
import {
  buildPersistedThreadStateFromPersisted,
  compactMessagesForPersistence,
  getMessageContentSnapshot,
  getMessagePersistenceSignature,
  getMessageStepsSnapshot,
  getPreviousArgsSnapshot,
  seedPersistedMessageCacheFromPersisted,
  type PersistedMessageCache,
} from "../src/lib/agent/threadPersistenceRuntime";
import { buildPreviousToolArgsLookup } from "../src/lib/agent/toolArgsHistoryRuntime";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. expected=${String(expected)} actual=${String(actual)}`);
  }
}

function buildMessage(id: string, content: string, report = "", withStep = false): AgentMessage {
  return {
    id,
    role: id.startsWith("u") ? "user" : "assistant",
    status: "completed",
    content,
    report,
    steps: withStep
      ? [
          {
            id: `${id}-step`,
            title: "run tool",
            status: "completed",
            logs: ["line-1", "line-2"],
            toolRender: {
              toolName: "Read",
              argsSummary: "path=/workspace/a.ts",
              callArguments: "{\"path\":\"/workspace/a.ts\"}",
              outcome: "success",
              outcomePreview: "preview line",
            },
          },
        ]
      : [],
  };
}

function verifyMessageSignatureDeterministic(): void {
  const message = buildMessage("a-1", "hello world", "report", true);
  const sameShape = structuredClone(message);
  const changed = { ...message, content: "hello world changed" };
  const changedLog = {
    ...message,
    steps: message.steps?.map((step) => ({ ...step, logs: [...step.logs, "line-3"] })),
  };

  const base = getMessagePersistenceSignature(message);
  assertEqual(
    base,
    getMessagePersistenceSignature(sameShape),
    "thread persistence signature should be stable for equivalent payload",
  );
  assert(
    base !== getMessagePersistenceSignature(changed),
    "thread persistence signature should change when content changes",
  );
  assert(
    base !== getMessagePersistenceSignature(changedLog),
    "thread persistence signature should change when tool logs change",
  );
}

function verifyCompactionCacheReuse(): void {
  const cache: PersistedMessageCache = new Map();
  const source = [
    buildMessage("u-1", "first input"),
    buildMessage("a-1", "assistant reply", "final report", true),
  ];
  const first = compactMessagesForPersistence(source, cache);
  const second = compactMessagesForPersistence(source, cache);
  assert(first[0] === second[0] && first[1] === second[1], "compaction should reuse cached compacted message references");

  const changedSource = [{ ...source[0], content: `${source[0].content} changed` }, source[1]];
  const third = compactMessagesForPersistence(changedSource, cache);
  assert(
    third[0] !== second[0] && third[1] === second[1],
    "compaction should invalidate only changed message cache entries",
  );
}

function verifyPayloadBudgetDeterministic(): void {
  const largeChunk = "x".repeat(36_000);
  const messages: AgentMessage[] = [];
  for (let index = 0; index < 18; index += 1) {
    messages.push(buildMessage(`a-${index}`, `msg-${index}:${largeChunk}:${index}`, `report-${index}:${largeChunk}`, true));
  }
  const compacted = compactMessagesForPersistence(messages);

  assertEqual(compacted.length, messages.length, "compaction should preserve message count");
  assert(
    compacted[0].content.length < messages[0].content.length,
    "compaction should prune older oversized messages under payload budget",
  );
  assert(
    compacted[0].content.includes("[persisted-pruned]") ||
      compacted[0].content.includes("[persisted-trimmed]"),
    "compaction should include deterministic prune marker when budget is exceeded",
  );
  const recent = compacted[compacted.length - 1];
  assert(
    recent.content.includes("msg-17") && recent.content.length > 5_000,
    "compaction should keep recent messages materially intact",
  );
}

function verifyThreadStateAndCacheSeedDeterministic(): void {
  const persisted = [
    buildMessage("u-1", "input"),
    buildMessage("a-1", "output", "report", true),
  ];
  const state = buildPersistedThreadStateFromPersisted(persisted);
  assertEqual(state.order.join(","), "u-1,a-1", "persisted state should keep deterministic message order");
  assertEqual(
    state.signatures["a-1"],
    getMessagePersistenceSignature(persisted[1]),
    "persisted state should store deterministic message signatures",
  );

  const cache: PersistedMessageCache = new Map();
  seedPersistedMessageCacheFromPersisted(persisted, cache);
  assertEqual(cache.size, 2, "cache seed should load every persisted message");
  assert(
    cache.get("a-1")?.signature === getMessagePersistenceSignature(persisted[1]),
    "cache seed should align signature with persistence signature runtime",
  );
}

function verifySnapshotHelpersDeterministic(): void {
  const message = buildMessage("a-2", "snapshot", "report", true);
  const contentSnapshot = getMessageContentSnapshot(message);
  const stepsSnapshot = getMessageStepsSnapshot(message);
  assert(
    contentSnapshot.startsWith("8:") && contentSnapshot.endsWith("snapshot"),
    "content snapshot should encode deterministic length/head/tail format",
  );
  assert(
    stepsSnapshot.includes("a-2-step:completed"),
    "steps snapshot should include deterministic step status markers",
  );

  const previousArgs = getPreviousArgsSnapshot({
    Write: "{\"path\":\"b.ts\"}",
    Read: "{\"path\":\"a.ts\"}",
  });
  assert(
    previousArgs.startsWith("Read:") && previousArgs.includes("|Write:"),
    "previous args snapshot should be sorted deterministically by tool name",
  );
}

function verifyToolArgsHistoryRuntimeDeterministic(): void {
  const emptyRecord: Record<string, string> = Object.freeze({});
  const baseMessages: AgentMessage[] = [
    buildMessage("u-1", "input"),
    buildMessage("a-1", "output-1", "report", true),
    buildMessage("a-2", "output-2", "report", true),
  ];
  const first = buildPreviousToolArgsLookup(baseMessages, 12, null, emptyRecord);
  const appended: AgentMessage[] = [...baseMessages, buildMessage("a-3", "output-3", "report", true)];
  const incremental = buildPreviousToolArgsLookup(appended, 12, first.snapshot, emptyRecord);
  const full = buildPreviousToolArgsLookup(appended, 12, null, emptyRecord);

  const incrementalEntries = [...incremental.lookup.entries()].map(([id, record]) => [id, JSON.stringify(record)]);
  const fullEntries = [...full.lookup.entries()].map(([id, record]) => [id, JSON.stringify(record)]);
  assertEqual(
    JSON.stringify(incrementalEntries),
    JSON.stringify(fullEntries),
    "tool args history runtime incremental path should match full recompute deterministically",
  );
  assert(
    incremental.lookup.get("a-3") !== undefined,
    "tool args history runtime should provide previous-tool-args snapshot for appended message",
  );

  const unchanged = buildPreviousToolArgsLookup(baseMessages, 12, first.snapshot, emptyRecord);
  assert(
    unchanged.lookup === first.lookup,
    "tool args history runtime should reuse lookup cache when window signatures are unchanged",
  );

  const inPlaceMutatedMessages = [...baseMessages];
  const inPlaceStep = inPlaceMutatedMessages[2].steps?.[0];
  if (inPlaceStep?.toolRender) {
    inPlaceStep.toolRender.callArguments = "{\"path\":\"/workspace/changed.ts\"}";
  }
  const incrementalAfterMutation = buildPreviousToolArgsLookup(
    inPlaceMutatedMessages,
    12,
    first.snapshot,
    emptyRecord,
  );
  const fullAfterMutation = buildPreviousToolArgsLookup(inPlaceMutatedMessages, 12, null, emptyRecord);
  const incrementalAfterMutationEntries = [...incrementalAfterMutation.lookup.entries()].map(([id, record]) => [
    id,
    JSON.stringify(record),
  ]);
  const fullAfterMutationEntries = [...fullAfterMutation.lookup.entries()].map(([id, record]) => [
    id,
    JSON.stringify(record),
  ]);
  assertEqual(
    JSON.stringify(incrementalAfterMutationEntries),
    JSON.stringify(fullAfterMutationEntries),
    "tool args history runtime incremental path should match full recompute after in-place message mutation",
  );
}

function main(): void {
  verifyMessageSignatureDeterministic();
  console.log("PASS runtime: thread persistence signature determinism");

  verifyCompactionCacheReuse();
  console.log("PASS runtime: thread persistence cache reuse");

  verifyPayloadBudgetDeterministic();
  console.log("PASS runtime: thread persistence payload budget pruning");

  verifyThreadStateAndCacheSeedDeterministic();
  console.log("PASS runtime: thread persistence state/cache seeding");

  verifySnapshotHelpersDeterministic();
  console.log("PASS runtime: thread persistence snapshot helpers");

  verifyToolArgsHistoryRuntimeDeterministic();
  console.log("PASS runtime: tool args history incremental determinism");

  console.log("All thread persistence runtime verification cases passed.");
}

main();
