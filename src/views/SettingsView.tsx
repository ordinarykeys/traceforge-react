import { useEffect, useState } from "react";
import {
  Palette,
  Monitor,
  Sun,
  Moon,
  Layout,
  ChevronRight,
  Code2,
  BellRing,
  Download,
  FolderOpen,
  Keyboard,
  Link2,
  Rocket,
  Save,
} from "lucide-react";
import { useThemeStore, type Theme } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate, type AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkForUpdates, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { StateFlags, saveWindowState } from "@tauri-apps/plugin-window-state";
import { isEnabled as isAutostartEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isRegistered as isShortcutRegistered } from "@tauri-apps/plugin-global-shortcut";
import { getCurrent as getCurrentDeepLink } from "@tauri-apps/plugin-deep-link";
import {
  loadUpdateChannel,
  saveUpdateChannel,
  type UpdateChannel,
} from "@/lib/desktopIntegrationsStorage";
import {
  loadTerminalShellType,
  saveTerminalShellType,
  type TerminalShellType,
} from "@/lib/terminalShellStorage";

const THEMES: { id: Theme; color: string }[] = [
  { id: "zinc", color: "bg-zinc-500" },
  { id: "slate", color: "bg-slate-500" },
  { id: "stone", color: "bg-stone-500" },
  { id: "gray", color: "bg-gray-500" },
  { id: "neutral", color: "bg-neutral-500" },
];

