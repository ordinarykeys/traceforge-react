import { listen } from "@tauri-apps/api/event";
import type { Tool } from "./types";
import { ALL_TOOLS } from "./tools";
import { buildSystemPrompt } from "./systemPrompt";
import { runTools, type ToolCallLike } from "./services/tools/toolOrchestration";
import {
  formatToolExecutionError,
  formatToolValidationError,
  truncateToolOutput,
} from "./utils/toolErrors";
import { productionDeps, type QueryDeps } from "./query/deps";
import type { Continue, Terminal } from "./query/transitions";
import { buildQueryConfig } from "./query/config";
import {
  checkTokenBudget,
  createBudgetTracker,
  estimateTokensFromText,
  type TokenBudgetDecision,
  type TokenBudgetConfig,
} from "./query/tokenBudget";
import { executeStopHooks, type StopHook } from "./query/stopHooks";
import {
  decideToolPermission,
  type PermissionDecision,
  type PermissionRule,
} from "./permissions/toolPermissions";

// ============================================================
// Types 鈥?kept compatible with existing UI (AgentWorkstationView)
// ============================================================

export interface AgentStepData {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "error";
  logs: string[];
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  steps?: AgentStepData[];
  status?: "pending" | "running" | "completed" | "error";
  report?: string;
}

// ============================================================
// Internal types for LLM API communication
// ============================================================

interface LLMToolCall extends ToolCallLike {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

// ============================================================
// Constants
// ============================================================

const MAX_TOOL_LOOP_ITERATIONS = Number.POSITIVE_INFINITY;
const DEFAULT_MAX_OUTPUT_CHARS = 30000;
const MAX_HISTORY_MESSAGES = 40;

export type ToolPermissionMode = "default" | "full_access";

interface QueryEngineOptions {
  permissionMode?: ToolPermissionMode;
  deps?: QueryDeps;
  stopHooks?: StopHook[];
  tokenBudget?: TokenBudgetConfig;
  fallbackModel?: string;
  workingDir?: string;
  threadId?: string;
  permissionRules?: PermissionRule[];
  additionalWorkingDirectories?: string[];
}

// ============================================================
// QueryEngine 鈥?The core multi-turn tool-use reasoning loop
// ============================================================

export class QueryEngine {
  private messages: AgentMessage[] = [];
  private tools: Map<string, Tool> = new Map();
  private onUpdate: (messages: AgentMessage[]) => void;
  private baseUrl: string;
  private apiKey: string;
  private abortController: AbortController | null = null;
  private messageQueue: { query: string; model: string; permissionMode: ToolPermissionMode }[] = [];
  private isProcessing = false;
  private abortQueuedProcessing = false;
  private permissionMode: ToolPermissionMode;
  private unlistenAgentLog: null | (() => void) = null;
  private deps: QueryDeps;
  private lastTerminal: Terminal | null = null;
  private lastContinue: Continue | null = null;
  private stopHooks: StopHook[];
  private tokenBudget: TokenBudgetConfig | null;
  private fallbackModel?: string;
  private workingDir?: string;
  private threadId?: string;
  private permissionRules: PermissionRule[] = [];
  private additionalWorkingDirectories: string[] = [];


  constructor(
    onUpdate: (messages: AgentMessage[]) => void,
    baseUrl: string,
    apiKey: string,
    options: QueryEngineOptions = {},
  ) {
    this.onUpdate = onUpdate;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.permissionMode = options.permissionMode ?? "default";
    this.deps = options.deps ?? productionDeps();
    this.stopHooks = options.stopHooks ?? [];
    this.tokenBudget = options.tokenBudget ?? null;
    this.fallbackModel = options.fallbackModel;
    this.workingDir = options.workingDir;
    this.threadId = options.threadId;
    this.permissionRules = [...(options.permissionRules ?? [])];
    this.additionalWorkingDirectories = [...(options.additionalWorkingDirectories ?? [])];
    this.setupEventListeners();

    // Register all reverse engineering tools
    for (const tool of ALL_TOOLS) {
      this.registerTool(tool);
    }
  }

