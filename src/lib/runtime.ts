import { invoke } from "@tauri-apps/api/core";

export type RuntimeInfo = {
  app_name: string;
  app_version: string;
  profile: string;
  os: string;
  arch: string;
  tauri: string;
};

export function getRuntimeInfo() {
  return invoke<RuntimeInfo>("get_runtime_info");
}
