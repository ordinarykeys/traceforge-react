import { computed, ref, watch } from "vue";

import { runScriptControl } from "@/lib/scriptHost";

export type ExecuteMode = "local_preview" | "scriptcontrol";

const ENTRY_FUNCTION_PATTERN =
  /(?:^WT_|(?:_|^)(?:encrypt|decrypt|encode|decode|sign|verify|run|pack)$)/i;

const starter = `function WT_Run(word) {
  console.log("run word =>", word);
  return word.split("").reverse().join("");
}

function WT_Pack(word, salt) {
  console.warn("packing =>", word, salt);
  return word + "::" + salt;
}`;

export function useJsLab() {
  const sourceCode = ref(starter);
  const executeMode = ref<ExecuteMode>("local_preview");
  const selectedFunction = ref("WT_Run");
  const argsText = ref('["hello"]');
  const output = ref("");
  const logs = ref<string[]>([]);
  const runError = ref("");
  const hostLabel = ref("浏览器本地预览");
  const isRunning = ref(false);

  const detectedFunctions = computed(() => detectFunctions(sourceCode.value));
  const sourceCharCount = computed(() => sourceCode.value.length);
  const sourceLineCount = computed(() => sourceCode.value.split("\n").length);

  watch(
    detectedFunctions,
    (functions) => {
      if (!functions.includes(selectedFunction.value)) {
        selectedFunction.value = functions[0] ?? "";
      }
    },
    { immediate: true },
  );

  function loadStarter() {
    sourceCode.value = starter;
    argsText.value = '["hello"]';
    output.value = "";
    logs.value = [];
    runError.value = "";
    hostLabel.value = "浏览器本地预览";
    executeMode.value = "local_preview";
  }

  function clearAll() {
    sourceCode.value = "";
    argsText.value = "[]";
    output.value = "";
    logs.value = [];
    runError.value = "";
  }

  function clearResult() {
    output.value = "";
    logs.value = [];
    runError.value = "";
  }

  async function copySource() {
    await navigator.clipboard.writeText(sourceCode.value);
  }

  async function copyResult() {
    if (!output.value) {
      return;
    }

    await navigator.clipboard.writeText(output.value);
  }

  async function execute() {
    clearResult();
    isRunning.value = true;

    try {
      if (!selectedFunction.value) {
        throw new Error("没有可执行的函数。");
      }

      const parsedArgs = parseArguments(argsText.value);
      if (executeMode.value === "scriptcontrol") {
        await executeScriptControl({
          sourceCode: sourceCode.value,
          functionName: selectedFunction.value,
          args: parsedArgs,
          logs,
          output,
          hostLabel,
        });
      } else {
        await executeLocal({
          sourceCode: sourceCode.value,
          detectedFunctions: detectedFunctions.value,
          functionName: selectedFunction.value,
          args: parsedArgs,
          logs,
          output,
          hostLabel,
        });
      }
    } catch (error) {
      runError.value = error instanceof Error ? error.message : String(error);
      if (logs.value.length > 0 && !output.value) {
        output.value = logs.value.join("\n");
      }
    } finally {
      isRunning.value = false;
    }
  }

  return {
    argsText,
    clearAll,
    clearResult,
    copyResult,
    copySource,
    detectedFunctions,
    execute,
    executeMode,
    hostLabel,
    isRunning,
    loadStarter,
    logs,
    output,
    runError,
    selectedFunction,
    sourceCharCount,
    sourceCode,
    sourceLineCount,
  };
}

function detectFunctions(source: string) {
  const names = new Set<string>();
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
  }

  const allFunctions = [...names];
  const entryFunctions = allFunctions.filter((name) => isEntryFunction(name));

  return entryFunctions.length > 0 ? entryFunctions : allFunctions;
}

function isEntryFunction(name: string) {
  return ENTRY_FUNCTION_PATTERN.test(name);
}

function serializeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function parseArguments(rawArgs: string) {
  const parsedArgs = JSON.parse(rawArgs) as unknown[];
  if (!Array.isArray(parsedArgs)) {
    throw new Error('参数必须是 JSON 数组，例如 ["hello"]。');
  }
  return parsedArgs;
}

async function executeLocal(options: {
  sourceCode: string;
  detectedFunctions: string[];
  functionName: string;
  args: unknown[];
  logs: { value: string[] };
  output: { value: string };
  hostLabel: { value: string };
}) {
  const sandboxConsole = {
    log: (...items: unknown[]) => {
      options.logs.value.push(items.map((item) => serializeValue(item)).join(" "));
    },
    warn: (...items: unknown[]) => {
      options.logs.value.push(items.map((item) => serializeValue(item)).join(" "));
    },
    error: (...items: unknown[]) => {
      options.logs.value.push(items.map((item) => serializeValue(item)).join(" "));
    },
  };

  const functionExports = options.detectedFunctions
    .map((name) => `${JSON.stringify(name)}: typeof ${name} === "function" ? ${name} : undefined`)
    .join(",");

  const createRuntime = new Function(
    "console",
    `${options.sourceCode}\nreturn {${functionExports}};`,
  ) as (
    consoleLike: typeof sandboxConsole,
  ) => Record<string, (...args: unknown[]) => unknown>;

  const runtime = createRuntime(sandboxConsole);
  const current = runtime[options.functionName];

  if (typeof current !== "function") {
    throw new Error(`函数 ${options.functionName} 未找到。`);
  }

  options.hostLabel.value = "浏览器本地预览";
  const result = await Promise.resolve(current(...options.args));
  options.output.value = [
    options.logs.value.length ? options.logs.value.join("\n") : "",
    result !== undefined ? `=> ${serializeValue(result)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function executeScriptControl(options: {
  sourceCode: string;
  functionName: string;
  args: unknown[];
  logs: { value: string[] };
  output: { value: string };
  hostLabel: { value: string };
}) {
  const response = await runScriptControl({
    sourceCode: options.sourceCode,
    functionName: options.functionName,
    args: options.args,
  });

  options.hostLabel.value = response.host;
  options.logs.value = response.logs;
  options.output.value = [
    response.logs.length ? response.logs.join("\n") : "",
    response.success ? `=> ${response.result}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!response.success) {
    throw new Error(response.error || "ScriptControl 执行失败。");
  }
}