  private async setupEventListeners() {
    const unlisten = await listen<{ source: string, line: string }>("agent-log", (event) => {
      console.log(`[Rust Stream] ${event.payload.source}: ${event.payload.line}`);
      const activeMsg = this.messages.find(m => m.status === "running");
      if (activeMsg && activeMsg.steps) {
        const activeStep = activeMsg.steps.find(s => s.status === "running");
        if (activeStep) {
          activeStep.logs.push(`[${event.payload.source}] ${event.payload.line}`);
          this.onUpdate([...this.messages]);
        }
      }
    });
    this.unlistenAgentLog = unlisten;
  }

  public registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  private createStep(title: string): AgentStepData {
    return {
      id: Math.random().toString(36).substring(7),
      title,
      status: "pending",
      logs: []
    };
  }

  private updateUI() {
    this.onUpdate([...this.messages]);
  }

  private makeId() {
    try {
      return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  private validateToolArgs(tool: Tool, args: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
    const parsed = tool.inputSchema.safeParse(args);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    return {
      ok: false,
      error: formatToolValidationError(tool.name, parsed.error),
    };
  }

  private canUseTool(
    tool: Tool,
    input: unknown,
    mode: ToolPermissionMode = this.permissionMode
  ): PermissionDecision {
    return decideToolPermission({
      tool,
      input,
      mode,
      rules: this.permissionRules,
      workingDir: this.workingDir,
      additionalWorkingDirectories: this.additionalWorkingDirectories,
    });
  }

  private classifyError(error: any): string {
    const errorStr = String(error).toLowerCase();
    const statusMatch = errorStr.match(/llm api (?:error|閿欒): (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 0;

    if (status === 401) return "API Key 鏃犳晥鎴栨湭鎺堟潈锛岃鍦ㄨ缃腑妫€鏌ャ€?;
    if (status === 404 || errorStr.includes("model does not exist")) {
      return `褰撳墠妯″瀷涓嶅彲鐢紝璇峰皾璇曞垏鎹㈡ā鍨嬨€傚師濮嬮敊璇? ${error}`;
    }
    if (status === 429) return "宸茶揪鍒?API 閫熺巼闄愬埗锛岀郴缁熸鍦ㄩ噸璇曘€?;
    if (status === 529 || errorStr.includes("overloaded")) {
      return "鏈嶅姟绻佸繖锛岀郴缁熸鍦ㄦ帓闃熼噸璇曘€?;
    }
    if (errorStr.includes("abort") || errorStr.includes("aborted")) {
      return "鍒嗘瀽宸茶鐢ㄦ埛涓銆?;
    }
    return `鎵ц杩囩▼涓彂鐢熼敊璇? ${error}`;
  }

  private ensureToolResultPairing(llmHistory: LLMMessage[], assistantMsg: AgentMessage) {
    const lastAssistantMsg = llmHistory[llmHistory.length - 1];
    if (lastAssistantMsg?.role !== "assistant" || !lastAssistantMsg.tool_calls) return;

    const existingToolResIds = new Set(
      llmHistory.slice(llmHistory.indexOf(lastAssistantMsg) + 1)
        .filter(m => m.role === "tool")
        .map(m => m.tool_call_id)
    );

    for (const toolCall of lastAssistantMsg.tool_calls) {
      if (!existingToolResIds.has(toolCall.id)) {
        llmHistory.push({
          role: "tool",
          content: "Error: Turn interrupted.",
          tool_call_id: toolCall.id
        });

        if (assistantMsg.steps) {
          const step = assistantMsg.steps.find(s => s.title.includes(toolCall.function.name));
          if (step && step.status === "running") step.status = "error";
        }
      }
    }
  }

  /**
   * Build OpenAI-compatible tools array from registered tools.
   */
  private buildToolDefinitions(): any[] {
    const toolDefs: any[] = [];
    for (const [_name, tool] of this.tools) {
      toolDefs.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.jsonSchema || {
            type: "object",
            properties: {},
          }
        }
      });
    }
    return toolDefs;
  }

  /**
   * Build tool descriptions string for the system prompt.
   */
  private buildToolDescriptions(): string {
    const lines: string[] = [];
    for (const [_name, tool] of this.tools) {
      lines.push(`### ${tool.name}\n${tool.description}\n`);
    }
    return lines.join("\n");
  }

  private isToolConcurrencySafe(toolCall: LLMToolCall): boolean {
    const tool = this.tools.get(toolCall.function.name);
    return Boolean(tool?.isReadOnly);
  }

  private isToolResultError(result: string): boolean {
    const lower = result.toLowerCase();
    return (
      lower.startsWith("error:") ||
      lower.startsWith("permission denied") ||
      lower.includes("execution failed") ||
      lower.includes("failed")
    );
  }


  /**
   * Execute a single tool call.
   */
  private async executeTool(
    toolCall: LLMToolCall,
    step: AgentStepData,
    mode: ToolPermissionMode
  ): Promise<string> {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) {
      return `Error: Unknown tool "${toolCall.function.name}". Available tools: ${[...this.tools.keys()].join(", ")}`;
    }

    let params: any;
    try {
      params = JSON.parse(toolCall.function.arguments);
    } catch {
      return `Error: Invalid JSON in tool arguments: ${toolCall.function.arguments}`;
    }

    const validated = this.validateToolArgs(tool, params);
    if (!validated.ok) {
      step.logs.push(`[Validation] ${validated.error}`);
      return validated.error;
    }

    const permission = this.canUseTool(tool, validated.data, mode);
    if (permission.behavior !== "allow") {
      const prefix = permission.behavior === "deny" ? "Denied" : "Approval required";
      step.logs.push(`[Permission] ${prefix}: ${permission.reason}`);
      if (permission.suggestions && permission.suggestions.length > 0) {
        step.logs.push(
          `[Permission Suggestions] ${permission.suggestions.map((s) => s.summary).join(" | ")}`
        );
      }
      return `Permission ${permission.behavior}: ${permission.reason}`;
    }

    const maxChars = tool.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

    // Create a simple ToolContext  
    const context = {
      log: (message: string) => {
        step.logs.push(message);
        this.updateUI();
      },
      getAppState: () => ({
        permissionMode: mode,
        permissionRules: this.permissionRules,
        additionalWorkingDirectories: this.additionalWorkingDirectories,
        workingDir: this.workingDir,
        threadId: this.threadId,
      }),
      abortSignal: this.abortController?.signal ?? new AbortController().signal,
      workingDir: this.workingDir,
      threadId: this.threadId,
    };

    try {
      const result = await tool.call(validated.data as never, context);
      const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return truncateToolOutput(output, maxChars);
    } catch (error) {
      return formatToolExecutionError(toolCall.function.name, error);
    }
  }

