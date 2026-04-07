export type AgentTaskType = "local_bash" | "local_agent" | "local_workflow";

export type AgentTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "killed";

export interface AgentTask {
  id: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  description: string;
  startTime: number;
  endTime?: number;
  outputOffset: number;
  output: string[];
  notified: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskOutputChunk {
  taskId: string;
  fromOffset: number;
  nextOffset: number;
  lines: string[];
}

export interface TaskRunContext {
  signal: AbortSignal;
  log: (line: string) => void;
}
