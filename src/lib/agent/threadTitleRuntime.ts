export const THREAD_TITLE_MAX_LEN = 16;

export function compactThreadTitle(value: string, maxLen = THREAD_TITLE_MAX_LEN): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLen) {
    return normalized;
  }
  const breakpoints = [
    normalized.lastIndexOf(" ", maxLen),
    normalized.lastIndexOf("\uFF0C", maxLen),
    normalized.lastIndexOf(",", maxLen),
    normalized.lastIndexOf("\u3002", maxLen),
    normalized.lastIndexOf("\uFF1A", maxLen),
    normalized.lastIndexOf(":", maxLen),
    normalized.lastIndexOf("-", maxLen),
    normalized.lastIndexOf("_", maxLen),
  ].filter((index) => index >= 8);
  const cut = breakpoints.length > 0 ? Math.max(...breakpoints) : maxLen;
  return `${normalized.slice(0, cut).trim()}...`;
}

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function summarizeSlashCommandTitle(input: string): string | null {
  const tokens = input
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0 || !tokens[0].startsWith("/")) {
    return null;
  }
  const command = tokens[0].replace(/^\/+/, "").toLowerCase();
  const second = (tokens[1] ?? "").toLowerCase();
  const third = (tokens[2] ?? "").toLowerCase();

  if (command === "doctor" && second === "queue" && third === "investigate") return "Queue Investigate";
  if (command === "doctor" && second === "fallback" && third === "investigate") return "Fallback Investigate";
  if (command === "doctor" && second === "recover" && third === "investigate") return "Recover Investigate";
  if (command === "queue" && second === "heal") return "Queue Heal";
  if (command === "recover" && second === "resume") return "Recover Resume";
  if (command === "recover" && second === "execute") return "Recover Execute";
  if (command === "recover" && second === "auto") return "Recover Auto";
  if (command === "recover" && second === "plan") return "Recover Plan";
  if (command === "trace" && second === "summary") return "Trace Summary";
  if (command === "trace" && second === "hotspots") return "Trace Hotspots";
  if (command === "trace" && second === "investigate") return "Trace Investigate";
  if (command === "trace" && second === "list") return "Trace List";
  if (command === "prompt" && second === "export") return "Prompt Export";
  if (command === "status") return "Status";

  const cleaned = tokens
    .filter((_, index) => index <= 2)
    .filter((token) => !token.startsWith("--") && !token.includes("="))
    .map((token, index) => {
      if (index === 0) return token.replace(/^\/+/, "");
      return token;
    })
    .map((token) => titleCaseWord(token));
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.join(" ");
}

export function detectThreadActionLabel(text: string): string | null {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  if (/(\u4fee\u590d|\u6392\u67e5|bug|fix)/i.test(text)) return hasCjk ? "\u4fee\u590d" : "Fix";
  if (/(\u4f18\u5316|\u6027\u80fd|\u5361\u987f|performance|optimi[sz]e|lag)/i.test(text)) return hasCjk ? "\u4f18\u5316" : "Optimize";
  if (/(\u767b\u5f55|\u9000\u51fa\u767b\u5f55|login|logout|auth)/i.test(text)) return hasCjk ? "\u767b\u5f55" : "Auth";
  if (/(\u591a\u8bed\u8a00|i18n|locale|\u7ffb\u8bd1|\u4e2d\u82f1\u6587)/i.test(text)) return hasCjk ? "\u591a\u8bed\u8a00" : "i18n";
  if (/(\u5de5\u4f5c\u533a|workspace|\u7ebf\u7a0b|thread)/i.test(text)) return hasCjk ? "\u5de5\u4f5c\u533a" : "Workspace";
  if (/(git|\u5206\u652f|\u63d0\u4ea4|commit|revert|checkout)/i.test(text)) return "Git";
  if (/(\u66f4\u65b0|\u5347\u7ea7|updater|release|\u53d1\u5e03|\u6253\u5305)/i.test(text)) return hasCjk ? "\u66f4\u65b0" : "Release";
  if (/(\u754c\u9762|ui|layout|sidebar|panel|\u6837\u5f0f)/i.test(text)) return hasCjk ? "\u754c\u9762" : "UI";
  if (/(\u63a5\u53e3|api|fetch|\u7f51\u7edc|request)/i.test(text)) return hasCjk ? "\u63a5\u53e3" : "API";
  return null;
}