  /**
   * The core multi-turn tool-use loop.
   * Inspired by claude-code's queryLoop async generator pattern.
   */
  public getQueueCount(): number {
    return this.messageQueue.length;
  }

  public getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  public getLastTerminal(): Terminal | null {
    return this.lastTerminal;
  }

  public getLastContinue(): Continue | null {
    return this.lastContinue;
  }

  public setPermissionMode(mode: ToolPermissionMode) {
    this.permissionMode = mode;
  }

  public setStopHooks(hooks: StopHook[]) {
    this.stopHooks = [...hooks];
  }

  public setTokenBudget(budget: TokenBudgetConfig | null) {
    this.tokenBudget = budget;
  }

  public setFallbackModel(model: string | undefined) {
    this.fallbackModel = model;
  }

  public setWorkingDir(dir: string | undefined) {
    this.workingDir = dir;
  }

  public setPermissionRules(rules: PermissionRule[]) {
    this.permissionRules = [...rules];
  }

  public addPermissionRule(rule: PermissionRule) {
    this.permissionRules = [...this.permissionRules, rule];
  }

  public removePermissionRule(ruleId: string) {
    this.permissionRules = this.permissionRules.filter((rule) => rule.id !== ruleId);
  }

  public clearPermissionRules() {
    this.permissionRules = [];
  }

