import { Suspense, lazy } from "react";
import {
  ArrowRightLeft
} from "lucide-react";

import { OUTPUT_ENCODING_OPTIONS } from "@/features/crypto/cryptoLabOptions";
import { useCryptoLab } from "@/hooks/useCryptoLab";
import { useThemeStore } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Shadcn UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LazyMonacoEditor = lazy(() => import("@monaco-editor/react"));

export default function CryptoLabView({ isSiderVisible = true }: { isSiderVisible?: boolean }) {
  const { isDark, codeFontSize, minimap, lineNumbers } = useThemeStore();
  const { locale } = useLocaleStore();
  const cryptoLab = useCryptoLab();

  const handleCopy = async (text: string, description: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(translate(locale, "crypto.toast.copied", { description }));
  };

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* 1. Algorithm Sider (Exactly 120px) */}
        {isSiderVisible && (
          <aside className="w-[120px] flex-shrink-0 border-r border-border bg-muted/10 animate-in slide-in-from-left duration-300 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="py-2 space-y-4">
                {cryptoLab.constants.CRYPTO_TREE.map((category) => (
                  <div key={category.key} className="px-2">
                    <Label className="px-2 mb-1 text-[11px] font-bold text-muted-foreground/50 uppercase tracking-tighter">
                      {category.label}
                    </Label>
                    <div className="space-y-0.5">
                      {category.children.map((algo) => (
                        <Button
                          key={algo.key}
                          variant="ghost"
                          size="sm"
                          onClick={() => cryptoLab.setParams(p => ({ ...p, type: algo.key }))}
                          className={cn(
                            "w-full justify-start h-6 px-2 text-[12px] rounded-sm transition-all font-normal cursor-pointer",
                            cryptoLab.params.type === algo.key
                              ? "text-primary font-bold bg-accent/30"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {algo.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>
        )}

        {/* 2. Main Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ResizablePanelGroup orientation="vertical">
            {/* TOP: Code Panel */}
            <ResizablePanel defaultSize="20" minSize="60" >
              <div className="flex h-full flex-col">
                <div className="flex-1 min-h-0">
                  <Suspense
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-muted/10">
                        <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground/70">
                          {translate(locale, "agent.thinking")}
                        </span>
                      </div>
                    }
                  >
                    <LazyMonacoEditor
                      height="100%"
                      language="javascript"
                      value={cryptoLab.generatedCode || translate(locale, "crypto.placeholder.selectAlgorithm")}
                      theme={isDark ? "tf-dark" : "light"}
                      onChange={(value) => cryptoLab.setGeneratedCode(value || "")}
                      beforeMount={(monaco) => {
                        monaco.editor.defineTheme('tf-dark', {
                          base: 'vs-dark',
                          inherit: true,
                          rules: [],
                          colors: {
                            'editor.background': '#121314',
                            'editor.lineHighlightBackground': '#1a1b1c',
                            'editorLineNumber.foreground': '#606366',
                            'editor.selectionBackground': '#264f78',
                            'editorIndentGuide.background': '#1a1b1c',
                            'editorGutter.background': '#121314',
                          }
                        });
                      }}
                      options={{
                        fontSize: codeFontSize,
                        fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
                        minimap: { enabled: minimap },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        readOnly: false,
                        lineNumbers: lineNumbers ? "on" : "off",
                        padding: { top: 10, bottom: 10 },
                        scrollbar: {
                          vertical: 'visible',
                          horizontal: 'visible',
                          verticalScrollbarSize: 10,
                          horizontalScrollbarSize: 10,
                        }
                      }}
                    />
                  </Suspense>
                </div>

                {/* Code Toolbar */}
                <footer className="flex h-10 items-center justify-between px-3 border-t border-border bg-muted/5">
                  <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
                    {cryptoLab.showOutputFormat && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {translate(locale, "crypto.label.output")}
                        </span>
                        <Select value={cryptoLab.params.outputFormat} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, outputFormat: v }))}>
                          <SelectTrigger className="h-6 w-16 text-[11px] border-none bg-background/50 shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.OUTPUT_FORMATS.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showOutputEncoding && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {translate(locale, "crypto.label.encoding")}
                        </span>
                        <Select value={cryptoLab.params.outputEncoding} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, outputEncoding: v }))}>
                          <SelectTrigger className="h-6 w-20 text-[11px] border-none bg-background/50 shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                          <SelectContent>{OUTPUT_ENCODING_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="default"
                      size="sm"
                      className={cn(
                        "h-7 min-w-[60px] text-[11px] font-bold px-3",
                        cryptoLab.previewLoading && cryptoLab.params.isEncrypt && "opacity-70 cursor-wait"
                      )}
                      disabled={cryptoLab.previewLoading}
                      onClick={async () => {
                        await cryptoLab.runEncryptPreview();
                        toast.success(
                          translate(locale, "crypto.toast.actionSuccess", {
                            action: cryptoLab.encryptActionLabel,
                          }),
                        );
                      }}
                    >
                      {cryptoLab.encryptActionLabel}
                    </Button>
                    {cryptoLab.canDecrypt && (
                      <Button
                        variant="default"
                        size="sm"
                        className={cn(
                          "h-7 min-w-[60px] text-[10px] font-bold px-3",
                          cryptoLab.previewLoading && !cryptoLab.params.isEncrypt && "opacity-70 cursor-wait"
                        )}
                        disabled={cryptoLab.previewLoading}
                        onClick={async () => {
                          await cryptoLab.runDecryptPreview();
                          toast.success(
                            translate(locale, "crypto.toast.actionSuccess", {
                              action: cryptoLab.decryptActionLabel,
                            }),
                          );
                        }}
                      >
                        {cryptoLab.decryptActionLabel}
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 text-[11px] font-bold p-0 border-primary/30 text-red-500 hover:bg-primary/5"
                          disabled={cryptoLab.easyModuleLoading}
                          onClick={async () => {
                            await cryptoLab.copyEasyLanguageModule();
                            toast.success(translate(locale, "crypto.toast.easyModuleCopied"));
                          }}
                        >
                          E
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[11px] py-1 px-2">
                        {translate(locale, "crypto.tooltip.easyModule")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          className={cn(
                            "h-7 text-[11px] font-bold px-4",
                            cryptoLab.loading && "opacity-70 cursor-wait"
                          )}
                          disabled={cryptoLab.loading}
                          onClick={async () => {
                            await cryptoLab.generateCode();
                            toast.success(translate(locale, "crypto.toast.jsGenerated"));
                          }}
                        >
                          {translate(locale, "crypto.button.generateJs")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[11px] py-1 px-2">
                        {translate(locale, "crypto.tooltip.generateJs")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] font-bold px-3 border-primary/30 text-primary hover:bg-primary/5"
                          disabled={!cryptoLab.generatedCode}
                          onClick={() => handleCopy(cryptoLab.generatedCode, translate(locale, "crypto.button.generateJs"))}
                        >
                          {translate(locale, "crypto.button.copyJs")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[11px] py-1 px-2">
                        {translate(locale, "crypto.tooltip.copyJs")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </footer>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* BOTTOM: Parameters & Workspace */}
            <ResizablePanel defaultSize="30"
              minSize="30">
              <div className="flex h-full flex-col overflow-hidden bg-background">
                {/* Algorithm Parameters Toolbar */}
                {cryptoLab.hasAnyParameter && (
                  <div className="flex h-9 items-center gap-4 px-3 bg-muted/10 border-b border-border overflow-x-auto no-scrollbar shrink-0">
                    {cryptoLab.showSubType && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.subtype")}
                        </Label>
                        <Select value={cryptoLab.params.subType} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, subType: v }))}>
                          <SelectTrigger className="h-6 min-w-24 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-[300px]">{cryptoLab.subTypeOptions.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showMode && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.mode")}
                        </span>
                        <Select value={cryptoLab.params.mode} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, mode: v }))}>
                          <SelectTrigger className="h-6 w-16 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.modeOptions.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showPadding && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.padding")}
                        </span>
                        <Select value={cryptoLab.params.padding} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, padding: v }))}>
                          <SelectTrigger className="h-6 w-24 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.PADDING_TYPES.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showKeyEncoding && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.keyEncoding")}
                        </span>
                        <Select value={cryptoLab.params.keyEncoding} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, keyEncoding: v }))}>
                          <SelectTrigger className="h-6 w-16 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.ENCODING_TYPES.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showIvEncoding && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.ivEncoding")}
                        </span>
                        <Select value={cryptoLab.params.ivEncoding} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, ivEncoding: v }))}>
                          <SelectTrigger className="h-6 w-16 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.ENCODING_TYPES.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showRsaPadding && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.rsaPadding")}
                        </span>
                        <Select value={cryptoLab.params.rsaPadding} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, rsaPadding: v }))}>
                          <SelectTrigger className="h-6 w-24 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.RSA_PADDINGS.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showKeySize && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.keySize")}
                        </span>
                        <Select value={cryptoLab.params.keySize.toString()} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, keySize: parseInt(v) }))}>
                          <SelectTrigger className="h-6 w-16 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>{cryptoLab.constants.KEY_SIZES.map(o => <SelectItem key={o.toString()} value={o.toString()} className="text-[11px]">{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showProtobufInputFormat && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.inputFormat")}
                        </span>
                        <Select
                          value={cryptoLab.params.protobufInputFormat}
                          onValueChange={(v) =>
                            cryptoLab.setParams((p) => ({
                              ...p,
                              protobufInputFormat: v as "hex" | "base64",
                            }))
                          }
                        >
                          <SelectTrigger className="h-6 w-20 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hex" className="text-[11px]">hex</SelectItem>
                            <SelectItem value="base64" className="text-[11px]">base64</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.showSm2CipherMode && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.sm2Mode")}
                        </span>
                        <Select value={cryptoLab.params.sm2CipherMode.toString()} onValueChange={(v) => cryptoLab.setParams(p => ({ ...p, sm2CipherMode: parseInt(v) }))}>
                          <SelectTrigger className="h-6 w-24 text-[11px] border-none bg-background/80"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="1" className="text-[11px]">C1C3C2</SelectItem><SelectItem value="0" className="text-[11px]">C1C2C3</SelectItem></SelectContent>
                        </Select>
                      </div>
                    )}
                    {cryptoLab.needsKey && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase whitespace-nowrap">{cryptoLab.compactKeyLabel}</span>
                        <Input className="h-6 min-w-32 max-w-48 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.key} onChange={(e) => cryptoLab.setParams(p => ({ ...p, key: e.target.value }))} />
                      </div>
                    )}
                    {cryptoLab.showIv && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.iv")}
                        </span>
                        <Input className="h-6 min-w-32 max-w-48 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.iv} onChange={(e) => cryptoLab.setParams(p => ({ ...p, iv: e.target.value }))} />
                      </div>
                    )}
                    {cryptoLab.showSalt && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">Salt</span>
                        <Input className="h-6 w-24 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.salt} onChange={(e) => cryptoLab.setParams(p => ({ ...p, salt: e.target.value }))} />
                      </div>
                    )}
                    {cryptoLab.showIterations && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.iterations")}
                        </span>
                        <Input type="number" className="h-6 w-16 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.iterations} onChange={(e) => cryptoLab.setParams(p => ({ ...p, iterations: parseInt(e.target.value) }))} />
                      </div>
                    )}
                    {cryptoLab.showCostFactor && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">N</span>
                        <Input type="number" className="h-6 w-16 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.costFactor} onChange={(e) => cryptoLab.setParams(p => ({ ...p, costFactor: parseInt(e.target.value) }))} />
                      </div>
                    )}
                    {cryptoLab.showBlockSizeFactor && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">r</span>
                        <Input type="number" className="h-6 w-14 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.blockSizeFactor} onChange={(e) => cryptoLab.setParams(p => ({ ...p, blockSizeFactor: parseInt(e.target.value) }))} />
                      </div>
                    )}
                    {cryptoLab.showParallelism && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">p</span>
                        <Input type="number" className="h-6 w-14 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.parallelism} onChange={(e) => cryptoLab.setParams(p => ({ ...p, parallelism: parseInt(e.target.value) }))} />
                      </div>
                    )}
                    {cryptoLab.showUserId && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">UserID</span>
                        <Input className="h-6 w-24 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.userId} onChange={(e) => cryptoLab.setParams(p => ({ ...p, userId: e.target.value }))} />
                      </div>
                    )}
                    {cryptoLab.showXorInitialKey && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                          {translate(locale, "crypto.label.xorInitialKey")}
                        </span>
                        <Input type="number" className="h-6 w-14 border-none text-[11px] bg-background/80 px-2" value={cryptoLab.params.xorInitialKey} onChange={(e) => cryptoLab.setParams(p => ({ ...p, xorInitialKey: parseInt(e.target.value) }))} />
                      </div>
                    )}
                  </div>
                )}

                {/* Workspace Grid */}
                <div className="flex-1 flex flex-col min-h-0 divide-y divide-border">
                  <div className="relative flex-1 flex min-h-0 divide-x divide-border">
                    {/* Input */}
                    <section className="flex-1 flex flex-col min-w-0">
                      <header className="flex h-7 items-center justify-between px-3 bg-muted/5 border-b border-border/50">
                        <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
                          {translate(locale, "crypto.label.input")}
                        </Label>
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono border-muted-foreground/20 text-muted-foreground/60 rounded-full">{cryptoLab.params.input.length}</Badge>
                      </header>
                      <Textarea
                        className="flex-1 resize-none border-none p-3 font-mono text-[13px] bg-transparent focus-visible:ring-0 leading-relaxed"
                        placeholder={translate(locale, "crypto.placeholder.input")}
                        value={cryptoLab.params.input}
                        onChange={(e) => cryptoLab.setParams(p => ({ ...p, input: e.target.value }))}
                      />
                    </section>

                    {/* Swap Button */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-sm bg-background/80 shadow-md border-border group backdrop-blur-sm" onClick={cryptoLab.swapInputAndOutput} disabled={!cryptoLab.canSwapIO}>
                            <ArrowRightLeft size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {translate(locale, "crypto.tooltip.swapIO")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Result Panel */}
                    <section className="flex-1 flex flex-col min-w-0 bg-muted/5">
                      <header className="flex h-7 items-center justify-between px-3 bg-muted/10 border-b border-border/50">
                        <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
                          {translate(locale, "crypto.label.result")}
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[11px] font-bold px-1.5"
                          onClick={() => handleCopy(cryptoLab.previewDisplay, translate(locale, "crypto.label.result"))}
                        >
                          {translate(locale, "crypto.button.copy")}
                        </Button>
                      </header>
                      <ScrollArea className="flex-1">
                        <div className="p-3 space-y-4">
                          <div className="space-y-1">
                            <pre className="font-mono text-[13px] leading-6 text-foreground/90 whitespace-pre-wrap break-all bg-transparent">{cryptoLab.previewDisplay}</pre>
                          </div>
                          {cryptoLab.previewDetailText && (
                            <div className="space-y-1 animate-in fade-in duration-500">
                              <Label className="text-[11px] font-bold text-primary/60 uppercase tracking-wider">
                                {translate(locale, "crypto.label.previewDetail")}
                              </Label>
                              <pre className="font-mono text-[12px] leading-5 text-muted-foreground bg-background/20 p-2 rounded-sm border border-border/20">{cryptoLab.previewDetailText}</pre>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </section>
                  </div>

                  {/* RSA / SM2 Auxiliary Grid */}
                  {(cryptoLab.showPublicKey || cryptoLab.showPrivateKey || cryptoLab.showSignature) && (
                    <div className="h-[140px] shrink-0 flex divide-x divide-border bg-muted/10 border-t border-border animate-in slide-in-from-bottom duration-300">
                      {cryptoLab.showPublicKey && (
                        <section className="flex-1 flex flex-col min-w-0">
                          <header className="flex h-6 items-center justify-between px-2 bg-muted/20 border-b border-border/50">
                            <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                              {translate(locale, "crypto.label.publicKey")}
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 text-[10px] px-1"
                              onClick={() => handleCopy(cryptoLab.params.publicKey, translate(locale, "crypto.label.publicKey"))}
                            >
                              {translate(locale, "crypto.button.copy")}
                            </Button>
                          </header>
                          <Textarea className="flex-1 resize-none border-none p-2 font-mono text-[11px] bg-transparent focus-visible:ring-0 leading-tight" placeholder="Paste Public Key here..." value={cryptoLab.params.publicKey} onChange={(e) => cryptoLab.setParams(p => ({ ...p, publicKey: e.target.value }))} />
                        </section>
                      )}
                      {cryptoLab.showPrivateKey && (
                        <section className="flex-1 flex flex-col min-w-0 border-l border-border">
                          <header className="flex h-6 items-center justify-between px-2 bg-muted/20 border-b border-border/50">
                            <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                              {translate(locale, "crypto.label.privateKey")}
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 text-[10px] px-1"
                              onClick={() => handleCopy(cryptoLab.params.privateKey, translate(locale, "crypto.label.privateKey"))}
                            >
                              {translate(locale, "crypto.button.copy")}
                            </Button>
                          </header>
                          <Textarea className="flex-1 resize-none border-none p-2 font-mono text-[11px] bg-transparent focus-visible:ring-0 leading-tight" placeholder="Paste Private Key here..." value={cryptoLab.params.privateKey} onChange={(e) => cryptoLab.setParams(p => ({ ...p, privateKey: e.target.value }))} />
                        </section>
                      )}
                      {cryptoLab.showSignature && (
                        <section className="flex-1 flex flex-col min-w-0 border-l border-border">
                          <header className="flex h-6 items-center justify-between px-2 bg-muted/20 border-b border-border/50">
                            <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase">
                              {translate(locale, "crypto.label.signatureResult")}
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 text-[10px] px-1"
                              onClick={() => handleCopy(cryptoLab.params.signature, translate(locale, "crypto.label.signatureResult"))}
                            >
                              {translate(locale, "crypto.button.copy")}
                            </Button>
                          </header>
                          <Textarea className="flex-1 resize-none border-none p-2 font-mono text-[11px] bg-transparent focus-visible:ring-0 leading-tight" placeholder="Paste Signature here..." value={cryptoLab.params.signature} onChange={(e) => cryptoLab.setParams(p => ({ ...p, signature: e.target.value }))} />
                        </section>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </TooltipProvider>
  );
}
