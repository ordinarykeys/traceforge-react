import { Copy, Download, Folder, History, Import, Play, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";
import { getMethodToneClass } from "@/features/request/requestLab.helpers";
import { RequestHistoryPanel } from "@/features/request/components/RequestHistoryPanel";
import { RequestKeyValueTable } from "@/features/request/components/RequestKeyValueTable";
import { RequestWorkspacePanel } from "@/features/request/components/RequestWorkspacePanel";
import { useRequestLab } from "@/features/request/useRequestLab";

interface RequestLabViewProps {
  isSiderVisible?: boolean;
}

export default function RequestLabView(_: RequestLabViewProps) {
  const { locale } = useLocaleStore();
  const {
    HTTP_METHODS,
    REQUEST_AUTH_TYPES,
    REQUEST_BODY_TYPES,
    requests,
    groupedRequests,
    activeRequest,
    activeRequestId,
    requestSearch,
    requestHistory,
    workspaceVisible,
    historyVisible,
    activeEditorTab,
    activeScriptTab,
    activeResponseTab,
    responseBodyView,
    requestEditorTabs,
    responseTabs,
    activeResponseState,
    responseSummary,
    responseCookies,
    formattedResponseBody,
    curlImportOpen,
    curlImportText,
    curlImportWarnings,
    setRequestSearch,
    setWorkspaceVisible,
    setHistoryVisible,
    setActiveEditorTab,
    setActiveScriptTab,
    setActiveResponseTab,
    setResponseBodyView,
    setCurlImportOpen,
    setCurlImportText,
    setMethod,
    setUrl,
    setBodyType,
    setBody,
    setAuthType,
    setAuthField,
    setScriptField,
    setRowField,
    addRow,
    removeRow,
    selectRequestTab,
    createCollection,
    addRequestTab,
    duplicateRequestTab,
    closeRequestTab,
    applyCurlImport,
    sendRequest,
    copyAsCurl,
    copyResponse,
    removeHistoryEntry,
    clearRequestHistory,
    restoreHistoryEntry,
    deriveRequestTitle,
  } = useRequestLab(locale);

  const getEditorTabLabel = (tab: string) => translate(locale, `requestlab.tab.${tab}`);
  const getResponseTabLabel = (tab: string) => translate(locale, `requestlab.responseTab.${tab}`);
  const getBodyTypeLabel = (value: string) =>
    translate(locale, value === "form-data" ? "requestlab.bodyType.formData" : `requestlab.bodyType.${value}`);
  const getAuthTypeLabel = (value: string) => translate(locale, `requestlab.auth.${value}`);

  const onSend = async () => {
    try {
      await sendRequest();
      toast.success(translate(locale, "requestlab.toast.requestCompleted"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  const onCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(copyAsCurl());
      toast.success(translate(locale, "requestlab.copied"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  const onCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(copyResponse());
      toast.success(translate(locale, "requestlab.copied"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  const onImportCurl = () => {
    try {
      const result = applyCurlImport();
      toast.success(
        result.mode === "replace"
          ? translate(locale, "requestlab.toast.importedReplace")
          : translate(locale, "requestlab.toast.importedCreate"),
      );
      if (result.warnings.length > 0) {
        toast.message(
          translate(locale, "requestlab.toast.importWarnings", { count: result.warnings.length }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  const responseHeaderText = activeResponseState.response
    ? Object.entries(activeResponseState.response.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    : "";

  const timelineText = activeResponseState.timeline
    ? [
        activeResponseState.timeline.requestLine,
        "",
        activeResponseState.timeline.requestHeaders,
        "",
        activeResponseState.timeline.requestBody,
        "",
        activeResponseState.timeline.responseLine,
        "",
        activeResponseState.timeline.responseHeaders,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-9 items-center justify-between border-b border-border/60 bg-muted/10 px-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto pr-2">
          {requests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => selectRequestTab(request.id)}
              className={`group flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[11px] ${
                request.id === activeRequestId
                  ? "border-primary/40 bg-background text-primary"
                  : "border-transparent bg-transparent text-foreground/80 hover:border-border/60 hover:bg-background/80"
              }`}
            >
              <span className={`text-[10px] font-semibold ${getMethodToneClass(request.method)}`}>
                {request.method}
              </span>
              <span className="max-w-[180px] truncate">{deriveRequestTitle(request)}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  closeRequestTab(request.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    closeRequestTab(request.id);
                  }
                }}
                className="rounded-sm p-0.5 text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={() => addRequestTab()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={() => duplicateRequestTab()}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={() => setWorkspaceVisible(!workspaceVisible)}>
            <Folder className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm" onClick={() => setHistoryVisible(!historyVisible)}>
            <History className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {workspaceVisible && (
          <RequestWorkspacePanel
            locale={locale}
            groupedCollections={groupedRequests}
            activeRequestId={activeRequestId}
            searchText={requestSearch}
            onSearchChange={setRequestSearch}
            onSelectRequest={selectRequestTab}
            onAddRequest={addRequestTab}
            onCreateCollection={() => {
              createCollection();
              toast.success(translate(locale, "requestlab.toast.collectionCreated"));
            }}
            onClose={() => setWorkspaceVisible(false)}
          />
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!activeRequest ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {translate(locale, "requestlab.noActiveRequest")}
            </div>
          ) : (
            <>
              <div className="flex h-10 items-center gap-1.5 border-b border-border/60 bg-muted/10 px-2">
                <select
                  value={activeRequest.method}
                  onChange={(event) => setMethod(event.target.value as typeof activeRequest.method)}
                  className="h-7 rounded-sm border border-border/70 bg-background px-2 text-[11px] font-semibold"
                >
                  {HTTP_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>

                <Input
                  value={activeRequest.url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={translate(locale, "requestlab.urlPlaceholder")}
                  className="h-7 flex-1 rounded-sm border-border/70 text-[11px]"
                />

                <Button variant="outline" size="sm" className="h-7 rounded-sm px-2 text-[11px]" onClick={() => setCurlImportOpen(true)}>
                  <Import className="mr-1 h-3.5 w-3.5" />
                  {translate(locale, "requestlab.importCurl")}
                </Button>
                <Button variant="outline" size="sm" className="h-7 rounded-sm px-2 text-[11px]" onClick={() => void onCopyCurl()}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  {translate(locale, "requestlab.copyCurl")}
                </Button>
                <Button size="sm" className="h-7 rounded-sm px-2 text-[11px]" onClick={() => void onSend()} disabled={activeResponseState.loading}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {activeResponseState.loading
                    ? translate(locale, "requestlab.sending")
                    : translate(locale, "requestlab.send")}
                </Button>
              </div>

              <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                <ResizablePanel defaultSize={52} minSize={36}>
                  <section className="flex min-h-0 flex-col border-r border-border/60 bg-background">
                  <div className="flex h-8 flex-wrap items-center gap-1 border-b border-border/60 bg-muted/5 px-2">
                    {requestEditorTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveEditorTab(tab.key)}
                        className={`relative h-6 px-2 text-[11px] ${
                          activeEditorTab === tab.key
                            ? "text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:bg-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {getEditorTabLabel(tab.key)}
                        {tab.count > 0 ? ` (${tab.count})` : ""}
                      </button>
                    ))}
                  </div>

                  <div className="min-h-0 flex-1">
                    {activeEditorTab === "query" && (
                      <RequestKeyValueTable
                        locale={locale}
                        rows={activeRequest.params}
                        addLabel={`+ ${translate(locale, "requestlab.query.add")}`}
                        keyPlaceholder={translate(locale, "requestlab.query.keyPlaceholder")}
                        valuePlaceholder={translate(locale, "requestlab.query.valuePlaceholder")}
                        descriptionPlaceholder={translate(locale, "requestlab.common.descriptionPlaceholder")}
                        onAdd={() => addRow("params")}
                        onRemove={(index) => removeRow("params", index)}
                        onUpdate={(index, key, value) => setRowField("params", index, key, value)}
                      />
                    )}

                    {activeEditorTab === "headers" && (
                      <RequestKeyValueTable
                        locale={locale}
                        rows={activeRequest.headers}
                        addLabel={`+ ${translate(locale, "requestlab.headers.add")}`}
                        keyPlaceholder={translate(locale, "requestlab.headers.keyPlaceholder")}
                        valuePlaceholder={translate(locale, "requestlab.headers.valuePlaceholder")}
                        descriptionPlaceholder={translate(locale, "requestlab.common.descriptionPlaceholder")}
                        onAdd={() => addRow("headers")}
                        onRemove={(index) => removeRow("headers", index)}
                        onUpdate={(index, key, value) => setRowField("headers", index, key, value)}
                      />
                    )}

                    {activeEditorTab === "cookies" && (
                      <RequestKeyValueTable
                        locale={locale}
                        rows={activeRequest.cookies}
                        addLabel={`+ ${translate(locale, "requestlab.cookies.add")}`}
                        keyPlaceholder={translate(locale, "requestlab.cookies.keyPlaceholder")}
                        valuePlaceholder={translate(locale, "requestlab.cookies.valuePlaceholder")}
                        descriptionPlaceholder={translate(locale, "requestlab.common.descriptionPlaceholder")}
                        onAdd={() => addRow("cookies")}
                        onRemove={(index) => removeRow("cookies", index)}
                        onUpdate={(index, key, value) => setRowField("cookies", index, key, value)}
                      />
                    )}

                    {activeEditorTab === "vars" && (
                      <RequestKeyValueTable
                        locale={locale}
                        rows={activeRequest.vars}
                        addLabel={`+ ${translate(locale, "requestlab.vars.add")}`}
                        keyPlaceholder={translate(locale, "requestlab.vars.keyPlaceholder")}
                        valuePlaceholder={translate(locale, "requestlab.vars.valuePlaceholder")}
                        descriptionPlaceholder={translate(locale, "requestlab.common.descriptionPlaceholder")}
                        onAdd={() => addRow("vars")}
                        onRemove={(index) => removeRow("vars", index)}
                        onUpdate={(index, key, value) => setRowField("vars", index, key, value)}
                      />
                    )}

                    {activeEditorTab === "body" && (
                      <div className="flex h-full flex-col">
                        <div className="border-b border-border/60 px-2 py-1.5">
                          <select
                            value={activeRequest.bodyType}
                            onChange={(event) => setBodyType(event.target.value as typeof activeRequest.bodyType)}
                            className="h-7 rounded-sm border border-border/70 bg-background px-2 text-[11px]"
                          >
                            {REQUEST_BODY_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {getBodyTypeLabel(type.value)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Textarea
                          value={activeRequest.body}
                          onChange={(event) => setBody(event.target.value)}
                          className="h-full min-h-0 resize-none rounded-none border-0 font-mono text-[11px] focus-visible:ring-0"
                        />
                      </div>
                    )}

                    {activeEditorTab === "auth" && (
                      <div className="space-y-2.5 p-2.5">
                        <div>
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {translate(locale, "requestlab.auth.type")}
                          </div>
                          <select
                            value={activeRequest.auth.type}
                            onChange={(event) => setAuthType(event.target.value as typeof activeRequest.auth.type)}
                            className="h-7 rounded-sm border border-border/70 bg-background px-2 text-[11px]"
                          >
                            {REQUEST_AUTH_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {getAuthTypeLabel(type.value)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {activeRequest.auth.type === "bearer" && (
                            <Input
                              value={activeRequest.auth.token}
                              onChange={(event) => setAuthField("token", event.target.value)}
                              placeholder={translate(locale, "requestlab.auth.placeholder.bearerToken")}
                              className="h-7 rounded-sm border-border/70 text-[11px]"
                            />
                          )}

                        {activeRequest.auth.type === "basic" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={activeRequest.auth.username}
                              onChange={(event) => setAuthField("username", event.target.value)}
                              placeholder={translate(locale, "requestlab.auth.placeholder.username")}
                              className="h-7 rounded-sm border-border/70 text-[11px]"
                            />
                            <Input
                              type="password"
                              value={activeRequest.auth.password}
                              onChange={(event) => setAuthField("password", event.target.value)}
                              placeholder={translate(locale, "requestlab.auth.placeholder.password")}
                              className="h-7 rounded-sm border-border/70 text-[11px]"
                            />
                          </div>
                        )}

                        {activeRequest.auth.type === "apikey" && (
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              value={activeRequest.auth.apiKeyName}
                              onChange={(event) => setAuthField("apiKeyName", event.target.value)}
                              placeholder={translate(locale, "requestlab.auth.placeholder.keyName")}
                              className="h-7 rounded-sm border-border/70 text-[11px]"
                            />
                            <Input
                              value={activeRequest.auth.apiKeyValue}
                              onChange={(event) => setAuthField("apiKeyValue", event.target.value)}
                              placeholder={translate(locale, "requestlab.auth.placeholder.keyValue")}
                              className="h-7 rounded-sm border-border/70 text-[11px]"
                            />
                            <select
                              value={activeRequest.auth.apiKeyIn}
                              onChange={(event) => setAuthField("apiKeyIn", event.target.value as "header" | "query")}
                              className="h-7 rounded-sm border border-border/70 bg-background px-2 text-[11px]"
                            >
                              <option value="header">
                                {translate(locale, "requestlab.auth.in.header")}
                              </option>
                              <option value="query">
                                {translate(locale, "requestlab.auth.in.query")}
                              </option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {activeEditorTab === "script" && (
                      <div className="flex h-full flex-col">
                        <div className="flex h-8 items-center gap-1 border-b border-border/60 bg-muted/5 px-2">
                          <button
                            type="button"
                            onClick={() => setActiveScriptTab("pre")}
                            className={`relative h-6 px-2 text-[11px] ${
                              activeScriptTab === "pre"
                                ? "text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:bg-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {translate(locale, "requestlab.script.pre")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveScriptTab("post")}
                            className={`relative h-6 px-2 text-[11px] ${
                              activeScriptTab === "post"
                                ? "text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:bg-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {translate(locale, "requestlab.script.post")}
                          </button>
                        </div>
                        <Textarea
                          value={activeScriptTab === "pre" ? activeRequest.preRequestScript : activeRequest.postRequestScript}
                          onChange={(event) =>
                            setScriptField(
                              activeScriptTab === "pre" ? "preRequestScript" : "postRequestScript",
                              event.target.value,
                            )
                          }
                          className="h-full min-h-0 resize-none rounded-none border-0 font-mono text-[11px] focus-visible:ring-0"
                        />
                      </div>
                    )}

                    {activeEditorTab === "tests" && (
                      <Textarea
                        value={activeRequest.tests}
                        onChange={(event) => setScriptField("tests", event.target.value)}
                        className="h-full min-h-0 resize-none rounded-none border-0 font-mono text-[11px] focus-visible:ring-0"
                        placeholder={translate(locale, "requestlab.tests.placeholder")}
                      />
                    )}
                  </div>
                  </section>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={48} minSize={30}>
                  <section className="flex min-h-0 flex-col bg-background">
                  <div className="flex h-8 items-center justify-between border-b border-border/60 bg-muted/5 px-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[11px]">
                        {responseSummary?.status || translate(locale, "requestlab.response.noResponse")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{responseSummary?.time || "-"}</span>
                      <span className="text-[11px] text-muted-foreground">{responseSummary?.size || "-"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" className="h-6 rounded-sm px-2 text-[11px]" onClick={() => setResponseBodyView(responseBodyView === "pretty" ? "raw" : "pretty")}>
                        {responseBodyView === "pretty"
                          ? translate(locale, "requestlab.response.raw")
                          : translate(locale, "requestlab.response.pretty")}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 rounded-sm px-2 text-[11px]" onClick={() => void onCopyResponse()}>
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {translate(locale, "requestlab.copy")}
                      </Button>
                    </div>
                  </div>

                  <div className="flex h-8 items-center gap-1 border-b border-border/60 bg-muted/5 px-2">
                    {responseTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveResponseTab(tab)}
                        className={`relative h-6 px-2 text-[11px] ${
                          activeResponseTab === tab
                            ? "text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:bg-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {getResponseTabLabel(tab)}
                      </button>
                    ))}
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    {activeResponseTab === "body" && (
                      <pre className="h-full whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-5 text-foreground/90">
                        {activeResponseState.error?.message ||
                          formattedResponseBody ||
                          translate(locale, "requestlab.empty")}
                      </pre>
                    )}

                    {activeResponseTab === "headers" && (
                      <pre className="h-full whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-5 text-foreground/90">
                        {responseHeaderText || translate(locale, "requestlab.empty")}
                      </pre>
                    )}

                    {activeResponseTab === "cookies" && (
                      <div className="p-2.5 text-[11px]">
                        {responseCookies.length === 0 ? (
                          <span className="text-muted-foreground">{translate(locale, "requestlab.empty")}</span>
                        ) : (
                          <div className="space-y-2">
                            {responseCookies.map((cookie) => (
                              <div key={`${cookie.name}-${cookie.value}`} className="rounded-sm border border-border/60 p-2">
                                <div className="font-medium">{cookie.name}</div>
                                <div className="text-muted-foreground">{cookie.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeResponseTab === "tests" && (
                      <div className="p-2.5 text-[11px]">
                        {!activeResponseState.response || activeResponseState.response.testResults.length === 0 ? (
                          <span className="text-muted-foreground">{translate(locale, "requestlab.empty")}</span>
                        ) : (
                          <div className="space-y-2">
                            {activeResponseState.response.testResults.map((test) => (
                              <div
                                key={`${test.name}-${test.passed}`}
                                className={`rounded-sm border p-2 ${test.passed ? "border-emerald-300/50 bg-emerald-500/5" : "border-rose-300/50 bg-rose-500/5"}`}
                              >
                                <div className="font-medium">{test.name}</div>
                                {!test.passed && test.error && (
                                  <div className="mt-1 text-rose-600 dark:text-rose-400">{test.error}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeResponseTab === "timeline" && (
                      <pre className="h-full whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-5 text-foreground/90">
                        {timelineText || translate(locale, "requestlab.empty")}
                      </pre>
                    )}
                  </div>
                  </section>
                </ResizablePanel>
              </ResizablePanelGroup>
            </>
          )}
        </main>

        {historyVisible && (
          <RequestHistoryPanel
            locale={locale}
            history={requestHistory}
            onRestore={(entryId) => {
              const restoredId = restoreHistoryEntry(entryId);
              if (restoredId) toast.success(translate(locale, "requestlab.toast.requestRestored"));
            }}
            onRemove={removeHistoryEntry}
            onClear={clearRequestHistory}
            onClose={() => setHistoryVisible(false)}
          />
        )}
      </div>

      <Dialog open={curlImportOpen} onOpenChange={setCurlImportOpen}>
        <DialogContent className="max-w-2xl rounded-sm border-border/70 p-4">
          <DialogHeader>
            <DialogTitle className="text-sm">{translate(locale, "requestlab.importDialog.title")}</DialogTitle>
          </DialogHeader>

          <Textarea
            value={curlImportText}
            onChange={(event) => setCurlImportText(event.target.value)}
            className="h-52 resize-none rounded-sm border-border/70 font-mono text-[11px]"
            placeholder={translate(locale, "requestlab.importDialog.placeholder")}
          />

          {curlImportWarnings.length > 0 && (
            <div className="max-h-28 overflow-auto rounded border border-amber-400/50 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
              {curlImportWarnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCurlImportOpen(false)}>
              {translate(locale, "requestlab.importDialog.cancel")}
            </Button>
            <Button onClick={onImportCurl}>{translate(locale, "requestlab.importDialog.import")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