  public getPermissionRules(): PermissionRule[] {
    return [...this.permissionRules];
  }

  public setAdditionalWorkingDirectories(dirs: string[]) {
    this.additionalWorkingDirectories = [...dirs];
  }

  public setThreadId(threadId: string | undefined) {
    this.threadId = threadId;
  }

  private buildRuntimeContext(mode?: ToolPermissionMode): string {
    const now = new Date();
    const localTime = now.toLocaleString("zh-CN", { hour12: false });

    return [
      `- Current local datetime: ${localTime}`,
      `- Current thread ID: ${this.threadId ?? "(not set)"}`,
      `- Current working directory: ${this.workingDir ?? "(not set)"}`,
      `- Tool permission mode: ${mode ?? this.permissionMode}`,
      `- Permission rules loaded: ${this.permissionRules.length}`,
      `- Additional working directories: ${this.additionalWorkingDirectories.length}`,
    ].join("\n");
  }

  /**
   * High-level entry point that handles instruction queuing.
   */
  public async processQuery(
    query: string,
    model: string,
    modeSnapshot: ToolPermissionMode = this.permissionMode
  ) {
    if (this.isProcessing) {
      // If busy, push to queue and notify UI
      this.messageQueue.push({ query, model, permissionMode: modeSnapshot });
      this.updateUI();
      return;
    }

    this.isProcessing = true;
    this.abortQueuedProcessing = false;
    try {
      this.lastTerminal = await this.runQueryLoop(query, model, modeSnapshot);
    } catch (error) {
      this.lastTerminal = { reason: "error", error };
      throw error;
    } finally {
      // Pick up the next item in the queue if any
      this.isProcessing = false;
      const next = this.messageQueue.shift();
      if (next && !this.abortQueuedProcessing) {
        // Use timeout to break the promise chain and allow UI to breathe
        setTimeout(() => this.processQuery(next.query, next.model, next.permissionMode), 10);
      } else {
        if (this.abortQueuedProcessing) {
          this.messageQueue = [];
          this.abortQueuedProcessing = false;
        }
        this.updateUI();
      }
    }
  }

