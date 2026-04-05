import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ImperativePanelHandle
} from "@/components/ui/resizable";
import { AgentMessageItem } from "@/components/agent/AgentMessageItem";
import { ComposerPanel } from "@/components/agent/ComposerPanel";
import { ThreadSidebar } from "@/components/agent/ThreadSidebar";
import { VirtualMessageList } from "@/components/agent/VirtualMessageList";
import { QueryEngine, type AgentMessage, type ToolPermissionMode } from "@/lib/agent/QueryEngine";
import { ALL_TOOLS } from "@/lib/agent/tools";
import { threadService } from "@/lib/agent/ThreadService";
import type { ThreadMetadata } from "@/lib/agent/ThreadService";
import type { ThreadEvent } from "@/lib/agent/ThreadService";
import { translate } from "@/lib/i18n";
import { useLocaleStore } from "@/hooks/useLocaleStore";

interface AgentWorkstationViewProps {
  apiConfig: { baseUrl: string; apiKey: string } | null;
  isSiderVisible?: boolean;
}

interface ModelInfo {
  id: string;
  label: string;
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3 (SiliconFlow)" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
  { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B" },
];

const DEFAULT_TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);
const DEFAULT_TOOL_COUNT = DEFAULT_TOOL_NAMES.length;

function cloneMessages(messages: AgentMessage[]): AgentMessage[] {
  if (typeof structuredClone === "function") {
    return structuredClone(messages);
  }
  return JSON.parse(JSON.stringify(messages)) as AgentMessage[];
}

function getMessageStepsSnapshot(message: AgentMessage): string {
  if (!message.steps || message.steps.length === 0) {
    return "";
  }

  return message.steps
    .map((step) => `${step.id}:${step.status}:${step.logs.length}:${step.logs[step.logs.length - 1] ?? ""}`)
    .join("|");
}

