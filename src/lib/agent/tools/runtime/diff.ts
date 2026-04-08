import { splitLines } from "./workspace";

export function buildLineDiffPreview(
  previousContent: string,
  nextContent: string,
  maxLines = 120,
): { lines: string[]; added: number; removed: number; truncated: boolean } {
  const before = splitLines(previousContent);
  const after = splitLines(nextContent);
  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  const pushLine = (line: string) => {
    if (lines.length < maxLines) {
      lines.push(line);
    }
  };

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (i + 1 < before.length && before[i + 1] === after[j]) {
      removed += 1;
      pushLine(`-${before[i]}`);
      i += 1;
      continue;
    }

    if (j + 1 < after.length && before[i] === after[j + 1]) {
      added += 1;
      pushLine(`+${after[j]}`);
      j += 1;
      continue;
    }

    removed += 1;
    added += 1;
    pushLine(`-${before[i]}`);
    pushLine(`+${after[j]}`);
    i += 1;
    j += 1;
  }

  while (i < before.length) {
    removed += 1;
    pushLine(`-${before[i]}`);
    i += 1;
  }

  while (j < after.length) {
    added += 1;
    pushLine(`+${after[j]}`);
    j += 1;
  }

  const truncated = lines.length < added + removed;
  return { lines, added, removed, truncated };
}