  /**
   * The core multi-turn tool-use reasoning loop.
   */
  private async runQueryLoop(
    query: string,
    model: string,
    modeSnapshot: ToolPermissionMode
  ): Promise<Terminal> {
    this.lastContinue = null;
    if (!this.apiKey) {
      throw new Error("Missing API Key. Please check settings.");
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    // 1. Add user message
    const userMsg: AgentMessage = {
      id: this.makeId(),
      role: "user",
      content: query,
    };
    this.messages.push(userMsg);
    this.updateUI();

    // 2. Create assistant message container
    const assistantMsg: AgentMessage = {
      id: this.makeId(),
      role: "assistant",
      content: "",
      status: "running",
      steps: []
    };
    this.messages.push(assistantMsg);
    this.updateUI();

    // Deterministic fast-path for Android automation tasks.
    if (this.shouldRunAndroidAutoAnalysis(query) && this.tools.has("android_auto_analysis")) {
      const autoStep = this.createStep("Android Auto Pipeline");
      autoStep.status = "running";
      assistantMsg.steps!.push(autoStep);
      this.updateUI();

      const toolCall: LLMToolCall = {
        id: this.makeId(),
        type: "function",
        function: {
          name: "android_auto_analysis",
          arguments: JSON.stringify(this.extractAndroidAutoArgs(query)),
        },
      };

      const result = await this.executeTool(toolCall, autoStep, modeSnapshot);
      autoStep.status = this.isToolResultError(result) ? "error" : "completed";
      autoStep.logs.push(`[Result] ${result.substring(0, 500)}${result.length > 500 ? "..." : ""}`);
      assistantMsg.content = result;
      assistantMsg.report = result; // Set the report content for the UI to pick up
      assistantMsg.status = autoStep.status === "error" ? "error" : "completed";
      this.updateUI();
      if (assistantMsg.status === "error") {
        return { reason: "error", error: new Error(result) };
      }
      return { reason: "completed" };
    }

    // 3. Build the LLM conversation context
    const systemPrompt = [
      buildSystemPrompt(this.buildToolDescriptions()),
      "## Runtime Context",
      this.buildRuntimeContext(modeSnapshot),
    ].join("\n\n");
    const toolDefs = this.buildToolDefinitions();

    // Build LLM message history from our AgentMessages
    const llmHistory: LLMMessage[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add conversation history (only user/assistant text, skip steps)
    const historySlice = this.messages.slice(-MAX_HISTORY_MESSAGES);
    for (const m of historySlice) {
      if (m.role === "user") {
        llmHistory.push({ role: "user", content: m.content });
      } else if (m.role === "assistant" && m.content && m.id !== assistantMsg.id) {
        llmHistory.push({ role: "assistant", content: m.content });
      }
    }

    try {
      // 4. THE TOOL-USE LOOP 鈥?the heart of the agent
      let iteration = 0;
      const budgetTracker = createBudgetTracker();
      let globalTurnTokens = 0;
      const queryConfig = buildQueryConfig();
      let currentModel = model;
      let hasRetriedWithFallback = false;

      while (iteration < MAX_TOOL_LOOP_ITERATIONS) {
        if (this.abortController?.signal.aborted) {
          assistantMsg.status = "error";
          assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + "鈿狅笍 浠诲姟宸蹭腑姝€?;
          this.updateUI();
          return { reason: "aborted" };
        }
        iteration++;

        // --- Step: LLM Call ---
        const thinkingStep = this.createStep(
          iteration === 1
            ? `姝ｅ湪浣跨敤 ${model} 鍒嗘瀽浠诲姟...`
            : `绗?${iteration} 杞帹鐞嗕腑...`
        );
        assistantMsg.steps!.push(thinkingStep);
        thinkingStep.status = "running";
        this.updateUI();

        let data;
        try {
          data = await this.deps.callModel({
            baseUrl: this.baseUrl,
            apiKey: this.apiKey,
            model: currentModel,
            messages: llmHistory,
            tools: toolDefs,
            temperature: 0.3,
            signal: this.abortController?.signal,
          });
        } catch (error) {
          const shouldFallback =
            queryConfig.gates.enableFallbackModel &&
            this.fallbackModel &&
            this.fallbackModel !== currentModel &&
            !hasRetriedWithFallback;
          if (!shouldFallback) {
            throw error;
          }

          hasRetriedWithFallback = true;
          currentModel = this.fallbackModel!;
          this.lastContinue = {
            reason: "fallback_retry",
            fallbackModel: currentModel,
          };
          thinkingStep.logs.push(`Primary model failed. Retrying with fallback model: ${currentModel}`);
          thinkingStep.status = "completed";
          this.updateUI();
          continue;
        }
        const choice = data.choices?.[0];
        if (!choice?.message) {
          throw new Error("LLM response missing choices[0].message");
        }
        const message = choice.message;
        const finishReason = choice.finish_reason;
        if (message.content) {
          globalTurnTokens += estimateTokensFromText(message.content);
        }

        thinkingStep.status = "completed";
        thinkingStep.logs.push(`鎺ㄧ悊瀹屾垚 (finish_reason: ${finishReason})`);
        this.updateUI();

        // --- Case A: LLM wants to call tools ---
        if (message.tool_calls && message.tool_calls.length > 0) {
          // Add assistant's tool_calls message to history
          llmHistory.push({
            role: "assistant",
            content: message.content || null,
            tool_calls: message.tool_calls,
          });

          // If there's also text content, append to visible output
          if (message.content) {
            assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + message.content;
            this.updateUI();
          }

          const stepByToolCallId = new Map<string, AgentStepData>();
          const toolResults = await runTools({
            toolCalls: message.tool_calls,
            isConcurrencySafe: (toolCall) => this.isToolConcurrencySafe(toolCall),
            onToolError: (toolCall, error) => formatToolExecutionError(toolCall.function.name, error),
            shouldAbort: () => Boolean(this.abortController?.signal.aborted),
            createAbortResult: (toolCall) =>
              `Error: Tool "${toolCall.function.name}" skipped because the turn was interrupted.`,
            onToolStart: (toolCall) => {
              const toolStep = this.createStep(
                `Tool ${toolCall.function.name}(${this.summarizeArgs(toolCall.function.arguments)})`
              );
              assistantMsg.steps!.push(toolStep);
              toolStep.status = "running";
              stepByToolCallId.set(toolCall.id, toolStep);
              this.updateUI();
            },
            runSingleTool: async (toolCall) => {
              const step = stepByToolCallId.get(toolCall.id);
              if (!step) {
                return `Error: Missing execution step for tool "${toolCall.function.name}".`;
              }
              return this.executeTool(toolCall, step, modeSnapshot);
            },
            onToolComplete: (toolCall, result) => {
              const step = stepByToolCallId.get(toolCall.id);
              if (!step) return;
              step.status = this.isToolResultError(result) ? "error" : "completed";
              step.logs.push(`[Result] ${result.substring(0, 500)}${result.length > 500 ? "..." : ""}`);
              this.updateUI();
            },
          });

          for (const { toolCall, result } of toolResults) {
            llmHistory.push({
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
            });
          }

          this.lastContinue = { reason: "tool_results" };
          // Continue the loop 鈥?LLM will see tool results and decide what to do next
          continue;
        }

        // --- Case B: LLM responds with final text (no more tool calls) ---
        if (message.content) {
          assistantMsg.content += (assistantMsg.content ? "\n\n" : "") + message.content;
        }

        const stopHookResult = queryConfig.gates.enableStopHooks
          ? await executeStopHooks(this.stopHooks, {
            messages: this.messages,
            assistantMessage: assistantMsg,
            iteration,
          })
          : { blockingErrors: [], preventContinuation: false, notes: [] };

        if (stopHookResult.notes.length > 0) {
          const hookStep = this.createStep("Stop Hooks");
          hookStep.status = "completed";
          hookStep.logs.push(...stopHookResult.notes);
          assistantMsg.steps!.push(hookStep);
        }

        if (stopHookResult.blockingErrors.length > 0) {
          assistantMsg.content +=
            "\n\nStop hook blocked continuation:\n" +
            stopHookResult.blockingErrors.map((err) => `- ${err}`).join("\n");
          assistantMsg.status = "error";
          this.updateUI();
          return { reason: "stop_hook_prevented" };
        }

        if (stopHookResult.preventContinuation) {
          assistantMsg.status = "completed";
          this.updateUI();
          return { reason: "stop_hook_prevented" };
        }

        const budgetDecision: TokenBudgetDecision = queryConfig.gates.enableTokenBudget
          ? checkTokenBudget(
            budgetTracker,
            this.tokenBudget,
            globalTurnTokens,
          )
          : { action: "stop", completionEvent: null };
        if (budgetDecision.action === "continue") {
          llmHistory.push({ role: "user", content: budgetDecision.nudgeMessage });
          const budgetStep = this.createStep("Token Budget Continuation");
          budgetStep.status = "completed";
          budgetStep.logs.push(
            `Auto-continue #${budgetDecision.continuationCount}, usage ${budgetDecision.pct}% (${budgetDecision.turnTokens}/${budgetDecision.budget})`,
          );
          assistantMsg.steps!.push(budgetStep);
          this.lastContinue = {
            reason: "token_budget_continuation",
            attempt: budgetDecision.continuationCount,
          };
          this.updateUI();
          continue;
        }

        // Loop ends 鈥?model is done
        break;
      }

      assistantMsg.status = "completed";
      this.updateUI();
      return { reason: "completed" };

    } catch (error) {
      console.error("Agent Loop Error:", error);
      assistantMsg.content += `\n\n${this.classifyError(error)}`;
      assistantMsg.status = "error";

      this.ensureToolResultPairing(llmHistory, assistantMsg);

      if (assistantMsg.steps) {
        for (const step of assistantMsg.steps) {
          if (step.status === "running" || step.status === "pending") {
            step.status = "error";
          }
        }
      }
      this.updateUI();
      return { reason: "error", error };
    }
  }

  /**
   * Create a short summary of tool arguments for display in the step title.
   */
  private summarizeArgs(argsJson: string): string {
    try {
      const args = JSON.parse(argsJson);
      const parts: string[] = [];
      for (const [key, value] of Object.entries(args)) {
        const strVal = typeof value === "string"
          ? (value.length > 40 ? value.substring(0, 40) + "..." : value)
          : JSON.stringify(value);
        parts.push(`${key}: ${strVal}`);
      }
      return parts.join(", ").substring(0, 80);
    } catch {
      return argsJson.substring(0, 50);
    }
  }

  private shouldRunAndroidAutoAnalysis(query: string): boolean {
    const q = query.toLowerCase();
    const hasAndroidSignal = q.includes(".apk") || q.includes("android") || query.includes("瀹夊崜");
    const hasAutoIntent = query.includes("鑷姩") || query.includes("涓€閿?) || q.includes("auto");
    const hasGoal =
      query.includes("鎶撳寘") ||
      query.includes("鍙傛暟鍒嗘瀽") ||
      query.includes("鍔犲瘑鍑芥暟") ||
      query.includes("鍔犲瘑瀹氫綅") ||
      q.includes("signature") ||
      q.includes("encrypt");
    return hasAndroidSignal && hasAutoIntent && hasGoal;
  }

  private extractAndroidAutoArgs(query: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const apkMatch = query.match(/[A-Za-z]:\\[^"'\\s]+\\.apk/i);
    if (apkMatch?.[0]) args.apk_path = apkMatch[0];

    const packageMatch = query.match(/\b[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){2,}\b/);
    if (packageMatch?.[0] && !packageMatch[0].toLowerCase().endsWith(".apk")) {
      args.package_name = packageMatch[0];
    }

    const secMatch = query.match(/(\d+)\s*绉?);
    if (secMatch?.[1]) {
      const sec = Number(secMatch[1]);
      if (Number.isFinite(sec)) args.duration_sec = sec;
    }

    if (query.includes("attach") || query.includes("闄勫姞")) {
      args.attach = true;
    }

    return args;
  }

  /**
   * Stop the currently running query.
   */
  public abort(clearQueue = false) {
    this.abortController?.abort();
    if (clearQueue) {
      this.messageQueue = [];
      this.abortQueuedProcessing = true;
      this.updateUI();
    }
  }

  public dispose() {
    this.abort();
    if (this.unlistenAgentLog) {
      this.unlistenAgentLog();
      this.unlistenAgentLog = null;
    }
  }

  /**
   * Clear all messages and reset the engine.
   */
  public clear() {
    this.abort(true);
    this.messages = [];
    this.messageQueue = [];
    this.isProcessing = false;
    this.abortQueuedProcessing = false;
    this.lastTerminal = null;
    this.lastContinue = null;
    this.updateUI();
  }


  public getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  public setMessages(messages: AgentMessage[]) {
    this.messages = [...messages];
    this.updateUI();
  }
}