export function extractThreadTopicLabel(text: string): string | null {
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[`\"'()[\]{}<>]/g, " ")
    .replace(/[^\w\u4e00-\u9fff\s\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const stopWords = new Set([
    "please",
    "pls",
    "can",
    "you",
    "could",
    "would",
    "help",
    "me",
    "this",
    "that",
    "with",
    "for",
    "and",
    "the",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "at",
    "my",
    "project",
    "issue",
    "problem",
    "continue",
    "still",
    "again",
    "traceforge",
    "lumo",
    "coding",
  ]);

  const actionNoise = new Set([
    "\u4fee\u590d",
    "\u4f18\u5316",
    "\u767b\u5f55",
    "\u591a\u8bed\u8a00",
    "\u5de5\u4f5c\u533a",
    "\u66f4\u65b0",
    "\u754c\u9762",
    "\u63a5\u53e3",
    "fix",
    "optimize",
    "login",
    "workspace",
    "thread",
    "update",
    "ui",
    "api",
    "git",
  ]);

  const seen = new Set<string>();
  const tokens = cleaned.match(/[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  const picked: string[] = [];
  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (stopWords.has(lowered) || actionNoise.has(lowered) || actionNoise.has(token)) {
      continue;
    }
    if (seen.has(lowered)) {
      continue;
    }
    seen.add(lowered);
    picked.push(token);
    if (picked.length >= 2) {
      break;
    }
  }
  if (picked.length === 0) {
    return null;
  }
  return picked.join(" ");
}

export function deriveThreadNameFromQuery(query: string, fallback: string): string {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;

  const slashSummary = summarizeSlashCommandTitle(normalized);
  if (slashSummary) {
    return compactThreadTitle(slashSummary);
  }

  const clauses = normalized
    .split(/[\r\n]+|[.!?;:,]+|[\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const leadingNoise =
    /^(?:please|pls|can you|could you|help me|i(?:\s+want|\s+need|\s+would like|\s+hope)?\s+to|\u8BF7|\u9EBB\u70E6|\u5E2E\u6211|\u6211(?:\u60F3|\u8981|\u9700\u8981|\u5E0C\u671B|\u5148)?|\u53EF\u4EE5|\u80FD\u4E0D\u80FD|\u7EE7\u7EED)\s*/i;

  const keywordPattern =
    /(\u4fee\u590d|\u4f18\u5316|\u8c03\u6574|\u5b9e\u73b0|\u652f\u6301|\u767b\u5f55|\u7ebf\u7a0b|\u5de5\u4f5c\u533a|\u66f4\u65b0|\u591a\u8bed\u8a00|\u4ed3\u5e93|git|ui|theme|bug|fix|optimi[sz]e|login|thread|workspace|sidebar|diff|panel|performance)/ig;

  const pickBestClause = () => {
    if (clauses.length === 0) return normalized;
    let best = clauses[0];
    let bestScore = -1;
    for (const clause of clauses) {
      const hits = clause.match(keywordPattern)?.length ?? 0;
      const score = hits * 10 + Math.min(clause.length, 40) / 10;
      if (score > bestScore) {
        best = clause;
        bestScore = score;
      }
    }
    return best;
  };

  let candidate = pickBestClause()
    .replace(/^[\-\s:,.!?\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A]+/g, "")
    .replace(/^[`\"']+|[`\"']+$/g, "")
    .trim();

  let previous = "";
  while (candidate && candidate !== previous) {
    previous = candidate;
    candidate = candidate.replace(leadingNoise, "").trim();
  }

  if (!candidate) {
    candidate = normalized;
  }

  const actionLabel = detectThreadActionLabel(candidate);
  const topicLabel = extractThreadTopicLabel(candidate);
  const semanticTitle = (() => {
    if (actionLabel && topicLabel) return `${actionLabel} ${topicLabel}`;
    if (actionLabel) return actionLabel;
    if (topicLabel) return topicLabel;
    return candidate;
  })();
  return compactThreadTitle(semanticTitle || fallback);
}

