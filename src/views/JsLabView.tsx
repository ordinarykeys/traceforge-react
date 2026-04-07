import { Suspense, lazy, useMemo, useRef } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { Copy, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { useThemeStore } from "@/hooks/useThemeStore";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { buildInvocationTemplate, useJsLab } from "@/features/jsLab/useJsLab";

const LazyMonacoEditor = lazy(() => import("@monaco-editor/react"));

interface JsLabViewProps {
  isSiderVisible?: boolean;
}

export default function JsLabView({ isSiderVisible }: JsLabViewProps) {
  void isSiderVisible;
  const { locale } = useLocaleStore();
  const { isDark, codeFontSize, minimap, lineNumbers, fontFamily } = useThemeStore();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const {
    sourceCode,
    setSourceCode,
    executeMode,
    setExecuteMode,
    selectedFunction,
    setSelectedFunction,
    invocationText,
    setInvocationText,
    executionOutput,
    executionLogs,
    runError,
    hostLabel,
    isRunning,
    functionItems,
    sourceCharCount,
    sourceLineCount,
    execute,
    copyResult,
    loadStarter,
  } = useJsLab({ locale });

  const jumpToFunction = (name: string) => {
    const target = functionItems.find((item) => item.name === name);
    if (!target) return;

    const editor = editorRef.current;
    if (!editor) return;

    editor.setPosition({ lineNumber: target.line, column: 1 });
    editor.revealLineInCenter(target.line);
    editor.focus();
  };

  const onRun = async () => {
    try {
      await execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  const onCopyResult = async () => {
    await copyResult();
    toast.success(translate(locale, "jslab.copied"));
  };

  const logText = useMemo(() => {
    const chunks: string[] = [];

    if (hostLabel) {
      chunks.push(`[${translate(locale, "jslab.host")}] ${hostLabel}`);
    }

    if (executionOutput) {
      chunks.push(`=> ${executionOutput}`);
    }

    if (executionLogs.length > 0) {
      chunks.push(executionLogs.join("\n"));
    }

    if (chunks.length === 0) {
      return translate(locale, "jslab.logsEmpty");
    }

    return chunks.join("\n\n");
  }, [executionLogs, executionOutput, hostLabel, locale]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-[11px]",
              executeMode === "local_preview"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            onClick={() => setExecuteMode("local_preview")}
          >
            {translate(locale, "jslab.mode.local")}
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-[11px]",
              executeMode === "scriptcontrol"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            onClick={() => setExecuteMode("scriptcontrol")}
          >
            {translate(locale, "jslab.mode.host")}
          </button>
          <Badge variant="outline" className="h-5 text-[10px]">
            {selectedFunction || "-"}
          </Badge>
          <Badge variant="outline" className="h-5 text-[10px]">
            {translate(locale, "jslab.lines")}: {sourceLineCount}
          </Badge>
          <Badge variant="outline" className="h-5 text-[10px]">
            {translate(locale, "jslab.chars")}: {sourceCharCount}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              void onCopyResult();
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            {translate(locale, "jslab.copy")}
          </Button>
          <Button variant="outline" size="sm" className="h-7" onClick={loadStarter}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {translate(locale, "jslab.reset")}
          </Button>
          <Button size="sm" className="h-7" onClick={() => void onRun()} disabled={isRunning}>
            <Play className="mr-1 h-3.5 w-3.5" />
            {isRunning ? translate(locale, "jslab.running") : translate(locale, "jslab.run")}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize="56" minSize="35">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="17" minSize="11" maxSize="30">
              <div className="flex h-full flex-col border-r border-border/40 bg-muted/15">
                <div className="flex h-9 items-center justify-between border-b border-border/40 px-2.5">
                  <span className="text-[12px] font-semibold text-foreground/85">
                    {translate(locale, "jslab.functionList")}
                  </span>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {functionItems.length}
                  </Badge>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
                  {functionItems.length === 0 ? (
                    <div className="p-2 text-[11px] text-muted-foreground/70">
                      {translate(locale, "jslab.functionListEmpty")}
                    </div>
                  ) : (
                    functionItems.map((item) => (
                      <button
                        key={`${item.name}:${item.line}`}
                        type="button"
                        onClick={() => {
                          setSelectedFunction(item.name);
                          setInvocationText(buildInvocationTemplate(item.name));
                          jumpToFunction(item.name);
                        }}
                        className={cn(
                          "mb-1.5 flex w-full items-center justify-between rounded px-2 py-1.5 font-mono text-[11px] transition-colors",
                          selectedFunction === item.name
                            ? "bg-primary/15 text-primary"
                            : "text-foreground/85 hover:bg-muted/60",
                        )}
                      >
                        <span className="truncate pr-1.5">{item.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">L{item.line}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize="83" minSize="50">
              <div className="flex h-full flex-col">
                <div className="h-9 border-b border-border/40 px-3 text-[12px] font-semibold text-foreground/85 flex items-center">
                  {translate(locale, "jslab.source")}
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/70">
                        {translate(locale, "agent.thinking")}
                      </div>
                    }
                  >
                    <LazyMonacoEditor
                      height="100%"
                      language="javascript"
                      value={sourceCode}
                      theme={isDark ? "vs-dark" : "light"}
                      onMount={(editor) => {
                        editorRef.current = editor;
                      }}
                      onChange={(value) => setSourceCode(value || "")}
                      options={{
                        automaticLayout: true,
                        fontSize: codeFontSize,
                        fontFamily,
                        lineNumbers: lineNumbers ? "on" : "off",
                        minimap: { enabled: minimap },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        wordWrap: "on",
                        padding: { top: 8, bottom: 8 },
                      }}
                    />
                  </Suspense>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="24" minSize="16" maxSize="45" collapsible={false}>
          <Textarea
            value={invocationText}
            onChange={(e) => setInvocationText(e.target.value)}
            className="h-full w-full min-h-0 resize-none rounded-none border-0 border-b border-border/40 bg-card/20 px-2.5 py-2.5 font-mono text-[12px] focus-visible:ring-0"
            placeholder={translate(locale, "jslab.callPlaceholder")}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="20" minSize="12" maxSize="42" collapsible={false}>
          <div className="flex h-full flex-col bg-card/15">
            <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
              <pre className={cn("whitespace-pre-wrap font-mono text-[12px]", runError ? "text-destructive" : "text-foreground/90")}>
                {logText}
              </pre>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
