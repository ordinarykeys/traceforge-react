import { useMemo } from "react";
import { useThemeStore } from "@/hooks/useThemeStore";
import {
  Activity,
  ArrowUp,
  ChevronDown,
  Coins,
  Monitor,
  Square,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ToolPermissionMode } from "@/lib/agent/QueryEngine";

interface ModelInfo {
  id: string;
  label: string;
}

interface ComposerPanelProps {
  input: string;
  isThinking: boolean;
  isEngineReady: boolean;
  currentModel: string;
  availableModels: ModelInfo[];
  onInputChange: (value: string, target: HTMLTextAreaElement) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onClear: () => void;
  onModelChange: (modelId: string) => void;
  onStop: () => void;
  onSend: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  toolNames: string[];
  queuedCount: number;
  permissionMode: ToolPermissionMode;
  permissionLabel: string;
  onPermissionChange: (mode: ToolPermissionMode) => void;
  showUserPopover: boolean;
  onUserPopoverChange: (open: boolean) => void;
  userInfo: any;
}

const permissionOptions: Array<{ label: string; value: ToolPermissionMode }> = [
  { label: "默认权限", value: "default" },
  { label: "完全访问权限", value: "full_access" },
];

export function ComposerPanel({
  input,
  isThinking,
  isEngineReady,
  currentModel,
  availableModels,
  onInputChange,
  onKeyDown,
  onClear,
  onModelChange,
  onStop,
  onSend,
  inputRef,
  toolNames,
  queuedCount,
  permissionMode,
  permissionLabel,
  onPermissionChange,
  showUserPopover,
  onUserPopoverChange,
  userInfo,
}: ComposerPanelProps) {
  const { isTranslucent, isDark } = useThemeStore();
  const toolCount = toolNames.length;

  const balancePercent = useMemo(() => {
    if (!userInfo) return 0;

    const totalBalance = Number.parseFloat(userInfo.totalBalance ?? "0");
    const chargeBalance = Number.parseFloat(userInfo.chargeBalance ?? "0");
    if (!Number.isFinite(totalBalance) || totalBalance <= 0 || !Number.isFinite(chargeBalance)) {
      return 0;
    }

    return Math.min(100, (chargeBalance / totalBalance) * 100);
  }, [userInfo]);

  return (
    <div className="pb-6 flex flex-col items-center gap-4 shrink-0">
      <div className="max-w-3xl w-full relative group px-2">
        <div className="absolute inset-0 bg-primary/5 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-1000" />
        <div
          className={cn(
            "relative flex flex-col p-2.5 rounded-2xl border border-border/60 transition-all group-focus-within:border-primary/20 group-focus-within:shadow-primary/5",
            isTranslucent ? "bg-card/70 backdrop-blur-2xl" : "bg-card shadow-sm",
          )}
        >
          <Textarea
            ref={inputRef}
            className="min-h-[42px] max-h-[400px] w-full px-4 border-none bg-transparent focus-visible:ring-0 text-[14.5px] placeholder:text-muted-foreground/30 font-medium resize-none shadow-none focus:ring-0 py-3 scrollbar-none"
            placeholder="输入分析指令，例如：分析 MUJI 应用的所有网络请求或快速编写 Frida Hook..."
            value={input}
            onChange={(e) => onInputChange(e.target.value, e.target)}
            onKeyDown={onKeyDown}
            disabled={false}
          />

          <div className="flex items-center justify-between px-3 pt-1 pb-1">
            <div className="flex items-center gap-1.5 text-muted-foreground/40">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={onClear}
                title="清空当前会话"
              >
                <Trash2 size={15} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-bold hover:bg-muted flex items-center gap-1 max-w-[180px]"
                  >
                    <span className="truncate">{currentModel}</span>
                    <ChevronDown size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[260px] max-h-[300px] overflow-y-auto bg-card/95 backdrop-blur-md border-border/50"
                >
                  {availableModels.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      className={cn(
                        "text-[12px] font-medium cursor-pointer",
                        currentModel === model.id && "text-primary font-bold",
                      )}
                      onClick={() => onModelChange(model.id)}
                    >
                      {model.label}
                      {currentModel === model.id && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              {isThinking && (
                <Button
                  onClick={onStop}
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-full transition-all flex items-center justify-center shadow-md border border-background/10 group/stop",
                    isDark
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-black/90",
                  )}
                  title="中止当前任务"
                >
                  <Square size={10} className="fill-current" strokeWidth={0} />
                </Button>
              )}

              <Button
                onClick={onSend}
                size="icon"
                disabled={!input.trim() || !isEngineReady}
                className={cn(
                  "h-8 w-8 transition-all duration-300 rounded-full shadow-sm flex items-center justify-center",
                  isThinking
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : isDark
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-black/90",
                )}
                title={!isEngineReady ? "引擎未就绪" : isThinking ? "加入队列" : "发送指令"}
              >
                <ArrowUp size={18} strokeWidth={2} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl w-full flex items-center gap-4 px-4 pr-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground/50 hover:bg-muted flex items-center gap-2 px-2 rounded-lg bg-muted/20"
            >
              <Monitor size={12} className="opacity-70" /> 引擎就绪: {toolCount} 个逆向工具
              <ChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px] bg-card/95 border-border/50">
            {toolNames.map((toolName) => (
              <DropdownMenuItem key={toolName} className="text-[11px] font-mono">
                工具: {toolName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {queuedCount > 0 && (
          <Badge
            variant="outline"
            className="h-7 text-[10px] px-2.5 font-bold border-yellow-500/30 text-yellow-500 bg-yellow-500/5 animate-pulse flex items-center gap-1.5 rounded-lg shrink-0"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            任务队列: {queuedCount} 个待处理
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground/50 hover:bg-muted flex items-center gap-2 px-2 rounded-lg bg-muted/20 shrink-0"
            >
              <Activity size={12} className="opacity-70" /> {permissionLabel}
              <ChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[160px] bg-card/95 border-border/50">
            {permissionOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                className="text-[11px] flex justify-between items-center"
                onClick={() => onPermissionChange(option.value)}
              >
                {option.label}
                {permissionMode === option.value && "✓"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto">
          <div
            className="relative group/user"
            onMouseEnter={() => onUserPopoverChange(true)}
            onMouseLeave={() => onUserPopoverChange(false)}
          >
            <button className="h-6 w-6 rounded-lg bg-muted/20 border border-border/20 flex items-center justify-center hover:bg-muted/40 transition-all cursor-help">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  userInfo?.status === "normal" ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30",
                )}
              />
            </button>

            {showUserPopover && userInfo && (
              <div className="absolute bottom-full right-0 mb-3 w-[220px] p-4 rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                <header className="mb-3 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                  个人账户信息
                </header>
                <div className="space-y-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-end gap-1.5">
                      <span className="text-[18px] font-bold tracking-tight text-primary">
                        ¥{Number.parseFloat(userInfo.totalBalance).toFixed(2)}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono mb-1">元</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground/60 font-medium">
                      <span>当前可用余额</span>
                      <span className="text-[9px]">按量付费</span>
                    </div>
                  </div>

                  <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${balancePercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="flex flex-col border-l border-border/20 pl-2">
                      <span className="text-[9px] text-muted-foreground/40 uppercase">充值</span>
                      <span className="text-[11px] font-mono">¥{userInfo.chargeBalance}</span>
                    </div>
                    <div className="flex flex-col border-l border-border/20 pl-2">
                      <span className="text-[9px] text-muted-foreground/40 uppercase">状态</span>
                      <span className="text-[11px] font-mono text-green-500/70">正常</span>
                    </div>
                  </div>
                </div>

                <footer className="mt-4 pt-3 border-t border-border/10 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/30 italic">SiliconFlow 动力驱动</span>
                  <Coins size={10} className="text-primary/20" />
                </footer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
