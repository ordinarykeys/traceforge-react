import {
  ChevronDown,
  ChevronRight,
  Filter,
  Folder,
  FolderOpen,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThreadMetadata } from "@/lib/agent/ThreadService";

interface ThreadSidebarProps {
  threads: ThreadMetadata[];
  currentThreadId: string | null;
  editingId: string | null;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onNewThread: (workingDir?: string) => void;
  onLoadThread: (id: string) => void;
  onStartRename: (thread: ThreadMetadata) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onDeleteThread: (id: string) => void;
  onRevealThreads: () => void;
}

export function ThreadSidebar({
  threads,
  currentThreadId,
  editingId,
  editingName,
  onEditingNameChange,
  onNewThread,
  onLoadThread,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onDeleteThread,
  onRevealThreads,
}: ThreadSidebarProps) {
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Group threads by working_dir (Project)
  const groupedProjects = useMemo(() => {
    const groups: Record<string, { name: string; threads: ThreadMetadata[] }> = {};

    threads.forEach((thread) => {
      const path = thread.working_dir || "default";
      if (!groups[path]) {
        // Extract folder name from path
        let name = "其他任务";
        if (thread.working_dir) {
          const parts = thread.working_dir.split(/[\\/]/);
          name = parts[parts.length - 1] || "未命名项目";
        }
        groups[path] = { name, threads: [] };
      }
      groups[path].threads.push(thread);
    });

    return Object.entries(groups).sort((a, b) => {
      if (a[0] === "default") return 1;
      if (b[0] === "default") return -1;
      return 0;
    });
  }, [threads]);

  const toggleProject = (path: string) => {
    const next = new Set(collapsedProjects);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsedProjects(next);
  };

  const handleAddProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目工作目录",
      });
      if (selected && typeof selected === "string") {
        onNewThread(selected);
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours} 小时`;
    const days = Math.floor(hours / 24);
    return `${days} 天`;
  };

  return (
    <div className="flex flex-col h-full bg-muted/20">
      <header className="h-11 flex items-center justify-between px-4 border-b border-border/10">
        <span className="text-[12px] font-semibold text-foreground/70">线程</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground">
            <Maximize2 size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground">
            <Filter size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5"
            onClick={handleAddProject}
          >
            <Plus size={16} />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {groupedProjects.map(([path, project]) => (
            <div key={path} className="space-y-1">
              {/* Project Header */}
              <div
                className="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-foreground/5 transition-colors"
                onClick={() => toggleProject(path)}
              >
                <Folder size={14} className="text-muted-foreground/60 group-hover:text-primary/70" />
                <span className="text-[13px] font-medium text-foreground/80 flex-1 truncate">
                  {project.name}
                </span>
                {collapsedProjects.has(path) ? (
                  <ChevronRight size={12} className="text-muted-foreground/40" />
                ) : (
                  <ChevronDown size={12} className="text-muted-foreground/40" />
                )}
              </div>

              {/* Sessions List */}
              {!collapsedProjects.has(path) && (
                <div className="space-y-0.5 ml-2 border-l border-border/10">
                  {project.threads.map((thread) => (
                    <div
                      key={thread.id}
                      onClick={() => onLoadThread(thread.id)}
                      className={cn(
                        "group relative flex items-center justify-between pl-6 pr-2 py-2 rounded-lg cursor-pointer transition-all",
                        currentThreadId === thread.id
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        {editingId === thread.id ? (
                          <Input
                            autoFocus
                            className="h-6 w-full text-[12px] px-1 bg-background border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/20"
                            value={editingName}
                            onChange={(e) => onEditingNameChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onConfirmRename();
                              if (e.key === "Escape") onCancelRename();
                            }}
                            onBlur={onConfirmRename}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-[12px] truncate block">
                            {thread.name || "未命名任务"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Indicators for metrics */}
                        {thread.id.includes("met") && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono">
                            <span className="text-green-500/80">+237</span>
                            <span className="text-red-500/80">-10</span>
                          </div>
                        )}

                        <span className="text-[11px] text-muted-foreground/40 whitespace-nowrap">
                          {formatRelativeTime(thread.last_active)}
                        </span>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-primary transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal size={12} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-[180px] bg-card/95 backdrop-blur-md border-border/50"
                          >
                            <DropdownMenuItem
                              className="text-[11px] flex items-center gap-2"
                              onClick={onRevealThreads}
                            >
                              <FolderOpen size={13} /> Open in Explorer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-[11px] flex items-center gap-2"
                              onClick={() => onStartRename(thread)}
                            >
                              <Pencil size={13} /> 重命名项目
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border/30" />
                            <DropdownMenuItem
                              className="text-[11px] flex items-center gap-2 text-destructive focus:text-destructive"
                              onClick={() => onDeleteThread(thread.id)}
                            >
                              <X size={13} /> 删除项目
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
