import { invoke } from "@tauri-apps/api/core";

export async function readFileTextForPreview(path: string): Promise<string | null> {
  try {
    const response: any = await invoke("invoke_agent_read_file", {
      request: {
        path,
        start_line: null,
        end_line: null,
      },
    });
    if (!response?.success) return null;
    return String(response.content ?? "");
  } catch {
    return null;
  }
}

