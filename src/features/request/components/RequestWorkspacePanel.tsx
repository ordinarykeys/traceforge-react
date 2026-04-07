import { FolderPlus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import type { RequestCollection, RequestDocument } from "../requestTypes";
import { deriveRequestTitle, getMethodToneClass } from "../requestLab.helpers";

interface GroupedCollection extends RequestCollection {
  requests: RequestDocument[];
}

interface RequestWorkspacePanelProps {
  locale: AppLocale;
  groupedCollections: GroupedCollection[];
  activeRequestId: string;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelectRequest: (requestId: string) => void;
  onAddRequest: (collectionId?: string) => void;
  onCreateCollection: () => void;
  onClose: () => void;
}

export function RequestWorkspacePanel({
  locale,
  groupedCollections,
  activeRequestId,
  searchText,
  onSearchChange,
  onSelectRequest,
  onAddRequest,
  onCreateCollection,
  onClose,
}: RequestWorkspacePanelProps) {
  const untitledLabel = translate(locale, "requestlab.defaultRequestTitle");

  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border/60 bg-muted/10">
      <div className="flex h-9 items-center justify-between border-b border-border/60 px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/90">
          {translate(locale, "requestlab.workspace.title")}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2 border-b border-border/60 px-2 py-2">
        <Input
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={translate(locale, "requestlab.workspace.searchPlaceholder")}
          className="h-7 rounded-sm border-border/60 text-[11px]"
        />
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 rounded-sm px-2 text-[11px]" onClick={() => onAddRequest()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {translate(locale, "requestlab.workspace.newRequest")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-sm px-2 text-[11px]" onClick={onCreateCollection}>
            <FolderPlus className="mr-1 h-3.5 w-3.5" />
            {translate(locale, "requestlab.workspace.newCollection")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2">
        <div className="space-y-2.5">
          {groupedCollections.map((collection) => (
            <section key={collection.id} className="space-y-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {collection.name}
              </div>

              {collection.requests.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onAddRequest(collection.id)}
                  className="w-full rounded-sm border border-dashed border-border/70 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/40"
                >
                  + {translate(locale, "requestlab.workspace.addRequest")}
                </button>
              ) : (
                collection.requests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => onSelectRequest(request.id)}
                    className={`flex h-7 w-full items-center gap-2 rounded-sm border px-2 text-left text-[11px] transition-colors ${
                      request.id === activeRequestId
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent text-foreground/85 hover:border-border/60 hover:bg-muted/50"
                    }`}
                  >
                    <span className={`w-9 shrink-0 text-[10px] font-semibold ${getMethodToneClass(request.method)}`}>
                      {request.method}
                    </span>
                    <span className="truncate">{deriveRequestTitle(request, untitledLabel)}</span>
                  </button>
                ))
              )}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