const GLOBAL_WAKE_SHORTCUT = "CommandOrControl+Shift+T";
const DEEP_LINK_SAMPLE = "lumo://open?tab=agent";

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

  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [shortcutReady, setShortcutReady] = useState(false);
  const [lastDeepLink, setLastDeepLink] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>("stable");
  const [terminalShellType, setTerminalShellType] = useState<TerminalShellType>("powershell");
  const languageOptions: Array<{ code: AppLocale; label: string }> = [
    { code: "zh-CN", label: translate(locale, "settings.language.zh") },
    { code: "en-US", label: translate(locale, "settings.language.en") },
    { code: "ja-JP", label: translate(locale, "settings.language.ja") },
    { code: "ko-KR", label: translate(locale, "settings.language.ko") },
    { code: "fr-FR", label: translate(locale, "settings.language.fr") },
    { code: "de-DE", label: translate(locale, "settings.language.de") },
    { code: "es-ES", label: translate(locale, "settings.language.es") },
    { code: "ru-RU", label: translate(locale, "settings.language.ru") },
  ];

  const desktopText = {
    section: translate(locale, "settings.desktop.section"),
    sectionDesc: translate(locale, "settings.desktop.sectionDesc"),
    autostart: translate(locale, "settings.desktop.autostart"),
    autostartDesc: translate(locale, "settings.desktop.autostartDesc"),
    updater: translate(locale, "settings.desktop.updater"),
    updaterDesc: translate(locale, "settings.desktop.updaterDesc"),
    channel: translate(locale, "settings.desktop.channel"),
    channelDesc: translate(locale, "settings.desktop.channelDesc"),
    stable: translate(locale, "settings.desktop.stable"),
    beta: translate(locale, "settings.desktop.beta"),
    updaterAction: translate(locale, "settings.desktop.updaterAction"),
    notification: translate(locale, "settings.desktop.notification"),
    notificationDesc: translate(locale, "settings.desktop.notificationDesc"),
    notificationAction: translate(locale, "settings.desktop.notificationAction"),
    windowState: translate(locale, "settings.desktop.windowState"),
    windowStateDesc: translate(locale, "settings.desktop.windowStateDesc"),
    windowStateAction: translate(locale, "settings.desktop.windowStateAction"),
    shortcut: translate(locale, "settings.desktop.shortcut"),
    shortcutDesc: translate(locale, "settings.desktop.shortcutDesc", { shortcut: GLOBAL_WAKE_SHORTCUT }),
    deepLink: translate(locale, "settings.desktop.deepLink"),
    deepLinkDesc: translate(locale, "settings.desktop.deepLinkDesc"),
    opener: translate(locale, "settings.desktop.opener"),
    openerDesc: translate(locale, "settings.desktop.openerDesc"),
    openStorage: translate(locale, "settings.desktop.openStorage"),
    openDocs: translate(locale, "settings.desktop.openDocs"),
  };

  useEffect(() => {
    let cancelled = false;

    const loadDesktopIntegrations = async () => {
      try {
        const [autostart, shortcut, deepLinkCurrent, channel] = await Promise.all([
          isAutostartEnabled().catch(() => false),
          isShortcutRegistered(GLOBAL_WAKE_SHORTCUT).catch(() => false),
          getCurrentDeepLink().catch(() => null),
          loadUpdateChannel().catch(() => "stable" as UpdateChannel),
        ]);
        const shellType = await loadTerminalShellType().catch(
          () => "powershell" as TerminalShellType,
        );

        if (cancelled) return;
        setAutostartEnabled(autostart);
        setShortcutReady(shortcut);
        setLastDeepLink(deepLinkCurrent?.[0] ?? null);
        setUpdateChannel(channel);
        setTerminalShellType(shellType);
      } catch {
        if (!cancelled) {
          setAutostartEnabled(false);
          setShortcutReady(false);
          setLastDeepLink(null);
          setUpdateChannel("stable");
          setTerminalShellType("powershell");
        }
      }
    };

    void loadDesktopIntegrations();

    return () => {
      cancelled = true;
    };
  }, []);

  const onToggleAutostart = async (enabled: boolean) => {
    setAutostartEnabled(enabled);
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      toast.success(
        translate(locale, enabled ? "settings.desktop.autostartEnabled" : "settings.desktop.autostartDisabled"),
      );
    } catch (error) {
      setAutostartEnabled(!enabled);
      toast.error(
        translate(locale, "settings.desktop.autostartUpdateFailed"),
      );
      console.error("Failed to toggle autostart:", error);
    }
  };

  const onCheckUpdates = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);

    try {
      const update = await checkForUpdates({
        target: updateChannel,
        headers: {
          "X-Lumo-Channel": updateChannel,
        },
      });
      if (!update) {
        toast.success(translate(locale, "settings.desktop.alreadyLatest"));
        return;
      }

      toast.message(
        translate(locale, "settings.desktop.updateFound", { version: update.version }),
      );

      let downloadedBytes = 0;
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
        }
        if (event.event === "Finished") {
          toast.success(
            translate(locale, "settings.desktop.updateDownloaded", {
              kb: Math.round(downloadedBytes / 1024),
            }),
          );
        }
      });

      await relaunch();
    } catch (error) {
      console.error("[lumo-updater] check:failed", { channel: updateChannel, error });
      toast.error(
        translate(locale, "settings.desktop.updateCheckFailed"),
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const onChangeUpdateChannel = async (channel: UpdateChannel) => {
    setUpdateChannel(channel);
    try {
      await saveUpdateChannel(channel);
      toast.success(
        translate(locale, "settings.desktop.channelSwitched", {
          channel: channel === "stable" ? desktopText.stable : desktopText.beta,
        }),
      );
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.channelSaveFailed"));
      console.error("Failed to persist update channel:", error);
    }
  };

  const onChangeTerminalShellType = async (shellType: TerminalShellType) => {
    setTerminalShellType(shellType);
    try {
      await saveTerminalShellType(shellType);
      toast.success(
        translate(locale, "settings.desktop.shellSwitched", {
          shell: shellType === "cmd" ? "CMD" : "PowerShell",
        }),
      );
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.shellSaveFailed"));
      console.error("Failed to save terminal shell:", error);
    }
  };

  const onTestNotification = async () => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }

      if (!granted) {
        toast.error(translate(locale, "settings.desktop.notificationDenied"));
        return;
      }

      sendNotification({
        title: "Lumo Coding",
        body: translate(locale, "settings.desktop.notificationBody"),
      });
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.notificationFailed"));
      console.error("Failed to send notification:", error);
    }
  };

  const onSaveWindowState = async () => {
    try {
      await saveWindowState(StateFlags.ALL);
      toast.success(translate(locale, "settings.desktop.windowStateSaved"));
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.windowStateSaveFailed"));
      console.error("Failed to save window state:", error);
    }
  };

  const onOpenStorageDirectory = async () => {
    try {
      await invoke("open_storage_directory");
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.openStorageFailed"));
      console.error("Failed to open storage directory:", error);
    }
  };

  const onOpenTauriDocs = async () => {
    try {
      await invoke("open_tauri_docs");
    } catch (error) {
      toast.error(translate(locale, "settings.desktop.openDocsFailed"));
      console.error("Failed to open docs:", error);
    }
  };

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
              <div className="flex flex-wrap items-center gap-2 p-1">
                {languageOptions.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => setLocale(item.code)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                      locale === item.code
                        ? "border-border/60 bg-background text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
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

            <div className="border-b border-border/40 border-t border-t-border/20 bg-muted/10 px-5 py-3">
              <div className="flex items-center gap-2 text-primary/70">
                <Rocket className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {desktopText.section}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {desktopText.sectionDesc}
                  </span>
                </div>
              </div>
            </div>

            <SettingRow label={desktopText.autostart} description={desktopText.autostartDesc}>
              <Switch checked={autostartEnabled} onCheckedChange={onToggleAutostart} />
            </SettingRow>

            <SettingRow label={desktopText.channel} description={desktopText.channelDesc}>
              <div className="flex items-center gap-2 p-1">
                <button
                  onClick={() => void onChangeUpdateChannel("stable")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    updateChannel === "stable"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  {desktopText.stable}
                </button>
                <button
                  onClick={() => void onChangeUpdateChannel("beta")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    updateChannel === "beta"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  {desktopText.beta}
                </button>
              </div>
            </SettingRow>

            <SettingRow
              label={translate(locale, "settings.desktop.shellLabel")}
              description={translate(locale, "settings.desktop.shellDesc")}
            >
              <div className="flex items-center gap-2 p-1">
                <button
                  onClick={() => void onChangeTerminalShellType("powershell")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    terminalShellType === "powershell"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  PowerShell
                </button>
                <button
                  onClick={() => void onChangeTerminalShellType("cmd")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all",
                    terminalShellType === "cmd"
                      ? "border-border/60 bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground/80",
                  )}
                >
                  CMD
                </button>
              </div>
            </SettingRow>

            <SettingRow label={desktopText.updater} description={desktopText.updaterDesc}>
              <Button
                size="sm"
                variant="outline"
                onClick={onCheckUpdates}
                disabled={isCheckingUpdate}
                className="h-8 text-[11px]"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {isCheckingUpdate
                  ? translate(locale, "settings.desktop.checking")
                  : desktopText.updaterAction}
              </Button>
            </SettingRow>

            <SettingRow label={desktopText.notification} description={desktopText.notificationDesc}>
              <Button size="sm" variant="outline" onClick={onTestNotification} className="h-8 text-[11px]">
                <BellRing className="mr-1.5 h-3.5 w-3.5" />
                {desktopText.notificationAction}
              </Button>
            </SettingRow>

            <SettingRow label={desktopText.windowState} description={desktopText.windowStateDesc}>
              <Button size="sm" variant="outline" onClick={onSaveWindowState} className="h-8 text-[11px]">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {desktopText.windowStateAction}
              </Button>
            </SettingRow>

            <SettingRow label={desktopText.shortcut} description={desktopText.shortcutDesc}>
              <div className="flex items-center gap-2 text-[11px]">
                <Keyboard className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span
                  className={cn(
                    "font-semibold",
                    shortcutReady ? "text-primary" : "text-muted-foreground/70",
                  )}
                >
                  {shortcutReady
                    ? translate(locale, "settings.desktop.shortcutRegistered")
                    : translate(locale, "settings.desktop.shortcutNotRegistered")}
                </span>
              </div>
            </SettingRow>

            <SettingRow
              label={desktopText.deepLink}
              description={`${desktopText.deepLinkDesc} - ${DEEP_LINK_SAMPLE}`}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="max-w-[320px] truncate font-mono text-muted-foreground/80">
                  {lastDeepLink || translate(locale, "settings.desktop.noLaunchDeepLink")}
                </span>
              </div>
            </SettingRow>

            <SettingRow label={desktopText.opener} description={desktopText.openerDesc}>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenStorageDirectory}
                  className="h-8 text-[11px]"
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {desktopText.openStorage}
                </Button>
                <Button size="sm" variant="outline" onClick={onOpenTauriDocs} className="h-8 text-[11px]">
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  {desktopText.openDocs}
                </Button>
              </div>
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
                    Lumo Coding Studio
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
