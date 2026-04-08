import type { Tool } from "./types";
import { BinaryInfoTool } from "./tools/BinaryInfoTool/BinaryInfoTool";
import { FileHashTool } from "./tools/FileHashTool/FileHashTool";
import { FileReadTool } from "./tools/FileReadTool/FileReadTool";
import { FileWriteTool } from "./tools/FileWriteTool/FileWriteTool";
import { GrepTool } from "./tools/GrepTool/GrepTool";
import { HexDumpTool } from "./tools/HexDumpTool/HexDumpTool";
import { ListDirTool } from "./tools/ListDirTool/ListDirTool";
import { MemoryTool } from "./tools/MemoryTool/MemoryTool";
import { ShellTool } from "./tools/ShellTool/ShellTool";
import { StringsTool } from "./tools/StringsTool/StringsTool";

export const TOOL_PRESETS = ["default"] as const;
export type ToolPreset = (typeof TOOL_PRESETS)[number];

export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase();
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null;
  }
  return presetString as ToolPreset;
}

export function getAllBaseTools(): Tool<any, any>[] {
  return [
    ShellTool,
    FileReadTool,
    MemoryTool,
    GrepTool,
    HexDumpTool,
    FileHashTool,
    ListDirTool,
    BinaryInfoTool,
    StringsTool,
    FileWriteTool,
  ];
}

export function getToolsForDefaultPreset(): string[] {
  return getAllBaseTools().map((tool) => tool.name);
}

export const getTools = (): Tool<any, any>[] => {
  return getAllBaseTools();
};

export const ALL_TOOLS: Tool<any, any>[] = getAllBaseTools();

