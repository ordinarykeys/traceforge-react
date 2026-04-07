import { invoke } from "@tauri-apps/api/core";
import type { AgentMessage } from "./QueryEngine";

export interface ThreadRetryDiagnostics {
  fallback_used: number;
  fallback_suppressed: number;
  retry_event_count: number;
  suppression_ratio_pct: number;
  last_suppressed_reason?: string | null;
  last_retry_strategy?: string | null;
}

export interface ThreadPermissionRiskDiagnostics {
  critical: number;
  high_risk: number;
  interactive: number;
  path_outside: number;
  policy: number;
  scope_notices: number;
}

export interface ThreadPermissionRiskProfileDiagnostics {
  reversible: number;
  mixed: number;
  hard_to_reverse: number;
  local: number;
  workspace: number;
  shared: number;
}

export interface ThreadPermissionDiagnostics {
  risk: ThreadPermissionRiskDiagnostics;
  profile: ThreadPermissionRiskProfileDiagnostics;
}

export interface ThreadDiagnosisActivity {
  kind: string;
  status: string;
  command: string;
  at: number;
  command_id?: string | null;
}

export interface ThreadDiagnostics {
  retry: ThreadRetryDiagnostics;
  permission?: ThreadPermissionDiagnostics;
  diagnosis_activity?: ThreadDiagnosisActivity;
  diagnosis_history?: ThreadDiagnosisActivity[];
  updated_at: number;
}

export interface ThreadMetadata {
  id: string;
  name: string;
  created_at: number;
  last_active: number;
  working_dir?: string;
  diagnostics?: ThreadDiagnostics;
}

export interface ThreadData {
  metadata: ThreadMetadata;
  messages: AgentMessage[];
}

export interface ThreadEvent {
  event_type: "append_message" | "upsert_message" | "delete_message";
  message_id?: string;
  payload: unknown;
  at: number;
}

export interface RewindThreadFilesResult {
  success: boolean;
  restored_count: number;
  removed_count: number;
  affected_paths: string[];
  errors: string[];
}

export interface RewindThreadFilesPreviewResult {
  success: boolean;
  first_seq: number | null;
  restore_count: number;
  remove_count: number;
  affected_paths: string[];
  warnings: string[];
}

class ThreadService {
  /**
   * List all saved threads from the backend.
   */
  async listThreads(): Promise<ThreadMetadata[]> {
    return await invoke("list_threads");
  }

  /**
   * Load a specific thread's full data.
   */
  async loadThread(id: string): Promise<ThreadData> {
    return await invoke("load_thread", { id });
  }

  /**
   * Save a thread to local storage.
   */
  async saveThread(
    id: string,
    name: string,
    messages: AgentMessage[],
    working_dir?: string,
    diagnostics?: ThreadDiagnostics,
  ): Promise<void> {
    await invoke("save_thread", {
      id,
      name,
      messages,
      workingDir: working_dir,
      working_dir,
      diagnostics,
    });
  }

  /**
   * Append incremental thread events.
   */
  async appendThreadEvents(
    id: string,
    name: string,
    events: ThreadEvent[],
    working_dir?: string,
    diagnostics?: ThreadDiagnostics,
  ): Promise<void> {
    if (events.length === 0) return;
    await invoke("append_thread_events", {
      id,
      name,
      events,
      workingDir: working_dir,
      working_dir,
      diagnostics,
    });
  }

  /**
   * Delete a thread from local storage.
   */
  async deleteThread(id: string): Promise<void> {
    await invoke("delete_thread", { id });
  }

  /**
   * Rename a thread.
   */
  async renameThread(id: string, newName: string): Promise<void> {
    await invoke("rename_thread", { id, newName });
  }

  /**
   * Open the threads directory in the system explorer.
   */
  async revealThreadsDir(working_dir?: string): Promise<void> {
    await invoke("reveal_threads_dir", {
      workingDir: working_dir,
      working_dir,
    });
  }

  async rewindThreadFiles(
    thread_id: string,
    turn_id: string,
    working_dir?: string,
  ): Promise<RewindThreadFilesResult> {
    return await invoke("invoke_agent_rewind_to_turn", {
      request: {
        working_dir: working_dir ?? "",
        thread_id,
        turn_id,
      },
    });
  }

  async previewRewindThreadFiles(
    thread_id: string,
    turn_id: string,
    working_dir?: string,
  ): Promise<RewindThreadFilesPreviewResult> {
    return await invoke("invoke_agent_rewind_preview", {
      request: {
        working_dir: working_dir ?? "",
        thread_id,
        turn_id,
      },
    });
  }

  /**
   * Helper to generate a new thread ID.
   */
  generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

export const threadService = new ThreadService();
