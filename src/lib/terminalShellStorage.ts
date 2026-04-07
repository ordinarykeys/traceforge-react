import {
  canUseNativePersistence,
  loadPersistentEntries,
  savePersistentEntries,
} from "@/lib/persistence";

export type TerminalShellType = "powershell" | "cmd";

const SHELL_STORAGE_KEY = "traceforge.terminal.shell";
const LEGACY_SHELL_KEY = "tf-terminal-shell";
const SHELL_CHANGED_EVENT = "traceforge:terminal-shell-changed";

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeShell(value: string | null | undefined): TerminalShellType {
  return value === "cmd" ? "cmd" : "powershell";
}

function emitShellChanged(shell: TerminalShellType) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TerminalShellType>(SHELL_CHANGED_EVENT, {
      detail: shell,
    }),
  );
}

export async function loadTerminalShellType(): Promise<TerminalShellType> {
  if (canUseNativePersistence()) {
    const entries = await loadPersistentEntries([SHELL_STORAGE_KEY]);
    const nativeValue = entries[SHELL_STORAGE_KEY];
    if (nativeValue) {
      const shell = normalizeShell(nativeValue);
      if (hasWindowStorage()) {
        window.localStorage.setItem(LEGACY_SHELL_KEY, shell);
      }
      return shell;
    }
  }

  return normalizeShell(hasWindowStorage() ? window.localStorage.getItem(LEGACY_SHELL_KEY) : null);
}

export async function saveTerminalShellType(shell: TerminalShellType) {
  if (hasWindowStorage()) {
    window.localStorage.setItem(LEGACY_SHELL_KEY, shell);
  }

  if (canUseNativePersistence()) {
    await savePersistentEntries([{ key: SHELL_STORAGE_KEY, value: shell }]);
  }

  emitShellChanged(shell);
}

export function getTerminalShellChangedEventName() {
  return SHELL_CHANGED_EVENT;
}

