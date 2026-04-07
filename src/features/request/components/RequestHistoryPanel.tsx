import { Clock3, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import type { RequestHistoryEntry } from "../requestTypes";

interface RequestHistoryPanelProps {
  locale: AppLocale;
  history: RequestHistoryEntry[];
  onRestore: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function RequestHistoryPanel({
  locale,
  history,
  onRestore,
  onRemove,
  onClear,
  onClose,
}: RequestHistoryPanelProps) {
  return (
    <aside className="flex h-full w-[280px] flex-col border-l border-border/60 bg-muted/10">
      <div className="flex h-9 items-center justify-between border-b border-border/60 px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/90">
          {translate(locale, "requestlab.history.title")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-sm"
            onClick={onClear}
            disabled={history.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2">
        {history.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
            {translate(locale, "requestlab.history.empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-sm border border-border/60 bg-card/30 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-semibold uppercase ${entry.success ? "text-emerald-600" : "text-rose-600"}`}>
                    {entry.method}
                  </span>
                  <span className="text-[10px] text-muted-foreground/90">
                    {new Date(entry.createdAt).toLocaleTimeString(locale)}
                  </span>
                </div>
                <div className="mt-1 truncate text-[11px] text-foreground/90">{entry.requestName}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.url}</div>

                <div className="mt-1.5 flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-6 rounded-sm px-2 text-[10px]" onClick={() => onRestore(entry.id)}>
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {translate(locale, "requestlab.history.restore")}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 rounded-sm px-2 text-[10px]" onClick={() => onRemove(entry.id)}>
                    <Clock3 className="mr-1 h-3 w-3" />
                    {translate(locale, "requestlab.history.remove")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
