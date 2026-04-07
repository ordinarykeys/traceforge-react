import { useEffect, useMemo, useState } from "react";
import { runScriptControl } from "@/lib/scriptHost";
import { translate, type AppLocale } from "@/lib/i18n";

export type ExecuteMode = "local_preview" | "scriptcontrol";

export interface FunctionItem {
  name: string;
  line: number;
}

const ENTRY_FUNCTION_PATTERN =
  /(?:^WT_|(?:_|^)(?:encrypt|decrypt|encode|decode|sign|verify|run|pack)$)/i;

export const JS_LAB_STARTER = `function WT_Run(word) {
  console.log("run word =>", word);
  return word.split("").reverse().join("");
}

function WT_Pack(word, salt) {
  console.warn("packing =>", word, salt);
  return word + "::" + salt;
}`;

interface UseJsLabOptions {
  locale: AppLocale;
}

interface SandboxConsole {
  log: (...items: unknown[]) => void;
  warn: (...items: unknown[]) => void;
  error: (...items: unknown[]) => void;
}

function getLineByIndex(source: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

export function detectFunctionItems(source: string): FunctionItem[] {
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  ];

  const lookup = new Map<string, FunctionItem>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (!name) continue;
      const index = match.index ?? 0;
      const line = getLineByIndex(source, index);
      const prev = lookup.get(name);
      if (!prev || line < prev.line) {
        lookup.set(name, { name, line });
      }
    }
  }

  const items = [...lookup.values()].sort((a, b) => a.line - b.line);
  const entryItems = items.filter((item) => ENTRY_FUNCTION_PATTERN.test(item.name));
  return entryItems.length > 0 ? entryItems : items;
}

export function buildInvocationTemplate(functionName: string) {
  if (!functionName) return "";
  return `${functionName}(\n  ""\n)`;
}

export function parseInvocationText(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^([A-Za-z_$][\w$]*)\s*\((([\s\S]*))\)\s*;?$/);
  if (!match) {
    return null;
  }

  const functionName = match[1];
  const argsSource = (match[2] ?? "").trim();

  const args = argsSource.length > 0
    ? (new Function(`return [${argsSource}]`)() as unknown[])
    : [];

  if (!Array.isArray(args)) {
    return null;
  }

  return { functionName, args };
}

function serializeValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return JSON.stringify(value, null, 2);
}

export function useJsLab({ locale }: UseJsLabOptions) {
  const [sourceCode, setSourceCode] = useState(JS_LAB_STARTER);
  const [executeMode, setExecuteMode] = useState<ExecuteMode>("local_preview");
  const [selectedFunction, setSelectedFunction] = useState("WT_Run");
  const [invocationText, setInvocationText] = useState(buildInvocationTemplate("WT_Run"));
  const [executionOutput, setExecutionOutput] = useState("");
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [runError, setRunError] = useState("");
  const [hostLabel, setHostLabel] = useState(translate(locale, "jslab.host.local"));
  const [isRunning, setIsRunning] = useState(false);

  const functionItems = useMemo(() => detectFunctionItems(sourceCode), [sourceCode]);
  const sourceCharCount = sourceCode.length;
  const sourceLineCount = sourceCode.split("\n").length;

  useEffect(() => {
    if (!functionItems.some((item) => item.name === selectedFunction)) {
      const fallback = functionItems[0]?.name ?? "";
      setSelectedFunction(fallback);
      setInvocationText(buildInvocationTemplate(fallback));
    }
  }, [functionItems, selectedFunction]);

  useEffect(() => {
    if (executeMode === "local_preview") {
      setHostLabel(translate(locale, "jslab.host.local"));
    }
  }, [executeMode, locale]);

  const clearResult = () => {
    setExecutionOutput("");
    setExecutionLogs([]);
    setRunError("");
  };

  const loadStarter = () => {
    setSourceCode(JS_LAB_STARTER);
    setExecuteMode("local_preview");
    setSelectedFunction("WT_Run");
    setInvocationText(buildInvocationTemplate("WT_Run"));
    clearResult();
    setHostLabel(translate(locale, "jslab.host.local"));
  };

  const clearAll = () => {
    setSourceCode("");
    setSelectedFunction("");
    setInvocationText("");
    clearResult();
  };

  const copyResult = async () => {
    const payload = [
      hostLabel ? `[host] ${hostLabel}` : "",
      executionOutput ? `=> ${executionOutput}` : "",
      executionLogs.length > 0 ? executionLogs.join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
  };

  const createRuntimeFactory = () => {
    const exportEntries = functionItems
      .map((item) => `${JSON.stringify(item.name)}: typeof ${item.name} === "function" ? ${item.name} : undefined`)
      .join(",");

    return new Function(
      "console",
      `${sourceCode}\nreturn {${exportEntries}};`,
    ) as (consoleLike: SandboxConsole) => Record<string, (...args: unknown[]) => unknown>;
  };

  const execute = async () => {
    clearResult();
    setIsRunning(true);

    try {
      const parsed = parseInvocationText(invocationText);
      if (!parsed) {
        throw new Error(translate(locale, "jslab.error.callFormat"));
      }

      const { functionName, args } = parsed;
      if (selectedFunction && functionName !== selectedFunction) {
        setSelectedFunction(functionName);
      }

      const trace: string[] = [];
      trace.push(`> mode: ${executeMode}`);
      trace.push(`> invoke: ${functionName}(${args.map((arg) => serializeValue(arg)).join(", ")})`);

      if (executeMode === "scriptcontrol") {
        const response = await runScriptControl({
          sourceCode,
          functionName,
          args,
        });

        setHostLabel(response.host || translate(locale, "jslab.host.scriptcontrol"));

        if (response.logs.length > 0) {
          trace.push("--- console ---");
          trace.push(...response.logs);
        }

        if (!response.success) {
          throw new Error(response.error || translate(locale, "jslab.error.hostFailed"));
        }

        setExecutionOutput(response.result);
        trace.push("--- result ---");
        trace.push(serializeValue(response.result));
        setExecutionLogs(trace);
      } else {
        setHostLabel(translate(locale, "jslab.host.local"));
        const localLogs: string[] = [];
        const sandboxConsole: SandboxConsole = {
          log: (...items: unknown[]) => localLogs.push(items.map((item) => serializeValue(item)).join(" ")),
          warn: (...items: unknown[]) => localLogs.push(items.map((item) => serializeValue(item)).join(" ")),
          error: (...items: unknown[]) => localLogs.push(items.map((item) => serializeValue(item)).join(" ")),
        };

        const runtime = createRuntimeFactory()(sandboxConsole);
        const fn = runtime[functionName];
        if (typeof fn !== "function") {
          throw new Error(translate(locale, "jslab.error.fnNotFound"));
        }

        const result = await Promise.resolve(fn(...args));
        setExecutionOutput(serializeValue(result));

        if (localLogs.length > 0) {
          trace.push("--- console ---");
          trace.push(...localLogs);
        }

        trace.push("--- result ---");
        trace.push(serializeValue(result));
        setExecutionLogs(trace);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      setExecutionOutput("");
      setExecutionLogs([`[error] ${message}`]);
      throw error;
    } finally {
      setIsRunning(false);
    }
  };

  return {
    sourceCode,
    setSourceCode,
    executeMode,
    setExecuteMode,
    selectedFunction,
    setSelectedFunction,
    invocationText,
    setInvocationText,
    executionOutput,
    executionLogs,
    runError,
    hostLabel,
    isRunning,
    functionItems,
    sourceCharCount,
    sourceLineCount,
    execute,
    clearAll,
    clearResult,
    copyResult,
    loadStarter,
  };
}