export default function AgentWorkstationView({ apiConfig, isSiderVisible = true }: AgentWorkstationViewProps) {
  const { locale } = useLocaleStore();
  const [input, setInput] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [currentModel, setCurrentModel] = useState<string>("deepseek-ai/DeepSeek-V3");
  const [permissionMode, setPermissionMode] = useState<ToolPermissionMode>("default");
  const [userInfo, setUserInfo] = useState<any>(null);
  const [showUserPopover, setShowUserPopover] = useState(false);

  // Thread management states
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentThreadName, setCurrentThreadName] = useState("新任务");
  const [currentThreadWorkingDir, setCurrentThreadWorkingDir] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: "TraceForge 智能逆向助手已就绪。我将协助您进行自动化 APK 分析、协议还原与 Hook 脚本编写。请提供目标进程或任务指令。",
      status: "completed"
    }
  ]);

  const engineRef = useRef<QueryEngine | null>(null);
  const pendingEngineMessagesRef = useRef<AgentMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPersistedMessagesRef = useRef<AgentMessage[] | null>(null);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const panelRef = useRef<ImperativePanelHandle>(null);

  // Sync side toggle
  useEffect(() => {
    if (panelRef.current) {
      if (isSiderVisible) {
        panelRef.current.expand();
      } else {
        panelRef.current.collapse();
      }
    }
  }, [isSiderVisible]);

  // Load threads on mount
  const refreshThreads = useCallback(async () => {
    try {
      const list = await threadService.listThreads();
      setThreads(list);

      // If no thread is selected, select the most recent one or create new
      if (!currentThreadId && list.length > 0) {
        handleLoadThread(list[0].id);
      } else if (!currentThreadId && list.length === 0) {
        handleNewThread();
      }
    } catch (e) {
      console.warn("Failed to list threads:", e);
    }
  }, [currentThreadId]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  // Initialize engine
  useEffect(() => {
    if (!apiConfig) return;

    const engine = new QueryEngine(
      (updatedMessages) => {
        const nextMessages = [...updatedMessages];
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
      },
      apiConfig.baseUrl,
      apiConfig.apiKey,
      {
        workingDir: currentThreadWorkingDir,
        threadId: currentThreadId ?? undefined,
      }
    );
    engineRef.current = engine;
    engine.setPermissionMode(permissionMode);

    // Replay any messages loaded before engine was ready.
    if (pendingEngineMessagesRef.current) {
      engine.setMessages(pendingEngineMessagesRef.current);
      pendingEngineMessagesRef.current = null;
    } else if (messagesRef.current.length > 0) {
      engine.setMessages(messagesRef.current);
    }

    const fetchModels = async () => {
      try {
        const response = await fetch(`${apiConfig.baseUrl}/models`, {
          headers: { "Authorization": `Bearer ${apiConfig.apiKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            const models: ModelInfo[] = data.data
              .filter((m: any) => m.id)
              .map((m: any) => ({ id: m.id, label: m.id }))
              .slice(0, 20);
            if (models.length > 0) {
              setAvailableModels(models);
              // Auto-switch away from gpt-4o if not available and using common SiliconFlow baseline
              if (currentModel === "gpt-4o" && !models.some(m => m.id === "gpt-4o")) {
                setCurrentModel(models[0].id);
              }
            }
          }
        }
      } catch (e) { }
    };
    fetchModels();

    return () => {
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [apiConfig]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    engineRef.current?.setPermissionMode(permissionMode);
  }, [permissionMode]);

  useEffect(() => {
    engineRef.current?.setThreadId(currentThreadId ?? undefined);
  }, [currentThreadId]);

  // Thread Handlers
  const handleNewThread = (workingDir?: string) => {
    const newId = threadService.generateId();
    setCurrentThreadId(newId);

    // Default name to folder name if picking a directory
    let folderName = "新任务";
    if (workingDir) {
      const parts = workingDir.split(/[\\/]/);
      folderName = parts[parts.length - 1] || "新任务";
    }

    setCurrentThreadName(folderName);
    setCurrentThreadWorkingDir(workingDir);

    const initMsg: AgentMessage[] = [{
      id: "init",
      role: "assistant",
      content: `TraceForge 逆向分析引擎已就绪。${DEFAULT_TOOL_COUNT} 个工具已加载，等待指令。`,
      status: "completed"
    }];
    const nextMessages = cloneMessages(initMsg);
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
    lastPersistedMessagesRef.current = cloneMessages(nextMessages);
    if (engineRef.current) {
      engineRef.current.setMessages(initMsg);
      engineRef.current.setWorkingDir(workingDir);
      engineRef.current.setThreadId(newId);
      pendingEngineMessagesRef.current = null;
    } else {
      pendingEngineMessagesRef.current = initMsg;
    }
  };

  const handleLoadThread = async (id: string) => {
    try {
      const data = await threadService.loadThread(id);
      setCurrentThreadId(data.metadata.id);
      setCurrentThreadName(data.metadata.name);
      setCurrentThreadWorkingDir(data.metadata.working_dir);
      const nextMessages = cloneMessages(data.messages);
      setMessages(nextMessages);
      messagesRef.current = nextMessages;
      lastPersistedMessagesRef.current = cloneMessages(nextMessages);

      if (engineRef.current) {
        engineRef.current.setMessages(nextMessages);
        engineRef.current.setWorkingDir(data.metadata.working_dir);
        engineRef.current.setThreadId(data.metadata.id);
        pendingEngineMessagesRef.current = null;
      } else {
        pendingEngineMessagesRef.current = nextMessages;
      }
    } catch (e) {
      console.error("Failed to load thread:", e);
    }
  };

  const handleDeleteThread = async (id: string) => {
    try {
      await threadService.deleteThread(id);
      if (currentThreadId === id) {
        setCurrentThreadId(null);
      }
      refreshThreads();
    } catch (e) { }
  };

  const handleStartRename = (thread: ThreadMetadata) => {
    setEditingId(thread.id);
    setEditingName(thread.name || "");
  };

  const handleConfirmRename = async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      await threadService.renameThread(editingId, editingName);
      if (currentThreadId === editingId) {
        setCurrentThreadName(editingName);
      }
      setEditingId(null);
      refreshThreads();
    } catch (e) { }
  };

  const handleRevealThreads = async () => {
    try {
      await threadService.revealThreadsDir();
    } catch (e) { }
  };

  // Auto-save thread on message updates
  useEffect(() => {
    if (!currentThreadId) return;
    if (messages.some((message) => message.status === "running")) return;

    const buildThreadEvents = (prev: AgentMessage[], next: AgentMessage[]): ThreadEvent[] => {
      const events: ThreadEvent[] = [];
      const prevMap = new Map(prev.map((m) => [m.id, m]));
      const nextMap = new Map(next.map((m) => [m.id, m]));
      const now = Date.now();

      for (const m of next) {
        const old = prevMap.get(m.id);
        if (!old) {
          events.push({
            event_type: "append_message",
            message_id: m.id,
            payload: cloneMessages([m])[0],
            at: now,
          });
          continue;
        }
        if (JSON.stringify(old) !== JSON.stringify(m)) {
          events.push({
            event_type: "upsert_message",
            message_id: m.id,
            payload: cloneMessages([m])[0],
            at: now,
          });
        }
      }

      for (const old of prev) {
        if (!nextMap.has(old.id)) {
          events.push({
            event_type: "delete_message",
            message_id: old.id,
            payload: {},
            at: now,
          });
        }
      }
      return events;
    };

    // Auto-name detection: if thread name is default and there's a user message
    let name = currentThreadName;
    if ((name === "新任务" || name === "") && messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === "user");
      if (firstUserMsg) {
        name = firstUserMsg.content.slice(0, 30).trim();
        if (firstUserMsg.content.length > 30) name += "...";
        setCurrentThreadName(name);
      }
    }

    const saveTimer = setTimeout(() => {
      const prev = lastPersistedMessagesRef.current;
      const currentMessages = cloneMessages(messages);
      const wd = currentThreadWorkingDir;

      if (!prev) {
        void threadService.saveThread(currentThreadId, name, currentMessages, wd)
          .then(() => {
            lastPersistedMessagesRef.current = cloneMessages(currentMessages);
            void refreshThreads();
          })
          .catch((error) => {
            console.warn("Failed to save thread:", error);
          });
        return;
      }

      const events = buildThreadEvents(prev, currentMessages);
      if (events.length === 0) return;

      void threadService.appendThreadEvents(currentThreadId, name, events, wd)
        .then(() => {
          lastPersistedMessagesRef.current = cloneMessages(currentMessages);
          void refreshThreads();
        })
        .catch((error) => {
          console.warn("Failed to append thread events, fallback to full snapshot:", error);
          void threadService.saveThread(currentThreadId, name, currentMessages, wd)
            .then(() => {
              lastPersistedMessagesRef.current = cloneMessages(currentMessages);
              void refreshThreads();
            })
            .catch((saveErr) => {
              console.warn("Failed to save thread snapshot:", saveErr);
            });
        });
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [messages, currentThreadId, currentThreadName, refreshThreads]);

  const fetchUserInfo = useCallback(async () => {
    if (!apiConfig) return;
    try {
      const response = await fetch("https://api.siliconflow.cn/v1/user/info", {
        headers: { "Authorization": `Bearer ${apiConfig.apiKey}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data) setUserInfo(data.data);
      }
    } catch (e) { }
  }, [apiConfig]);

  useEffect(() => {
    fetchUserInfo();
  }, [fetchUserInfo]);

  useEffect(() => {
    if (scrollRef.current && isUserAtBottomRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserAtBottomRef.current = distanceFromBottom < 50;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) isUserAtBottomRef.current = false;
  };

  const isThinking = messages.some(m => m.status === "running");
  const queuedCount = engineRef.current?.getQueueCount() || 0;
  const toolNames = engineRef.current?.getToolNames() ?? DEFAULT_TOOL_NAMES;
  const permissionLabelForUi =
    permissionMode === "full_access"
      ? translate(locale, "permission.fullAccess")
      : translate(locale, "permission.default");
  const isEngineReady = Boolean(engineRef.current);

  const handleSend = () => {
    if (!input.trim() || !engineRef.current) return;
    const query = input;
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    engineRef.current.processQuery(query, currentModel);
    setTimeout(fetchUserInfo, 100);
  };

  const handleStop = () => engineRef.current?.abort(true);

  const handleClear = () => {
    engineRef.current?.clear();
    const nextMessages: AgentMessage[] = [{
      id: "init-" + Date.now(),
      role: "assistant",
      content: "会话已清空。等待新指令...",
      status: "completed"
    }];
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
  };

  const toolCallCount = messages.reduce((acc, m) => acc + (m.steps?.length || 0), 0);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground selection:bg-primary/10 overflow-hidden font-sans">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-5 bg-card/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Terminal size={14} className="text-primary/70" />
          <h1 className="text-[12px] font-bold tracking-tight uppercase opacity-50 font-mono">
            TraceForge 智能实验室 / <span className="text-primary/60">{currentThreadName}</span> {currentThreadWorkingDir && <span className="text-[10px] opacity-30 lowercase italic ml-1">@{currentThreadWorkingDir}</span>}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <Badge variant="outline" className="h-5 text-[9px] px-1.5 font-mono border-primary/20 text-primary/60 bg-primary/5 cursor-default uppercase">
            逆向引擎: Rust v0.1.3
          </Badge>
          {toolCallCount > 0 && (
            <Badge variant="outline" className="h-5 text-[9px] px-1.5 font-mono border-green-500/30 text-green-500/70 bg-green-500/5">
              <Wrench size={9} className="mr-1" /> {toolCallCount} 工具已执行
            </Badge>
          )}
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", apiConfig ? "bg-green-500 animate-pulse" : "bg-red-500")} />
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1" key={currentThreadId || "default"}>

          {/* 侧边栏: 任务历史 (THREADS) */}
          <ResizablePanel
            panelRef={panelRef}
            id="agent-sidebar"
            defaultSize="18"
            minSize="15"
            maxSize="35"
            collapsible={true}
            collapsedSize={0}
            className="flex flex-col bg-muted/10 border-r border-border/30"
          >
            <ThreadSidebar
              threads={threads}
              currentThreadId={currentThreadId}
              editingId={editingId}
              editingName={editingName}
              onEditingNameChange={setEditingName}
              onNewThread={handleNewThread}
              onLoadThread={(id) => {
                void handleLoadThread(id);
              }}
              onStartRename={handleStartRename}
              onConfirmRename={() => {
                void handleConfirmRename();
              }}
              onCancelRename={() => setEditingId(null)}
              onDeleteThread={(id) => {
                void handleDeleteThread(id);
              }}
              onRevealThreads={() => {
                void handleRevealThreads();
              }}
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="hover:bg-primary/40 bg-border/20" />

          {/* 主面板: 消息流与输入层 */}
          <ResizablePanel
            id="agent-main-content"
            defaultSize="78"
            minSize="40"
            className="relative flex flex-col bg-background expert-grid"
          >
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent hover:scrollbar-thumb-border/50"
              ref={scrollRef}
              onScroll={handleScroll}
              onWheel={handleWheel}
            >
              <div className="max-w-3xl mx-auto px-6 py-10">
                <VirtualMessageList
                  items={messages}
                  itemKey={(message) => message.id}
                  scrollParentRef={scrollRef}
                  estimateHeight={260}
                  overscan={5}
                  enabled={messages.length > 24}
                  className="space-y-12"
                  renderItem={(message) => (
                    <AgentMessageItem
                      message={message}
                      contentSnapshot={message.content}
                      statusSnapshot={message.status ?? ""}
                      stepsSnapshot={getMessageStepsSnapshot(message)}
                    />
                  )}
                />

                {isThinking && (
                  <div className="flex flex-col space-y-4 py-4 opacity-50 animate-pulse">
                    <div className="h-px w-full bg-border/20" />
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-[11px] font-mono uppercase tracking-[0.2em]">正在深度检索符号表与环境诊断中...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <ComposerPanel
              input={input}
              isThinking={isThinking}
              isEngineReady={isEngineReady}
              currentModel={currentModel}
              availableModels={availableModels}
              onInputChange={(value, target) => {
                setInput(value);
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onClear={handleClear}
              onModelChange={setCurrentModel}
              onStop={handleStop}
              onSend={handleSend}
              inputRef={inputRef}
              toolNames={toolNames}
              queuedCount={queuedCount}
              permissionMode={permissionMode}
              permissionLabel={permissionLabelForUi}
              onPermissionChange={setPermissionMode}
              showUserPopover={showUserPopover}
              onUserPopoverChange={setShowUserPopover}
              userInfo={userInfo}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
