import { Suspense, lazy, useState, useEffect, useRef, useCallback } from "react";
import {
  SquareCode,
  Network,
  Fingerprint,
  Settings,
  Bot,
  Layers,
  Globe,
  Zap,
  LogOut,
  ChevronRight,
  ChevronDown,
  Search,
  ExternalLink,
} from "lucide-react";
import { fetchUserInfo } from "@/lib/userService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import TitleBar from "@/components/layout/TitleBar";
import { useThemeStore } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate, type AppLocale } from "@/lib/i18n";
import {
  clearAuthConfig,
  loadAuthConfig,
  saveAuthConfig,
  type ApiConfig,
} from "@/lib/authStorage";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import {
  isRegistered as isGlobalShortcutRegistered,
  register as registerGlobalShortcut,
  unregister as unregisterGlobalShortcut,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrent as getCurrentDeepLink, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LazyCryptoLabView = lazy(() => import("./views/CryptoLabView"));
const LazyJsLabView = lazy(() => import("./views/JsLabView"));
const LazyRequestLabView = lazy(() => import("./views/RequestLabView"));
const LazySettingsView = lazy(() => import("./views/SettingsView"));
const LazyAgentWorkstationView = lazy(() => import("./views/AgentWorkstationView"));
const LazyLoginView = lazy(() => import("./views/LoginView"));

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidates = [record.value, record.amount, record.balance, record.totalBalance];
    for (const candidate of candidates) {
      const parsed = toFiniteNumber(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

const GLOBAL_WAKE_SHORTCUT = "CommandOrControl+Shift+T";

function resolveTabFromDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "traceforge:" && url.protocol !== "lumo:") return null;

    const tabCandidate =
      url.searchParams.get("tab")?.trim().toLowerCase() ||
      url.hostname.trim().toLowerCase() ||
      url.pathname.replace(/^\/+/, "").trim().toLowerCase();

    if (tabCandidate === "agent") return "/agent";
    if (tabCandidate === "crypto") return "/crypto";
    if (tabCandidate === "request") return "/request";
    if (tabCandidate === "settings") return "/settings";
    if (tabCandidate === "main" || tabCandidate === "js" || tabCandidate === "jslab") {
      return "/main";
    }
  } catch {
    return null;
  }

  return null;
}

