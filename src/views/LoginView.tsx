import { useState } from "react";
import { AlertCircle } from "lucide-react";
import TraceForgeLogo from "@/components/ui/TraceForgeLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";

interface LoginViewProps {
  onLogin: (baseUrl: string, apiKey: string) => void;
  onManualKey?: () => void;
  error?: string | null;
  isAuthenticating?: boolean;
  statusText?: string;
}

export default function LoginView({
  onLogin,
  onManualKey,
  error,
  isAuthenticating = false,
  statusText,
}: LoginViewProps) {
  const { locale } = useLocaleStore();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const inputStyles =
    "h-12 rounded-lg bg-white border-[#e5e5e8] px-5 text-sm text-[#1a1a1a] transition-all duration-200 shadow-sm focus-visible:ring-1 focus-visible:ring-black/5";

  const effectiveStatusText = statusText || translate(locale, "login.status.connecting");

  return (
    <div className="flex min-h-screen w-full flex-col items-center overflow-hidden bg-[#f2f2f7] px-6 pb-8 pt-10 animate-in fade-in duration-700">
      <div className="flex w-full max-w-[380px] flex-col items-center space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <TraceForgeLogo size={70} />
          <div className="space-y-2 text-center">
            <h1 className="text-[26px] font-bold tracking-tight text-[#1a1a1a]">
              {translate(locale, "login.title")}
            </h1>
            <p className="text-sm font-medium leading-relaxed text-[#8e8e93]">
              {translate(locale, "login.subtitle")}
            </p>
          </div>
        </div>

        <div className="w-full space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-red-600 animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              <p className="text-[13px] font-medium">{error}</p>
            </div>
          )}

          <div className="grid w-full items-center gap-5">
            <div className="flex flex-col space-y-1.5">
              <Label
                htmlFor="base-url"
                className="ml-0.5 text-[12px] font-bold uppercase tracking-wider text-[#1a1a1a] opacity-60"
              >
                {translate(locale, "login.endpoint")}
              </Label>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://..."
                disabled={isAuthenticating}
                className={inputStyles}
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label
                htmlFor="api-key"
                className="ml-0.5 text-[12px] font-bold uppercase tracking-wider text-[#1a1a1a] opacity-60"
              >
                {translate(locale, "login.apiKey")}
              </Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                disabled={isAuthenticating}
                className={inputStyles}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={onManualKey}
              disabled={isAuthenticating}
              className="h-12 flex-1 rounded-lg border-none bg-[#e8e8ed] text-sm font-semibold text-[#1c1c1e] transition-all hover:bg-[#d1d1d6]"
            >
              {translate(locale, "common.cancel")}
            </Button>

            <Button
              variant="default"
              className="h-12 flex-1 rounded-lg bg-[#1c1c1e] text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98]"
              disabled={isAuthenticating}
              onClick={() => onLogin(baseUrl, apiKey)}
            >
              {isAuthenticating ? effectiveStatusText : translate(locale, "common.continue")}
            </Button>
          </div>
        </div>

        <div className="pt-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#c7c7cc]">
            {translate(locale, "login.footer")}
          </p>
        </div>
      </div>
    </div>
  );
}
