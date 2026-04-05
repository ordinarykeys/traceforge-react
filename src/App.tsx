import { useState, useEffect, useRef } from "react";
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
import CryptoLabView from "./views/CryptoLabView";
import SettingsView from "./views/SettingsView";
import AgentWorkstationView from "./views/AgentWorkstationView";
import LoginView from "./views/LoginView";
import TitleBar from "@/components/layout/TitleBar";
import { useThemeStore } from "@/hooks/useThemeStore";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
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
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function App() {
  useThemeStore();
  const { locale, setLocale } = useLocaleStore();
  const [activeTab, setActiveTab] = useState("/agent");
  const [isLocaleExpanded, setIsLocaleExpanded] = useState(false);
  const [localeSearch, setLocaleSearch] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [isSiderVisible, setIsSiderVisible] = useState(true);
  const isLogoutProcessing = useRef(false);

  const [windowLabel, setWindowLabel] = useState<string>("");
  const [authStatus, setAuthStatus] = useState<
    "unauthenticated" | "authenticating" | "authenticated"
  >("unauthenticated");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginStatusText, setLoginStatusText] = useState(
    translate(locale, "login.status.connecting"),
  );
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);

  const fetchUserBalance = async (config: ApiConfig) => {
    try {
      const info = await fetchUserInfo(config.baseUrl, config.apiKey);
      if (info && info.data) {
        setBalance(`¥${info.data.balance.toFixed(2)}`);
      }
    } catch (err) {
      console.error("Failed to fetch balance", err);
    }
  };

  useEffect(() => {
    const label = getCurrentWindow().label;
    setWindowLabel(label);
    let isMounted = true;

    const checkAuth = async () => {
      const config = await loadAuthConfig();
      if (!isMounted) return;

      if (config) {
        setApiConfig(config);
        setAuthStatus("authenticated");
        void fetchUserBalance(config);
        return;
      }

      setApiConfig(null);
      setAuthStatus("unauthenticated");
    };

    if (label === "login") {
      setAuthStatus("unauthenticated");
      setLoginError(null);
      setLoginStatusText(translate(locale, "login.status.connecting"));
    } else if (label === "main") {
      void checkAuth();

      const unlistenAuth = listen("tf://auth-success", async (event: any) => {
        setApiConfig(event.payload);
        await new Promise((r) => setTimeout(r, 1800));
        setAuthStatus("authenticated");
        await emit("tf://workbench-ready");
      });

      const unlistenFocus = getCurrentWindow().listen("tauri://focus", () => {
        if (authStatus !== "authenticated") {
          void checkAuth();
        }
      });

      const unlistenCloseRequested = getCurrentWindow().listen(
        "tauri://close-requested",
        async () => {
          const shouldExit = !(window as any).__IS_LOGGING_OUT__;
          if (!shouldExit) return;

          try {
            await exit(0);
          } catch {
            await getCurrentWindow().close();
          }
        },
      );

      return () => {
        isMounted = false;
        unlistenAuth.then((fn) => fn());
        unlistenFocus.then((fn) => fn());
        unlistenCloseRequested.then((fn) => fn());
      };
    }

    return () => {
      isMounted = false;
    };
  }, [authStatus, locale]);

  const isAgentMode = activeTab === "/agent";

  const handleLogin = async (baseUrl: string, apiKey: string) => {
    setAuthStatus("authenticating");
    setLoginError(null);
    setLoginStatusText(translate(locale, "login.status.verifying"));

    try {
      const normalizedBaseUrl = baseUrl.trim().endsWith("/")
        ? baseUrl.trim().slice(0, -1)
        : baseUrl.trim();

      const response = await fetch(`${normalizedBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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

      const config = { baseUrl: normalizedBaseUrl, apiKey };
      await saveAuthConfig(config);
      setApiConfig(config);
      void fetchUserBalance(config);
      setLoginStatusText(translate(locale, "login.status.initializing"));
      await emit("tf://auth-success", config);

      const unlistenReady = await listen("tf://workbench-ready", async () => {
        await getCurrentWindow().close();
        unlistenReady();
      });

      const mainWindow = await WebviewWindow.getByLabel("main");
      if (mainWindow) {
        await mainWindow.show();
        await mainWindow.setFocus();
      }
    } catch (error: any) {
      const message = error.message?.includes("Failed to fetch")
        ? "Unable to reach the API endpoint. Make sure the service is running."
        : error.message;
      setLoginError(message);
      setAuthStatus("unauthenticated");
    }
  };

  const handleLogout = async () => {
    if (isLogoutProcessing.current) return;
    isLogoutProcessing.current = true;
    (window as any).__IS_LOGGING_OUT__ = true;
    await clearAuthConfig();
    setApiConfig(null);
    setAuthStatus("unauthenticated");

    const destroyMainWindow = async () => {
      try {
        await getCurrentWindow().destroy();
      } catch {
      } finally {
        isLogoutProcessing.current = false;
      }
    };

    try {
      const existingLogin = await WebviewWindow.getByLabel("login");
      if (existingLogin) {
        await existingLogin.show();
        await existingLogin.setFocus();
        await destroyMainWindow();
        return;
      }

      const loginWindow = new WebviewWindow("login", {
        url: "index.html",
        title: "TraceForge Login",
        width: 560,
        height: 560,
        resizable: false,
        decorations: false,
        center: true,
        skipTaskbar: false,
      });

      loginWindow.once("tauri://created", async () => {
        await destroyMainWindow();
      });

      loginWindow.once("tauri://error", () => {
        isLogoutProcessing.current = false;
        (window as any).__IS_LOGGING_OUT__ = false;
        window.location.reload();
      });
    } catch {
      isLogoutProcessing.current = false;
      (window as any).__IS_LOGGING_OUT__ = false;
      window.location.reload();
    }
  };

  const navItems = [
    { id: "/agent", label: translate(locale, "nav.agent"), icon: Bot },
    { id: "/crypto", label: translate(locale, "nav.crypto"), icon: Fingerprint },
    { id: "/main", label: translate(locale, "nav.jsLab"), icon: SquareCode },
    { id: "/request", label: translate(locale, "nav.request"), icon: Network },
  ];

  const languages = [
    { code: "zh-CN", label: "中文 (简体)", native: "中文" },
    { code: "en-US", label: "English (US)", native: "English" },
    { code: "ja-JP", label: "日本語", native: "日本語" },
    { code: "ko-KR", label: "한국어", native: "한국어" },
    { code: "fr-FR", label: "Français", native: "Français" },
    { code: "de-DE", label: "Deutsch", native: "Deutsch" },
    { code: "es-ES", label: "Español", native: "Español" },
    { code: "ru-RU", label: "Русский", native: "Русский" },
  ];

  const filteredLanguages = languages.filter(l => 
    l.label.toLowerCase().includes(localeSearch.toLowerCase()) || 
    l.native.toLowerCase().includes(localeSearch.toLowerCase())
  );

  const isLoginWindow = windowLabel === "login";

  if (isLoginWindow) {
    return (
      <LoginView
        onLogin={handleLogin}
        error={loginError}
        isAuthenticating={authStatus === "authenticating"}
        statusText={loginStatusText}
      />
    );
  }

  if (windowLabel === "main" && authStatus !== "authenticated") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-8 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/10">
        {translate(locale, "app.awaiting")}
      </div>
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
                    <span className="text-[12px] font-bold text-foreground">TraceForge Expert</span>
                    <span className="text-[10px] text-muted-foreground/60">v1.5.7 · Standard</span>
                  </div>
                </div>
                
                <DropdownMenuSeparator className="mx-1" />
                
                <DropdownMenuItem
                  onClick={() => setActiveTab("/settings")}
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

                {/* In-place Expandable Language Menu */}
                <div className="flex flex-col">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsLocaleExpanded(!isLocaleExpanded);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-md py-2 px-3 transition-colors hover:bg-muted/60 text-left outline-none shrink-0",
                      isLocaleExpanded && "bg-muted/40"
                    )}
                  >
                    <Globe size={15} className="opacity-60" />
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-[13px] font-medium">{translate(locale, "menu.language")}</span>
                      {isLocaleExpanded ? <ChevronDown size={14} className="opacity-40" /> : <ChevronRight size={14} className="opacity-40" />}
                    </div>
                  </button>
                  
                  {isLocaleExpanded && (
                    <div className="mx-1 mt-1 flex flex-col overflow-hidden rounded-md border border-border/50 bg-muted/10 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="relative px-2 pt-2">
                        <Search className="absolute left-4 top-4 h-3.5 w-3.5 text-muted-foreground/40" />
                        <Input 
                          placeholder="搜索语言..."
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
                              disabled={lang.code !== "zh-CN" && lang.code !== "en-US"}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (lang.code === "zh-CN" || lang.code === "en-US") {
                                  setLocale(lang.code as any);
                                }
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors",
                                locale === lang.code ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                                (lang.code !== "zh-CN" && lang.code !== "en-US") && "opacity-30 cursor-not-allowed"
                              )}
                            >
                              <div className="flex flex-col">
                                <span className="text-[11px]">{lang.label}</span>
                                <span className="text-[9px] opacity-60 tracking-wider font-mono">{lang.native}</span>
                              </div>
                              {locale === lang.code && (
                                <Badge variant="outline" className="h-4 border-primary/20 bg-primary/10 px-1 text-[9px] text-primary">Active</Badge>
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
                    <span className={cn(
                      "font-mono text-[11px] font-bold",
                      balance ? "text-primary" : "text-muted-foreground/60"
                    )}>
                      {balance || "---"}
                    </span>
                  </div>
                </div>

                <DropdownMenuSeparator className="mx-1" />
                
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer gap-3 rounded-md py-2 px-3 text-red-500 focus:bg-red-50 focus:text-red-500 dark:focus:bg-red-950/30"
                >
                  <LogOut size={15} />
                  <span className="text-[13px] font-medium">{translate(locale, "menu.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </aside>

          <main className="flex flex-1 overflow-hidden">
            {activeTab === "/agent" ? (
              <AgentWorkstationView 
                apiConfig={apiConfig} 
                isSiderVisible={isSiderVisible}
              />
            ) : activeTab === "/crypto" ? (
              <CryptoLabView isSiderVisible={isSiderVisible} />
            ) : activeTab === "/settings" ? (
              <SettingsView />
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
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