function App() {
  const debugAuth = useCallback((...args: unknown[]) => {
    console.info("[lumo-auth]", new Date().toISOString(), ...args);
  }, []);

  useThemeStore();
  const { locale, setLocale } = useLocaleStore();
  const [activeTab, setActiveTab] = useState("/agent");
  const [isLocaleExpanded, setIsLocaleExpanded] = useState(false);
  const [localeSearch, setLocaleSearch] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [isSiderVisible, setIsSiderVisible] = useState(true);
  const isLogoutProcessing = useRef(false);
  const hasFetchedOnMainOpenRef = useRef(false);

  const [windowLabel, setWindowLabel] = useState<string>("");
  const [authStatus, setAuthStatus] = useState<
    "unauthenticated" | "authenticating" | "authenticated"
  >("unauthenticated");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginStatusText, setLoginStatusText] = useState(
    translate(locale, "login.status.connecting"),
  );
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const apiConfigRef = useRef<ApiConfig | null>(null);

  useEffect(() => {
    apiConfigRef.current = apiConfig;
  }, [apiConfig]);

  const setApiConfigStable = (next: ApiConfig | null) => {
    setApiConfig((prev) => {
      if (!prev && !next) return prev;
      if (
        prev &&
        next &&
        prev.baseUrl === next.baseUrl &&
        prev.apiKey === next.apiKey
      ) {
        return prev;
      }
      return next;
    });
  };

  const refreshUserInfo = useCallback(async (configArg?: ApiConfig) => {
    const config = configArg ?? apiConfigRef.current;
    if (!config) return;

    try {
      const info = await fetchUserInfo(config.baseUrl, config.apiKey);
      if (info && info.data) {
        setUserInfo(info.data);
        const amount =
          toFiniteNumber(info.data.balance) ??
          toFiniteNumber(info.data.chargeBalance) ??
          toFiniteNumber(info.data.totalBalance);
        if (amount !== null) {
          setBalance(`CNY ${amount.toFixed(2)}`);
        } else {
          setBalance(null);
          console.warn("Failed to resolve numeric balance from payload:", info.data);
        }
      } else {
        setUserInfo(null);
        setBalance(null);
      }
    } catch (err) {
      console.error("Failed to fetch balance", err);
    }
  }, []);

  const normalizeBaseUrl = (value: string) =>
    value.trim().endsWith("/") ? value.trim().slice(0, -1) : value.trim();

  const routeAuthWindows = useCallback(async () => {
    debugAuth("invoke route_auth_windows:start");
    const result = await invoke("route_auth_windows");
    debugAuth("invoke route_auth_windows:ok");
    return result;
  }, [debugAuth]);

  const routeToLogin = useCallback(async () => {
    debugAuth("invoke route_to_login:start");
    const result = await invoke("route_to_login");
    debugAuth("invoke route_to_login:ok");
    return result;
  }, [debugAuth]);

  const handleDeepLinkUrls = useCallback(async (urls: string[]) => {
    debugAuth("deep-link:received", { urls });
    for (const raw of urls) {
      const tab = resolveTabFromDeepLink(raw);
      if (!tab) continue;

      debugAuth("deep-link:resolved", { raw, tab });
      setActiveTab(tab);
      try {
        const currentWindow = getCurrentWindow();
        await currentWindow.show();
        await currentWindow.unminimize();
        await currentWindow.setFocus();
      } catch (error) {
        debugAuth("deep-link:focus-failed", error);
      }
      break;
    }
  }, [debugAuth]);

  const switchToMainWindow = useCallback(async (config: ApiConfig) => {
    await emitTo("main", "tf://auth-success", config).catch(() => undefined);
    await routeAuthWindows();
  }, [routeAuthWindows]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    const label = currentWindow.label;
    debugAuth("effect:init", { label, locale });
    setWindowLabel(label);
    let isMounted = true;
    const unlistenPromises: Array<Promise<() => void>> = [];
    let registeredWakeShortcut = false;

    const checkAuth = async (): Promise<ApiConfig | null> => {
      debugAuth("checkAuth:start", { label });
      const config = await loadAuthConfig();
      if (!isMounted) return null;

      if (config) {
        debugAuth("checkAuth:authenticated", { label, baseUrl: config.baseUrl });
        setApiConfigStable(config);
        setAuthStatus("authenticated");
        return config;
      }

      debugAuth("checkAuth:unauthenticated", { label });
      setApiConfigStable(null);
      setUserInfo(null);
      setBalance(null);
      hasFetchedOnMainOpenRef.current = false;
      if (label !== "main") {
        setAuthStatus("unauthenticated");
      }
      return null;
    };

    const resetLoginUi = () => {
      setAuthStatus("unauthenticated");
      setLoginError(null);
      setLoginStatusText(translate(locale, "login.status.connecting"));
    };

    if (label === "login") {
      const syncLoginWindow = async () => {
        debugAuth("syncLoginWindow:start");
        const config = await loadAuthConfig();
        if (!isMounted) return;

        if (config) {
          debugAuth("syncLoginWindow:found-auth", { baseUrl: config.baseUrl });
          setAuthStatus("authenticating");
          setLoginError(null);
          setLoginStatusText(translate(locale, "login.status.initializing"));
          try {
            await switchToMainWindow(config);
            debugAuth("syncLoginWindow:switchToMainWindow:ok");
          } catch (error) {
            console.warn("Auto-switch to main window failed:", error);
            debugAuth("syncLoginWindow:switchToMainWindow:failed", error);
            resetLoginUi();
          }
          return;
        }

        debugAuth("syncLoginWindow:no-auth");
        resetLoginUi();
      };

      void syncLoginWindow();
      unlistenPromises.push(
        currentWindow.listen("tauri://focus", () => {
          void syncLoginWindow();
        }),
      );
      unlistenPromises.push(
        currentWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await exit(0);
          } catch {
            await currentWindow.destroy();
          }
        }),
      );
    } else if (label === "main") {
      const syncMainWindow = async () => {
        debugAuth("syncMainWindow:start");
        const config = await checkAuth();
        if (!isMounted) return;

        if (!config) {
          debugAuth("syncMainWindow:no-auth:route-to-login");
          await routeToLogin().catch((error) => {
            console.warn("Failed to route unauthenticated main window:", error);
            debugAuth("syncMainWindow:route-to-login:failed", error);
          });
          debugAuth("syncMainWindow:hide-main:start");
          await currentWindow.hide().catch(() => undefined);
          debugAuth("syncMainWindow:hide-main:done");
          return;
        }

        if (!hasFetchedOnMainOpenRef.current) {
          debugAuth("syncMainWindow:first-fetch-user-info");
          hasFetchedOnMainOpenRef.current = true;
          void refreshUserInfo(config);
        }
      };

      void syncMainWindow();

      const setupWakeShortcut = async () => {
        try {
          const alreadyRegistered = await isGlobalShortcutRegistered(GLOBAL_WAKE_SHORTCUT);
          if (!alreadyRegistered) {
            await registerGlobalShortcut(GLOBAL_WAKE_SHORTCUT, (event) => {
              if (event.state !== "Pressed") return;
              debugAuth("shortcut:wake:pressed", { shortcut: event.shortcut });
              void routeAuthWindows();
              setActiveTab("/agent");
            });
            registeredWakeShortcut = true;
            debugAuth("shortcut:wake:registered", { shortcut: GLOBAL_WAKE_SHORTCUT });
          } else {
            debugAuth("shortcut:wake:already-registered", { shortcut: GLOBAL_WAKE_SHORTCUT });
          }
        } catch (error) {
          debugAuth("shortcut:wake:register-failed", error);
        }
      };

      void setupWakeShortcut();

      const setupDeepLinkHandlers = async () => {
        try {
          const currentUrls = await getCurrentDeepLink();
          if (currentUrls && currentUrls.length > 0) {
            await handleDeepLinkUrls(currentUrls);
          }
        } catch (error) {
          debugAuth("deep-link:getCurrent:failed", error);
        }
      };

      void setupDeepLinkHandlers();

      unlistenPromises.push(
        onOpenUrl((urls) => {
          void handleDeepLinkUrls(urls);
        }),
      );

      unlistenPromises.push(
        listen<ApiConfig>("tf://auth-success", (event) => {
          debugAuth("event:tf://auth-success", { baseUrl: event.payload.baseUrl });
          if (!isMounted) return;
          setApiConfigStable(event.payload);
          setAuthStatus("authenticated");
          if (!hasFetchedOnMainOpenRef.current) {
            hasFetchedOnMainOpenRef.current = true;
            void refreshUserInfo(event.payload);
          }
        }),
      );

      unlistenPromises.push(
        listen<string[]>("tf://deep-link", (event) => {
          void handleDeepLinkUrls(event.payload ?? []);
        }),
      );

      unlistenPromises.push(
        listen<string>("tf://tray-open-tab", (event) => {
          const allowedTabs = new Set(["/agent", "/crypto", "/request", "/settings", "/main"]);
          const tab = event.payload;
          if (!allowedTabs.has(tab)) return;
          debugAuth("event:tf://tray-open-tab", { tab });
          setActiveTab(tab);
        }),
      );

      unlistenPromises.push(
        currentWindow.listen("tauri://focus", () => {
          void syncMainWindow();
        }),
      );

      unlistenPromises.push(
        currentWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await exit(0);
          } catch {
            await currentWindow.destroy();
          }
        }),
      );
    }

    return () => {
      isMounted = false;
      for (const pending of unlistenPromises) {
        void pending.then((off) => off()).catch(() => undefined);
      }
      if (registeredWakeShortcut) {
        void unregisterGlobalShortcut(GLOBAL_WAKE_SHORTCUT).catch(() => undefined);
      }
    };
  }, [locale, debugAuth, handleDeepLinkUrls, refreshUserInfo, routeAuthWindows, routeToLogin, switchToMainWindow]);

  const isAgentMode = activeTab === "/agent";

  const handleLogin = async (baseUrl: string, apiKey: string) => {
    setAuthStatus("authenticating");
    setLoginError(null);
    setLoginStatusText(translate(locale, "login.status.verifying"));

    try {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
      const trimmedApiKey = apiKey.trim();

      const response = await fetch(`${normalizedBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trimmedApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const detail =
          response.status === 401
            ? "API key verification failed (401)"
            : `API service error (${response.status})`;
        throw new Error(detail);
      }

      const config = { baseUrl: normalizedBaseUrl, apiKey: trimmedApiKey };
      await saveAuthConfig(config);
      setApiConfigStable(config);
      setLoginStatusText(translate(locale, "login.status.initializing"));
      await switchToMainWindow(config);
    } catch (error: any) {
      const message = error.message?.includes("Failed to fetch")
        ? "Unable to reach the API endpoint. Make sure the service is running."
        : error.message;
      setLoginError(message);
      setAuthStatus("unauthenticated");
    }
  };

  const handleLogout = async () => {
    debugAuth("handleLogout:clicked");
    if (isLogoutProcessing.current) return;
    isLogoutProcessing.current = true;
    debugAuth("handleLogout:start");

    try {
      debugAuth("handleLogout:clearAuthConfig:start");
      await clearAuthConfig();
      debugAuth("handleLogout:clearAuthConfig:ok");
      debugAuth("handleLogout:routeToLogin:start");
      await routeToLogin();
      debugAuth("handleLogout:routeToLogin:ok");
      setApiConfigStable(null);
      setUserInfo(null);
      setBalance(null);
      hasFetchedOnMainOpenRef.current = false;
      debugAuth("handleLogout:hide-main:start");
      await getCurrentWindow().hide().catch((error) => {
        debugAuth("handleLogout:hide-main:failed", error);
      });
      debugAuth("handleLogout:hide-main:done");
    } catch (error) {
      console.error("Logout flow failed:", error);
      debugAuth("handleLogout:failed", error);
      window.location.reload();
    } finally {
      isLogoutProcessing.current = false;
      debugAuth("handleLogout:finally");
    }
  };

  const navItems = [
    { id: "/agent", label: translate(locale, "nav.agent"), icon: Bot },
    { id: "/crypto", label: translate(locale, "nav.crypto"), icon: Fingerprint },
    { id: "/main", label: translate(locale, "nav.jsLab"), icon: SquareCode },
    { id: "/request", label: translate(locale, "nav.request"), icon: Network },
  ];

  const languages: Array<{ code: AppLocale; label: string; native: string }> = [
    {
      code: "zh-CN",
      label: translate(locale, "settings.language.zh"),
      native: translate("zh-CN", "settings.language.zh"),
    },
    {
      code: "en-US",
      label: translate(locale, "settings.language.en"),
      native: translate("en-US", "settings.language.en"),
    },
    {
      code: "ja-JP",
      label: translate(locale, "settings.language.ja"),
      native: translate("ja-JP", "settings.language.ja"),
    },
    {
      code: "ko-KR",
      label: translate(locale, "settings.language.ko"),
      native: translate("ko-KR", "settings.language.ko"),
    },
    {
      code: "fr-FR",
      label: translate(locale, "settings.language.fr"),
      native: translate("fr-FR", "settings.language.fr"),
    },
    {
      code: "de-DE",
      label: translate(locale, "settings.language.de"),
      native: translate("de-DE", "settings.language.de"),
    },
    {
      code: "es-ES",
      label: translate(locale, "settings.language.es"),
      native: translate("es-ES", "settings.language.es"),
    },
    {
      code: "ru-RU",
      label: translate(locale, "settings.language.ru"),
      native: translate("ru-RU", "settings.language.ru"),
    },
  ];

  const filteredLanguages = languages.filter(
    (l) =>
      l.label.toLowerCase().includes(localeSearch.toLowerCase()) ||
      l.native.toLowerCase().includes(localeSearch.toLowerCase()),
  );
  const profileTitle =
    typeof userInfo?.name === "string" && userInfo.name.trim().length > 0
      ? userInfo.name.trim()
      : "Lumo Coding Expert";
  const profileSubtitle =
    typeof userInfo?.id === "string" && userInfo.id.trim().length > 0
      ? `${translate(locale, "agent.accountId")}: ${userInfo.id.trim()}`
      : "v1.5.7 - Standard";

  const isLoginWindow = windowLabel === "login";
  const loadingLabel = translate(locale, "login.status.initializing");
  const renderLazyFallback = () => (
    <div className="flex h-full w-full items-center justify-center bg-muted/10">
      <span className="text-[12px] font-mono uppercase tracking-wide text-muted-foreground/70">
        {loadingLabel}
      </span>
    </div>
  );

  if (isLoginWindow) {
    return (
      <Suspense fallback={renderLazyFallback()}>
        <LazyLoginView
          onLogin={handleLogin}
          error={loginError}
          isAuthenticating={authStatus === "authenticating"}
          statusText={loginStatusText}
        />
      </Suspense>
    );
  }

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground antialiased selection:bg-primary/10 animate-in fade-in zoom-in-95 duration-500">
        <Toaster position="top-center" expand={false} duration={3000} />
        <TitleBar
          isSiderVisible={isSiderVisible}
          onToggleSider={() => setIsSiderVisible(!isSiderVisible)}
          isAgentMode={isAgentMode}
        />

        <div className="flex flex-1 overflow-hidden">
          <aside className="z-50 flex w-[48px] flex-col items-center space-y-4 border-r border-border bg-card py-3">
            <div className="flex flex-1 flex-col gap-2">
              {navItems.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveTab(item.id)}
                      className={cn(
                        "group relative h-9 w-9 rounded-lg transition-all duration-200",
                        activeTab === item.id
                          ? "bg-accent/50 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <item.icon size={18} strokeWidth={2} />
                      {activeTab === item.id && (
                        <div className="absolute left-[-6px] bottom-2 top-2 w-[3px] animate-in slide-in-from-left-2 rounded-r-full bg-primary duration-300" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-[12px]">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (authStatus === "authenticated") {
                      void refreshUserInfo();
                    }
                  }}
                  className={cn(
                    "h-9 w-9 rounded-lg transition-all duration-200",
                    activeTab === "/settings"
                      ? "bg-accent/50 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Settings size={18} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                className="ml-2 w-64 select-none border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
                    <Fingerprint size={18} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold text-foreground">{profileTitle}</span>
                    <span className="text-[10px] text-muted-foreground/60">{profileSubtitle}</span>
                  </div>
                </div>

                <DropdownMenuSeparator className="mx-1" />

                <DropdownMenuItem
                  onSelect={() => setActiveTab("/settings")}
                  className="cursor-pointer gap-3 rounded-md py-2 px-3 focus:bg-muted/60"
                >
                  <Settings size={15} className="opacity-60" />
                  <span className="text-[13px] font-medium">{translate(locale, "menu.settings")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem className="cursor-not-allowed gap-3 rounded-md py-2 px-3 opacity-40">
                  <Layers size={15} className="opacity-60" />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-[13px] font-medium">{translate(locale, "menu.workspaceSettings")}</span>
                    <ExternalLink size={12} className="opacity-40" />
                  </div>
                </DropdownMenuItem>

                <div className="flex flex-col">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsLocaleExpanded(!isLocaleExpanded);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-md py-2 px-3 transition-colors hover:bg-muted/60 text-left outline-none shrink-0",
                      isLocaleExpanded && "bg-muted/40",
                    )}
                  >
                    <Globe size={15} className="opacity-60" />
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-[13px] font-medium">{translate(locale, "menu.language")}</span>
                      {isLocaleExpanded ? (
                        <ChevronDown size={14} className="opacity-40" />
                      ) : (
                        <ChevronRight size={14} className="opacity-40" />
                      )}
                    </div>
                  </button>

                  {isLocaleExpanded && (
                    <div className="mx-1 mt-1 flex flex-col overflow-hidden rounded-md border border-border/50 bg-muted/10 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="relative px-2 pt-2">
                        <Search className="absolute left-4 top-4 h-3.5 w-3.5 text-muted-foreground/40" />
                        <Input
                          placeholder={translate(locale, "menu.languageSearch")}
                          value={localeSearch}
                          onChange={(e) => setLocaleSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 pl-8 text-[11px] bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                        />
                      </div>

                      <ScrollArea className="h-44 py-2">
                        <div className="flex flex-col gap-0.5 px-1.5">
                          {filteredLanguages.map((lang) => (
                            <button
                              key={lang.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocale(lang.code);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors",
                                locale === lang.code
                                  ? "bg-primary/10 text-primary font-bold"
                                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                              )}
                            >
                              <div className="flex flex-col">
                                <span className="text-[11px]">{lang.label}</span>
                                <span className="text-[9px] opacity-60 tracking-wider font-mono">{lang.native}</span>
                              </div>
                              {locale === lang.code && (
                                <Badge
                                  variant="outline"
                                  className="h-4 border-primary/20 bg-primary/10 px-1 text-[9px] text-primary"
                                >
                                  {translate(locale, "menu.languageActive")}
                                </Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>

                <DropdownMenuSeparator className="mx-1" />

                <div className="flex items-center gap-3 rounded-md py-2 px-3 transition-colors hover:bg-muted/60">
                  <Zap size={15} className="text-yellow-500 opacity-60" />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-[13px] font-medium">{translate(locale, "menu.remainingQuota")}</span>
                    <span
                      className={cn(
                        "font-mono text-[11px] font-bold",
                        balance ? "text-primary" : "text-muted-foreground/60",
                      )}
                    >
                      {balance || "---"}
                    </span>
                  </div>
                </div>

                <DropdownMenuSeparator className="mx-1" />

                <DropdownMenuItem
                  onSelect={() => {
                    debugAuth("menu:logout:onSelect");
                    void handleLogout();
                  }}
                  className="cursor-pointer gap-3 rounded-md py-2 px-3 text-red-500 focus:bg-red-50 focus:text-red-500 dark:focus:bg-red-950/30"
                >
                  <LogOut size={15} />
                  <span className="text-[13px] font-medium">{translate(locale, "menu.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </aside>

          <main className="flex flex-1 overflow-hidden">
            <Suspense fallback={renderLazyFallback()}>
              {activeTab === "/agent" ? (
                <LazyAgentWorkstationView
                  apiConfig={apiConfig}
                  isSiderVisible={isSiderVisible}
                  userInfo={userInfo}
                  onRefreshUserInfo={() => {
                    if (authStatus === "authenticated") {
                      void refreshUserInfo();
                    }
                  }}
                />
              ) : activeTab === "/crypto" ? (
                <LazyCryptoLabView isSiderVisible={isSiderVisible} />
              ) : activeTab === "/main" ? (
                <LazyJsLabView isSiderVisible={isSiderVisible} />
              ) : activeTab === "/request" ? (
                <LazyRequestLabView isSiderVisible={isSiderVisible} />
              ) : activeTab === "/settings" ? (
                <LazySettingsView />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center space-y-4 bg-muted/10">
                  <div className="space-y-1 text-center">
                    <h2 className="text-sm font-bold uppercase tracking-tight text-muted-foreground opacity-40">
                      {translate(locale, "app.modulePending")}
                    </h2>
                    <p className="text-[11px] text-muted-foreground/60">
                      {translate(locale, "app.modulePendingDesc")}
                    </p>
                  </div>
                </div>
              )}
            </Suspense>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;


