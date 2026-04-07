import type { AgentTask, AgentTaskType, TaskOutputChunk, TaskRunContext } from "./types";

interface TaskEntry {
  task: AgentTask;
  abortController: AbortController;
  outputBaseOffset: number;
}

export interface CreateTaskInput {
  type: AgentTaskType;
  description: string;
  metadata?: Record<string, unknown>;
  run: (context: TaskRunContext) => Promise<unknown>;
}

const TASK_PREFIX: Record<AgentTaskType, string> = {
  local_bash: "b",
  local_agent: "a",
  local_workflow: "w",
};
const MAX_TASK_OUTPUT_LINES = 2_000;
const DEFAULT_FINISHED_TASKS_TO_KEEP = 80;

function makeTaskId(type: AgentTaskType): string {
  const prefix = TASK_PREFIX[type] ?? "t";
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AgentTaskManager {
  private tasks = new Map<string, TaskEntry>();
  private readonly onChange?: () => void;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
  }

  public createTask(input: CreateTaskInput): AgentTask {
    const id = makeTaskId(input.type);
    const now = Date.now();
    const task: AgentTask = {
      id,
      type: input.type,
      status: "pending",
      description: input.description,
      startTime: now,
      outputOffset: 0,
      output: [],
      notified: false,
      metadata: input.metadata,
    };
    const entry: TaskEntry = {
      task,
      abortController: new AbortController(),
      outputBaseOffset: 0,
    };

    this.tasks.set(task.id, entry);
    this.emitChange();
    queueMicrotask(() => {
      void this.executeTask(entry, input.run);
    });
    return this.cloneTask(task);
  }

  public listTasks(options: { includeOutput?: boolean } = {}): AgentTask[] {
    const includeOutput = options.includeOutput ?? false;
    return [...this.tasks.values()]
      .map((entry) => this.cloneTask(entry.task, includeOutput))
      .sort((a, b) => b.startTime - a.startTime);
  }

  public getTask(taskId: string, includeOutput = true): AgentTask | null {
    const entry = this.tasks.get(taskId);
    return entry ? this.cloneTask(entry.task, includeOutput) : null;
  }

  public stopTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return false;
    }
    if (entry.task.status === "completed" || entry.task.status === "failed" || entry.task.status === "killed") {
      return true;
    }

    entry.abortController.abort();
    entry.task.status = "killed";
    entry.task.endTime = Date.now();
    this.appendOutput(entry, "[Task] Killed by user request.");
    const removed = this.clearFinishedTasks();
    if (removed === 0) {
      this.emitChange();
    }
    return true;
  }

  public readOutput(taskId: string, fromOffset = 0, limit = 100): TaskOutputChunk | null {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return null;
    }
    const start = Math.max(0, fromOffset);
    const base = entry.outputBaseOffset;
    const endAbsolute = base + entry.task.output.length;
    const safeStartAbsolute = Math.min(Math.max(start, base), endAbsolute);
    const safeEndAbsolute = Math.min(endAbsolute, safeStartAbsolute + Math.max(1, limit));
    const startIndex = safeStartAbsolute - base;
    const endIndex = safeEndAbsolute - base;
    return {
      taskId,
      fromOffset: safeStartAbsolute,
      nextOffset: safeEndAbsolute,
      lines: entry.task.output.slice(startIndex, endIndex),
    };
  }

  public clearFinishedTasks(maxKeep = DEFAULT_FINISHED_TASKS_TO_KEEP): number {
    const safeMaxKeep = Number.isFinite(maxKeep)
      ? Math.max(0, Math.floor(maxKeep))
      : DEFAULT_FINISHED_TASKS_TO_KEEP;
    const finished = [...this.tasks.values()]
      .filter((entry) =>
        entry.task.status === "completed" ||
        entry.task.status === "failed" ||
        entry.task.status === "killed",
      )
      .sort((a, b) => b.task.startTime - a.task.startTime);

    const toDelete = finished.slice(safeMaxKeep);
    for (const entry of toDelete) {
      this.tasks.delete(entry.task.id);
    }
    if (toDelete.length > 0) {
      this.emitChange();
    }
    return toDelete.length;
  }

  private async executeTask(entry: TaskEntry, run: (context: TaskRunContext) => Promise<unknown>): Promise<void> {
    if (entry.task.status === "killed") {
      return;
    }

    entry.task.status = "running";
    this.appendOutput(entry, "[Task] Started.");
    this.emitChange();

    try {
      await run({
        signal: entry.abortController.signal,
        log: (line) => this.appendOutput(entry, line),
      });

      if (entry.abortController.signal.aborted) {
        entry.task.status = "killed";
        entry.task.endTime = Date.now();
      } else {
        entry.task.status = "completed";
        entry.task.endTime = Date.now();
        this.appendOutput(entry, "[Task] Completed.");
      }
      const removed = this.clearFinishedTasks();
      if (removed === 0) {
        this.emitChange();
      }
    } catch (error) {
      if (entry.abortController.signal.aborted) {
        entry.task.status = "killed";
        entry.task.endTime = Date.now();
      } else {
        entry.task.status = "failed";
        entry.task.endTime = Date.now();
        entry.task.error = String(error);
        this.appendOutput(entry, `[Task] Failed: ${entry.task.error}`);
      }
      const removed = this.clearFinishedTasks();
      if (removed === 0) {
        this.emitChange();
      }
    }
  }

  private appendOutput(entry: TaskEntry, line: string): void {
    const { task } = entry;
    const safe = String(line ?? "");
    if (!safe) {
      return;
    }
    task.output.push(safe);
    task.outputOffset += 1;
    if (task.output.length > MAX_TASK_OUTPUT_LINES) {
      const overflow = task.output.length - MAX_TASK_OUTPUT_LINES;
      task.output.splice(0, overflow);
      entry.outputBaseOffset += overflow;
    }
  }

  private cloneTask(task: AgentTask, includeOutput = true): AgentTask {
    return {
      ...task,
      output: includeOutput ? [...task.output] : [],
      metadata: task.metadata ? { ...task.metadata } : undefined,
    };
  }

  private emitChange(): void {
    this.onChange?.();
  }
}
