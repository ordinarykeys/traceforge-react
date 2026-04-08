import { memo } from "react";
import { cn } from "@/lib/utils";

export interface DiffGitSummarySectionProps {
  diffWordWrapEnabled: boolean;
  diffCollapsedAll: boolean;
  diffLoadFullFileEnabled: boolean;
  diffTextDiffEnabled: boolean;
  diffRichTextPreviewEnabled: boolean;
  visibleDiffChangedFiles: Array<{ code: string; path: string }>;
  diffScope: "unstaged" | "staged" | "allBranches" | "lastRound";
  gitSnapshot: {
    recent_commits: string[];
  };
  diffBranch: string;
  diffBaseBranch: string;
  diffUpdatedText: string | null;
  useTwoColumnDiffLayout: boolean;
  text: {
    branch: string;
    updatedAt: string;
    changed: string;
    noFullFile: string;
    textDiffDisabledHint: string;
    collapsedHint: string;
    noLastRoundChanges: string;
    clean: string;
    commits: string;
    richPreview: string;
    noCommits: string;
  };
}

function DiffGitSummarySectionImpl({
  diffWordWrapEnabled,
  diffCollapsedAll,
  diffLoadFullFileEnabled,
  diffTextDiffEnabled,
  diffRichTextPreviewEnabled,
  visibleDiffChangedFiles,
  diffScope,
  gitSnapshot,
  diffBranch,
  diffBaseBranch,
  diffUpdatedText,
  useTwoColumnDiffLayout,
  text,
}: DiffGitSummarySectionProps) {
  return (
    <>
      <div className="rounded-lg border border-border/40 bg-background/70 p-3">
        <div className="text-[11px] text-muted-foreground/70">{text.branch}</div>
        <div
          className={cn(
            "mt-1 min-w-0 font-mono text-[12px]",
            diffWordWrapEnabled ? "break-all" : "truncate"
          )}
          title={!diffWordWrapEnabled ? diffBranch : undefined}
        >
          {diffBranch}
          <span
            className={cn(
              "ml-2 text-muted-foreground/70",
              diffWordWrapEnabled ? "break-all" : "truncate"
            )}
            title={!diffWordWrapEnabled ? diffBaseBranch : undefined}
          >
            ({diffBaseBranch})
          </span>
        </div>
        {diffUpdatedText && (
          <div className="mt-1 text-[10px] text-muted-foreground/70">
            {text.updatedAt}: {diffUpdatedText}
          </div>
        )}
      </div>

      <div className={cn("grid gap-3", useTwoColumnDiffLayout ? "grid-cols-2" : "grid-cols-1")}>
        <div className="rounded-lg border border-border/40 bg-background/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground/70">
              {text.changed} ({visibleDiffChangedFiles.length})
            </div>
            {!diffLoadFullFileEnabled && (
              <div className="text-[10px] text-muted-foreground/60">{text.noFullFile}</div>
            )}
          </div>
          {!diffTextDiffEnabled ? (
            <div className="text-[12px] text-muted-foreground/80">{text.textDiffDisabledHint}</div>
          ) : diffCollapsedAll ? (
            <div className="text-[12px] text-muted-foreground/80">{text.collapsedHint}</div>
          ) : visibleDiffChangedFiles.length === 0 ? (
            <div className="text-[12px] text-muted-foreground/80">
              {diffScope === "lastRound" ? text.noLastRoundChanges : text.clean}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleDiffChangedFiles.map((entry, index) => (
                <div
                  key={`${entry.code}:${entry.path}:${index}`}
                  className="flex min-w-0 items-start gap-2 rounded-md border border-border/30 px-2 py-1.5"
                >
                  <span className="w-6 shrink-0 font-mono text-[11px] text-primary/80">
                    {entry.code}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 font-mono text-[11px] text-foreground/85",
                      diffWordWrapEnabled ? "break-all" : "truncate"
                    )}
                    title={!diffWordWrapEnabled ? entry.path : undefined}
                  >
                    {entry.path}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/40 bg-background/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground/70">{text.commits}</div>
            {diffRichTextPreviewEnabled && (
              <div className="text-[10px] text-muted-foreground/60">{text.richPreview}</div>
            )}
          </div>
          {diffCollapsedAll ? (
            <div className="text-[12px] text-muted-foreground/80">{text.collapsedHint}</div>
          ) : (
            <div className="space-y-1.5">
              {(gitSnapshot.recent_commits.length > 0
                ? gitSnapshot.recent_commits
                : [text.noCommits]
              ).map((line, index) => {
                const trimmed = line.trim();
                const [hash, ...restParts] = trimmed.split(" ");
                const message = restParts.join(" ").trim();
                if (diffRichTextPreviewEnabled && hash && message) {
                  return (
                    <div
                      key={`${line}:${index}`}
                      className="rounded-md border border-border/30 bg-background/60 px-2 py-1.5"
                    >
                      <div className="font-mono text-[10px] text-primary/80">{hash}</div>
                      <div
                        className={cn(
                          "text-[11px] text-foreground/85",
                          diffWordWrapEnabled ? "break-all" : "truncate"
                        )}
                        title={!diffWordWrapEnabled ? message : undefined}
                      >
                        {message}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={`${line}:${index}`}
                    className={cn(
                      "font-mono text-[11px] text-foreground/80",
                      diffWordWrapEnabled ? "break-all" : "truncate"
                    )}
                    title={!diffWordWrapEnabled ? line : undefined}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const DiffGitSummarySection = memo(DiffGitSummarySectionImpl);

export default DiffGitSummarySection;
