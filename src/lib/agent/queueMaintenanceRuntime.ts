import type { QueuePriority, QueuedQueryItem } from "./QueryEngine";

export interface QueueDuplicateRemovalPlan {
  duplicateGroups: number;
  removeIds: string[];
}

export function getQueuePriorityRank(priority: QueuePriority): number {
  if (priority === "now") return 0;
  if (priority === "next") return 1;
  return 2;
}

export function normalizeQueueIntentFingerprint(query: string): string {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) {
    return normalized;
  }
  if (normalized.startsWith("/doctor queue investigate")) {
    const tokens = normalized.split(" ");
    const canonical = tokens.filter(
      (token) =>
        token === "/doctor" ||
        token === "queue" ||
        token === "investigate" ||
        token.startsWith("thread="),
    );
    return canonical.join(" ");
  }
  if (normalized.startsWith("/doctor fallback investigate")) {
    const tokens = normalized.split(" ");
    const canonical = tokens.filter(
      (token) =>
        token === "/doctor" ||
        token === "fallback" ||
        token === "investigate" ||
        token.startsWith("thread="),
    );
    return canonical.join(" ");
  }
  return normalized;
}

export function buildQueueCompactKey(item: QueuedQueryItem): string {
  return [
    normalizeQueueIntentFingerprint(item.query),
    item.model.trim(),
    item.permissionMode,
  ].join("::");
}

function groupQueuedQueriesByCompactKey(
  items: readonly QueuedQueryItem[],
): Map<string, QueuedQueryItem[]> {
  const grouped = new Map<string, QueuedQueryItem[]>();
  for (const item of items) {
    const key = buildQueueCompactKey(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }
  return grouped;
}

export function deriveCompactDuplicateRemovalPlan(
  items: readonly QueuedQueryItem[],
): QueueDuplicateRemovalPlan {
  const grouped = groupQueuedQueriesByCompactKey(items);
  const removeIds: string[] = [];
  let duplicateGroups = 0;
  for (const bucket of grouped.values()) {
    if (bucket.length <= 1) {
      continue;
    }
    duplicateGroups += 1;
    for (let index = 1; index < bucket.length; index += 1) {
      const duplicate = bucket[index];
      if (!duplicate) continue;
      removeIds.push(duplicate.id);
    }
  }
  return {
    duplicateGroups,
    removeIds,
  };
}

export function deriveHealDuplicateRemovalPlan(
  items: readonly QueuedQueryItem[],
): QueueDuplicateRemovalPlan {
  const grouped = groupQueuedQueriesByCompactKey(items);
  const removeIds: string[] = [];
  let duplicateGroups = 0;
  for (const bucket of grouped.values()) {
    if (bucket.length <= 1) {
      continue;
    }
    duplicateGroups += 1;
    const sorted = [...bucket].sort((left, right) => {
      const priorityDiff = getQueuePriorityRank(left.priority) - getQueuePriorityRank(right.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      if (left.queuedAt !== right.queuedAt) {
        return left.queuedAt - right.queuedAt;
      }
      return left.id.localeCompare(right.id);
    });
    for (let index = 1; index < sorted.length; index += 1) {
      const duplicate = sorted[index];
      if (!duplicate) continue;
      removeIds.push(duplicate.id);
    }
  }
  return {
    duplicateGroups,
    removeIds,
  };
}

export function deriveStaleQueuedQueryIds(options: {
  items: readonly QueuedQueryItem[];
  now: number;
  staleAgeMs: number;
}): string[] {
  const staleIds: string[] = [];
  for (const item of options.items) {
    if (options.now - item.queuedAt > options.staleAgeMs) {
      staleIds.push(item.id);
    }
  }
  return staleIds;
}
