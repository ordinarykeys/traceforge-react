import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import type { KeyValueRow } from "../requestTypes";

interface RequestKeyValueTableProps {
  locale: AppLocale;
  rows: KeyValueRow[];
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  descriptionPlaceholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: <K extends keyof KeyValueRow>(index: number, key: K, value: KeyValueRow[K]) => void;
}

export function RequestKeyValueTable({
  locale,
  rows,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
  descriptionPlaceholder,
  onAdd,
  onRemove,
  onUpdate,
}: RequestKeyValueTableProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="grid h-8 grid-cols-[40px_1fr_1fr_1fr_36px] gap-1 border-b border-border/50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center">{translate(locale, "requestlab.table.on")}</span>
        <span className="flex items-center">{translate(locale, "requestlab.table.key")}</span>
        <span className="flex items-center">{translate(locale, "requestlab.table.value")}</span>
        <span className="flex items-center">{translate(locale, "requestlab.table.description")}</span>
        <span />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="divide-y divide-border/40">
          {rows.map((row, index) => (
            <div key={`${index}-${row.key}-${row.value}`} className="grid grid-cols-[40px_1fr_1fr_1fr_36px] gap-1 px-2 py-1.5">
              <label className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => onUpdate(index, "enabled", event.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm"
                />
              </label>
              <Input
                value={row.key}
                placeholder={keyPlaceholder}
                onChange={(event) => onUpdate(index, "key", event.target.value)}
                className="h-7 rounded-sm border-border/60 text-[11px]"
              />
              <Input
                value={row.value}
                placeholder={valuePlaceholder}
                onChange={(event) => onUpdate(index, "value", event.target.value)}
                className="h-7 rounded-sm border-border/60 text-[11px]"
              />
              <Input
                value={row.description}
                placeholder={descriptionPlaceholder}
                onChange={(event) => onUpdate(index, "description", event.target.value)}
                className="h-7 rounded-sm border-border/60 text-[11px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm"
                onClick={() => onRemove(index)}
                disabled={rows.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border/50 px-2 py-1.5">
        <Button type="button" variant="outline" size="sm" className="h-7 rounded-sm text-[11px]" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
