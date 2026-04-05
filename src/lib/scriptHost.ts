import { invoke } from "@tauri-apps/api/core";

export type ScriptControlRunRequest = {
  sourceCode: string;
  functionName: string;
  args: unknown[];
};

export type ScriptControlRunResponse = {
  success: boolean;
  result: string;
  logs: string[];
  error: string;
  engine: string;
  host: string;
};

export function runScriptControl(request: ScriptControlRunRequest) {
  return invoke<ScriptControlRunResponse>("run_scriptcontrol", {
    request: {
      source_code: request.sourceCode,
      function_name: request.functionName,
      args: request.args,
    },
  });
}
