import { z } from "zod";

/**
 * The standard interface for an Agent Tool in Lumo Coding.
 * Inspired by Claude Code's Tool architecture.
 */
export interface Tool<P extends z.ZodTypeAny = z.ZodTypeAny, R = any> {
  name: string;
  description: string;

  /**
   * The Zod schema for input parameters. 
   * This provides the "Semantic Schema" the AI uses to understand arguments.
   */
  inputSchema: P;

  /**
   * Execution logic for the tool.
   * @param params Validated input parameters.
   * @param context Contextual information (e.g., current project, session).
   */
  call: (params: z.infer<P>, context: ToolContext) => Promise<R>;

  /**
   * Optional: JSON Schema representation for the LLM API (OpenAI tools format).
   * If not provided, it will be auto-generated from inputSchema (Zod).
   */
  jsonSchema?: Record<string, unknown>;

  /**
   * Whether this tool is read-only (safe to run concurrently).
   * Read-only tools: file reading, memory querying, device listing.
   * Write tools: shell execution and file modification.
   * Default: false (treated as write/side-effect tool).
   */
  isReadOnly?: boolean;

  /**
   * Maximum characters for tool output before truncation.
   * Prevents overly long outputs from blowing up context.
   * Default: 30000
   */
  maxOutputChars?: number;

  /**
   * Optional: Custom rendering logic for the tool's result in the UI.
   */
  render?: (result: R) => React.ReactNode;

  /**
   * Optional: Extract searchable text for indexing.
   */
  extractSearchText?: (result: R) => string;
}

export interface ToolContext {
  /**
   * Ability to log to the Agent's internal console.
   */
  log: (message: string) => void;

  /**
   * Access to the current AppState (read-only for tools).
   */
  getAppState: () => any;

  /**
   * Abort signal for long-running operations.
   */
  abortSignal: AbortSignal;

  /**
   * Root directory for the current project.
   */
  workingDir?: string;

  /**
   * Current thread identifier for thread-scoped persistence.
   */
  threadId?: string;

  /**
   * Current user turn identifier (used for file checkpointing/rewind).
   */
  turnId?: string;
}

/**
 * Result of a tool execution.
 */
export interface ToolResult<R = any> {
  success: boolean;
  data?: R;
  error?: string;
  stdout?: string;
  stderr?: string;
}
