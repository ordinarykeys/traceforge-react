import type {
  KeyValueRow,
  TestAssertionResult,
} from "./requestTypes";

export type SandboxRequestContext = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  vars: Record<string, string>;
  setHeader: (key: string, value: string) => void;
  getHeader: (key: string) => string | undefined;
  setBody: (value: string) => void;
  getBody: () => string;
  setVar: (key: string, value: string) => void;
  getVar: (key: string) => string | undefined;
};

type SandboxResponseContext = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  time: number;
  size: number;
};

export function interpolateString(text: string, vars: KeyValueRow[]) {
  if (!text) {
    return text;
  }

  const varMap = new Map<string, string>();
  vars
    .filter((row) => row.enabled && row.key)
    .forEach((row) => varMap.set(row.key, row.value));

  return text.replace(/\{\{([\w.-]+)\}\}/g, (match, key) => {
    return varMap.get(key) ?? match;
  });
}

export function interpolateHeaders(headers: Record<string, string>, vars: KeyValueRow[]) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      interpolateString(key, vars),
      interpolateString(value, vars),
    ]),
  );
}

export function executePreRequestScript(
  script: string,
  requestContext: { url: string; method: string; headers: Record<string, string>; body: string },
  vars: KeyValueRow[],
) {
  if (!script.trim()) {
    return {
      url: requestContext.url,
      headers: requestContext.headers,
      body: requestContext.body,
      vars,
    };
  }

  const sandboxVars = Object.fromEntries(
    vars.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]),
  );

  const sandboxRequest: SandboxRequestContext = {
    url: requestContext.url,
    method: requestContext.method,
    headers: { ...requestContext.headers },
    body: requestContext.body,
    vars: { ...sandboxVars },
    setHeader: (key, value) => {
      sandboxRequest.headers[key] = value;
    },
    getHeader: (key) => sandboxRequest.headers[key],
    setBody: (value) => {
      sandboxRequest.body = value;
    },
    getBody: () => sandboxRequest.body,
    setVar: (key, value) => {
      sandboxRequest.vars[key] = value;
    },
    getVar: (key) => sandboxRequest.vars[key],
  };

  try {
    const execute = new Function("req", script);
    execute(sandboxRequest);
  } catch (error) {
    throw new Error(
      `前置脚本执行失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const nextVarMap = { ...sandboxRequest.vars };
  const nextVars = vars.map((row) => {
    if (row.key && Object.hasOwn(nextVarMap, row.key)) {
      const value = nextVarMap[row.key];
      delete nextVarMap[row.key];
      return { ...row, value };
    }

    return row;
  });

  Object.entries(nextVarMap).forEach(([key, value]) => {
    nextVars.push({
      key,
      value,
      description: "Added by script",
      enabled: true,
    });
  });

  return {
    url: sandboxRequest.url,
    headers: sandboxRequest.headers,
    body: sandboxRequest.body,
    vars: nextVars,
  };
}

function createExpect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`期望 ${String(expected)}，实际 ${String(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`期望等于 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected: unknown) {
      if (!(actual as { includes?: (value: unknown) => boolean })?.includes?.(expected)) {
        throw new Error(`期望包含 ${String(expected)}，但未找到`);
      }
    },
    toBeDefined() {
      if (typeof actual === "undefined") {
        throw new Error("期望值已定义，但得到 undefined");
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`期望小于 ${expected}，实际 ${String(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`期望大于 ${expected}，实际 ${String(actual)}`);
      }
    },
  };
}

export function executePostRequestAndTests(
  postScript: string,
  testsScript: string,
  requestContext: SandboxRequestContext,
  responseContext: Omit<SandboxResponseContext, "body"> & { body: string },
) {
  let parsedBody: unknown = responseContext.body;
  if ((responseContext.headers["content-type"] || "").includes("json")) {
    try {
      parsedBody = JSON.parse(responseContext.body);
    } catch {
      parsedBody = responseContext.body;
    }
  }

  const sandboxResponse: SandboxResponseContext = {
    ...responseContext,
    body: parsedBody,
  };

  const testResults: TestAssertionResult[] = [];

  const test = (name: string, execute: () => void) => {
    try {
      execute();
      testResults.push({ name, passed: true });
    } catch (error) {
      testResults.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (postScript.trim()) {
    try {
      const execute = new Function("req", "res", postScript);
      execute(requestContext, sandboxResponse);
    } catch (error) {
      testResults.push({
        name: "Post-request Script",
        passed: false,
        error: `后置脚本失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (testsScript.trim()) {
    try {
      const execute = new Function("req", "res", "expect", "test", testsScript);
      execute(requestContext, sandboxResponse, createExpect, test);
    } catch (error) {
      testResults.push({
        name: "Test Setup",
        passed: false,
        error: `测试编译或执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const nextVars: KeyValueRow[] = Object.entries(requestContext.vars).map(([key, value]) => ({
    key,
    value,
    description: "",
    enabled: true,
  }));

  return {
    vars: nextVars,
    testResults,
  };
}
