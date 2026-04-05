import {
  Palette,
  Monitor,
  Sun,
  Moon,
  Layout,
  ChevronRight,
  Code2,
} from "lucide-react";
import { useThemeStore, type Theme } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const THEMES: { id: Theme; color: string }[] = [
  { id: "zinc", color: "bg-zinc-500" },
  { id: "slate", color: "bg-slate-500" },
  { id: "stone", color: "bg-stone-500" },
  { id: "gray", color: "bg-gray-500" },
  { id: "neutral", color: "bg-neutral-500" },
];

function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/40 px-4 py-4 transition-colors group hover:bg-muted/5",
        className,
      )}
    >
      <div className="space-y-0.5">
        <div className="text-[13px] font-semibold text-foreground/90">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground/60">{description}</div>
        )}
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function ThemePreviewBox() {
  const { theme, codeFontSize } = useThemeStore();
  const { locale } = useLocaleStore();

  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/20" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/20" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-500/20" />
        </div>
        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 font-mono">
          {translate(locale, "settings.preview")}
        </span>
      </div>
      <div className="relative p-5 font-mono leading-6" style={{ fontSize: `${codeFontSize - 2}px` }}>
        <div className="flex gap-5">
          <div className="w-4 select-none text-right font-light text-muted-foreground/20">
            1
            <br />
            2
            <br />
            3
            <br />
            4
            <br />
            5
          </div>
          <div className="flex-1">
            <span className="font-medium italic text-primary">const</span>{" "}
            <span className="text-foreground">themePreview</span> = {"{"}
            <br />
            &nbsp;&nbsp;
            <span className="text-muted-foreground/70">surface</span>:{" "}
            <span className="text-green-500/80">"sidebar-elevated"</span>,
            <br />
            &nbsp;&nbsp;
            <span className="text-muted-foreground/70">accent</span>:{" "}
            <span className="text-blue-500/80">
              "#{theme === "zinc" ? "71717a" : "3b82f6"}"
            </span>
            ,
            <br />
            &nbsp;&nbsp;
            <span className="text-muted-foreground/70">contrast</span>:{" "}
            <span className="text-amber-500/80">68</span>
            <br />
            {"}"};
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsView() {
  const { locale, setLocale } = useLocaleStore();
  const {
    theme,
    themeMode,
    uiFontSize,
    codeFontSize,
    minimap,
    lineNumbers,
    contrast,
    isTranslucent,
    usePointerCursor,
    setTheme,
    setThemeMode,
    setUiFontSize,
    setCodeFontSize,
    setMinimap,
    setLineNumbers,
    setContrast,
    setTranslucent,
    setPointerCursor,
  } = useThemeStore();

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background selection:bg-primary/20">
      <header className="h-[64px] shrink-0 px-10 flex items-center">
        <h1 className="text-[20px] font-bold tracking-tight text-foreground/90">
          {translate(locale, "settings.title")}
        </h1>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-10 pb-20">
        <div className="mx-auto max-w-[760px] pt-2">
          <div className="mb-8 flex items-center justify-between px-1">
            <div className="space-y-1">
              <div className="text-[14px] font-bold text-foreground/90">
                {translate(locale, "settings.theme")}
              </div>
              <div className="text-balance text-[11px] text-muted-foreground/70">
                {translate(locale, "settings.themeDesc")}
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-1">
              <button
                onClick={() => setThemeMode("light")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-1.5 text-[11px] font-medium outline-none transition-all",
                  themeMode === "light"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                )}
              >
                <Sun className={cn("h-3.5 w-3.5", themeMode === "light" && "text-primary")} />
                <span>{translate(locale, "settings.light")}</span>
              </button>
              <button
                onClick={() => setThemeMode("dark")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-1.5 text-[11px] font-medium outline-none transition-all",
                  themeMode === "dark"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                )}
              >
                <Moon className={cn("h-3.5 w-3.5", themeMode === "dark" && "text-primary")} />
                <span>{translate(locale, "settings.dark")}</span>
              </button>
              <button
                onClick={() => setThemeMode("system")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-1.5 text-[11px] font-medium outline-none transition-all",
                  themeMode === "system"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                )}
              >
                <Monitor className={cn("h-3.5 w-3.5", themeMode === "system" && "text-primary")} />
                <span>{translate(locale, "settings.system")}</span>
              </button>
            </div>
          </div>

          <ThemePreviewBox />

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/5 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.05)]">
            <div className="border-b border-border/40 bg-muted/10 px-5 py-3">
              <div className="flex items-center gap-2 text-primary/70">
                <Palette className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {translate(locale, "settings.interfaceStyles")}
                </span>
              </div>
            </div>

            <SettingRow
              label={translate(locale, "settings.accent")}
              description={translate(locale, "settings.accentDesc")}
            >
              <div className="flex items-center gap-2 p-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-all",
                      theme === t.id
                        ? "scale-110 border-primary shadow-sm"
                        : "border-transparent opacity-60 hover:opacity-100",
                    )}
                  >
                    <div className={cn("h-full w-full rounded-full", t.color)} />
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.language")}
              description={translate(locale, "settings.languageDesc")}
            >
              <div className="flex items-center gap-2 p-1">
                <button
                  onClick={() => setLocale("zh-CN")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    locale === "zh-CN"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  {translate(locale, "settings.language.zh")}
                </button>
                <button
                  onClick={() => setLocale("en-US")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    locale === "en-US"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  {translate(locale, "settings.language.en")}
                </button>
              </div>
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.translucent")}
              description={translate(locale, "settings.translucentDesc")}
            >
              <Switch checked={isTranslucent} onCheckedChange={setTranslucent} />
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.contrast")}
              description={translate(locale, "settings.contrastDesc")}
            >
              <div className="flex w-56 items-center gap-5">
                <Slider
                  value={[contrast]}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    setContrast(val);
                  }}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="w-6 text-right text-[11px] font-bold text-foreground/80 font-mono">
                  {contrast}
                </span>
              </div>
            </SettingRow>

            <div className="border-b border-border/40 border-t border-t-border/20 bg-muted/10 px-5 py-3">
              <div className="flex items-center gap-2 text-primary/70">
                <Code2 className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {translate(locale, "settings.editorPrefs")}
                </span>
              </div>
            </div>

            <SettingRow
              label={translate(locale, "settings.uiFontSize")}
              description={translate(locale, "settings.uiFontSizeDesc")}
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={uiFontSize}
                  onChange={(e) => setUiFontSize(parseInt(e.target.value) || 12)}
                  className="h-8 w-[64px] border-border/60 bg-background px-2 text-center text-[12px] font-semibold"
                />
                <span className="w-4 text-[11px] font-bold uppercase text-muted-foreground/40">
                  px
                </span>
              </div>
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.codeFontSize")}
              description={translate(locale, "settings.codeFontSizeDesc")}
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={codeFontSize}
                  onChange={(e) => setCodeFontSize(parseInt(e.target.value) || 12)}
                  className="h-8 w-[64px] border-border/60 bg-background px-2 text-center text-[12px] font-semibold"
                />
                <span className="w-4 text-[11px] font-bold uppercase text-muted-foreground/40">
                  px
                </span>
              </div>
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.minimap")}
              description={translate(locale, "settings.minimapDesc")}
            >
              <Switch checked={minimap} onCheckedChange={setMinimap} />
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.lineNumbers")}
              description={translate(locale, "settings.lineNumbersDesc")}
            >
              <Switch checked={lineNumbers} onCheckedChange={setLineNumbers} />
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.pointerCursor")}
              description={translate(locale, "settings.pointerCursorDesc")}
            >
              <Switch checked={usePointerCursor} onCheckedChange={setPointerCursor} />
            </SettingRow>
          </div>

          <div className="group mt-12 mb-20 cursor-pointer rounded-2xl border border-border/60 bg-muted/5 transition-all hover:border-primary/20">
            <div className="flex items-center justify-between px-6 py-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/10 bg-primary/10">
                  <Layout className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="text-[15px] font-extrabold uppercase tracking-tight text-foreground/90">
                    TraceForge Studio
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground/60">
                    {translate(locale, "settings.aboutVersion")}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/20 transition-all group-hover:translate-x-1 group-hover:text-primary/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
