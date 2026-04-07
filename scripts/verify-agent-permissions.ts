import { z } from "zod";
import type { Tool } from "../src/lib/agent/types";
import { decideToolPermission } from "../src/lib/agent/permissions/toolPermissions";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function mockTool(name: string, isReadOnly: boolean): Tool {
  return {
    name,
    description: `mock ${name}`,
    inputSchema: z.any(),
    isReadOnly,
    call: async () => "",
  };
}

function verifyNoWorkspaceRequiresConfirmation() {
  const decision = decideToolPermission({
    tool: mockTool("file_read", true),
    input: { path: "src/App.tsx" },
    mode: "default",
    rules: [],
    workingDir: undefined,
    additionalWorkingDirectories: [],
  });

  assert(decision.behavior === "ask", "no-workspace action should require confirmation");
  assert(decision.riskClass === "path_outside", "no-workspace action should classify as path_outside");
}

function verifyRelativePathAllowedWithinWorkspace() {
  const decision = decideToolPermission({
    tool: mockTool("file_read", true),
    input: { path: "src/App.tsx" },
    mode: "default",
    rules: [],
    workingDir: "C:/repo/project",
    additionalWorkingDirectories: [],
  });

  assert(decision.behavior === "allow", "workspace-relative read should be allowed");
}

function verifyShellParentTraversalRequiresConfirmation() {
  const decision = decideToolPermission({
    tool: mockTool("shell", false),
    input: {
      cmd: "rg",
      args: ["TODO", "../"],
      cwd: "C:/repo/project",
    },
    mode: "default",
    rules: [],
    workingDir: "C:/repo/project",
    additionalWorkingDirectories: [],
  });

  assert(decision.behavior === "ask", "shell parent traversal should require confirmation");
  assert(decision.riskClass === "path_outside", "shell parent traversal should be path_outside risk");
}

function verifyShellAbsoluteOutsideRequiresConfirmation() {
  const decision = decideToolPermission({
    tool: mockTool("shell", false),
    input: {
      cmd: "cat",
      args: ["C:/Windows/System32/drivers/etc/hosts"],
      cwd: "C:/repo/project",
    },
    mode: "default",
    rules: [],
    workingDir: "C:/repo/project",
    additionalWorkingDirectories: [],
  });

  assert(decision.behavior === "ask", "shell outside absolute path should require confirmation");
  assert(decision.riskClass === "path_outside", "shell outside absolute path should be path_outside risk");
}

function verifyShellReadonlyAllowedWithinWorkspace() {
  const decision = decideToolPermission({
    tool: mockTool("shell", false),
    input: {
      cmd: "rg",
      args: ["--files", "src"],
      cwd: "C:/repo/project",
    },
    mode: "default",
    rules: [],
    workingDir: "C:/repo/project",
    additionalWorkingDirectories: [],
  });

  assert(decision.behavior === "allow", "readonly shell command should be allowed in workspace");
}

async function main() {
  verifyNoWorkspaceRequiresConfirmation();
  console.log("PASS permission: no-workspace confirmation");

  verifyRelativePathAllowedWithinWorkspace();
  console.log("PASS permission: relative path allowed");

  verifyShellParentTraversalRequiresConfirmation();
  console.log("PASS permission: shell parent traversal confirmation");

  verifyShellAbsoluteOutsideRequiresConfirmation();
  console.log("PASS permission: shell outside absolute path confirmation");

  verifyShellReadonlyAllowedWithinWorkspace();
  console.log("PASS permission: shell readonly allowed");

  console.log("All agent permission verification cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
