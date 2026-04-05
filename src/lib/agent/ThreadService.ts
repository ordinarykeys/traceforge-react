import { invoke } from "@tauri-apps/api/core";
import type { AgentMessage } from "./QueryEngine";

export interface ThreadMetadata {
  id: string;
  name: string;
  created_at: number;
  last_active: number;
  working_dir?: string;
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
  async saveThread(id: string, name: string, messages: AgentMessage[], working_dir?: string): Promise<void> {
    await invoke("save_thread", { id, name, messages, working_dir });
  }

  /**
   * Append incremental thread events.
   */
  async appendThreadEvents(id: string, name: string, events: ThreadEvent[], working_dir?: string): Promise<void> {
    if (events.length === 0) return;
    await invoke("append_thread_events", { id, name, events, working_dir });
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
  async revealThreadsDir(): Promise<void> {
    await invoke("reveal_threads_dir");
  }

  /**
   * Helper to generate a new thread ID.
   */
  generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

export const threadService = new ThreadService();
