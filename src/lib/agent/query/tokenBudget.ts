export interface BudgetTracker {
  continuationCount: number;
  lastDeltaTokens: number;
  lastGlobalTurnTokens: number;
  startedAt: number;
}

export interface TokenBudgetConfig {
  total: number;
}

type ContinueDecision = {
  action: "continue";
  nudgeMessage: string;
  continuationCount: number;
  pct: number;
  turnTokens: number;
  budget: number;
};

type StopDecision = {
  action: "stop";
  completionEvent: {
    continuationCount: number;
    pct: number;
    turnTokens: number;
    budget: number;
    diminishingReturns: boolean;
    durationMs: number;
  } | null;
};

export type TokenBudgetDecision = ContinueDecision | StopDecision;

const COMPLETION_THRESHOLD = 0.9;
const DIMINISHING_THRESHOLD = 300;

export function createBudgetTracker(): BudgetTracker {
  return {
    continuationCount: 0,
    lastDeltaTokens: 0,
    lastGlobalTurnTokens: 0,
    startedAt: Date.now(),
  };
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function checkTokenBudget(
  tracker: BudgetTracker,
  budget: TokenBudgetConfig | null | undefined,
  globalTurnTokens: number,
): TokenBudgetDecision {
  if (!budget || budget.total <= 0) {
    return { action: "stop", completionEvent: null };
  }

  const turnTokens = globalTurnTokens;
  const pct = Math.round((turnTokens / budget.total) * 100);
  const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens;
  const isDiminishing =
    tracker.continuationCount >= 3 &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD;

  if (!isDiminishing && turnTokens < budget.total * COMPLETION_THRESHOLD) {
    tracker.continuationCount++;
    tracker.lastDeltaTokens = deltaSinceLastCheck;
    tracker.lastGlobalTurnTokens = globalTurnTokens;
    return {
      action: "continue",
      nudgeMessage: `Continue directly. Keep working toward completion. Budget usage: ${pct}% (${turnTokens}/${budget.total} tokens est).`,
      continuationCount: tracker.continuationCount,
      pct,
      turnTokens,
      budget: budget.total,
    };
  }

  if (isDiminishing || tracker.continuationCount > 0) {
    return {
      action: "stop",
      completionEvent: {
        continuationCount: tracker.continuationCount,
        pct,
        turnTokens,
        budget: budget.total,
        diminishingReturns: isDiminishing,
        durationMs: Date.now() - tracker.startedAt,
      },
    };
  }

  return { action: "stop", completionEvent: null };
}

