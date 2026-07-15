/* ProjectContextView — Project Context page (T-03 redesign): two-pane
   master-detail layout. Left pane: compact icon toolbar (new-file,
   new-folder, upload, search-to-reveal-filter, refresh), a filename-only
   list with a `selectedPath`-driven highlight, and an aggregate footer.
   Root folder / tracked status / token estimate move to the `DetailPane`
   once a doc is selected, keeping rows visually flush with the mockup.
   Right pane: `DetailPane`, showing the selected doc's Preview/Edit toggle,
   "Used by N agents" pill, and coverage ring. `CreateModal`/`UploadControls`
   stay Modal-based and unchanged, reached via the toolbar icons. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../../../components/app-shell";
import { useActiveRepo } from "../../../../../../lib/repo-context";
import { useDiscovery, useRefreshDiscovery } from "../../../../../../lib/hooks/project-context";
import { CreateModal } from "./_components/CreateModal/CreateModal";
import { DetailPane } from "./_components/DetailPane/DetailPane";
import { UploadControls } from "./_components/UploadControls/UploadControls";
import { filterDocuments, formatScannedAt, sortDocuments } from "./helpers";
import { s } from "./styles";

/* Small anchored popover behind the toolbar's single Upload icon (D-UPLOAD).
   Its content is the shipped `UploadControls` widget, mounted unchanged — it
   already renders its own "Upload file"/"Upload archive" trigger buttons and
   manages its own modal + file-picker state. Closing on any click inside the
   panel hands off cleanly to whichever modal `UploadControls` opens. */
function UploadMenu({ repoId, label }: { repoId: string; label: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={s.uploadMenuWrap}>
      <IconBtn icon="Upload" label={label} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div style={s.uploadMenuPanel} onClickCapture={() => setOpen(false)}>
          <UploadControls repoId={repoId} />
        </div>
      )}
    </div>
  );
}

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.full_name ?? activeRepo?.name ?? "repository";

  const { data, isLoading, isError, refetch } = useDiscovery(repoId);
  const refresh = useRefreshDiscovery();

  const [query, setQuery] = React.useState("");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [createMode, setCreateMode] = React.useState<"folder" | "file" | null>(null);

  function toggleFilter() {
    setFilterOpen((open) => {
      if (open) setQuery("");
      return !open;
    });
  }

  const documents = data?.documents ?? [];
  const sorted = React.useMemo(() => sortDocuments(documents), [documents]);
  const filtered = React.useMemo(() => filterDocuments(sorted, query), [sorted, query]);
  const selectedDoc = documents.find((d) => d.path === selectedPath) ?? null;

  function handleRefresh() {
    if (!repoId) return;
    refresh.mutate(repoId);
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("page.title") }]}>
      <div style={s.container}>
        <div style={s.leftPane}>
          <div style={s.leftHeader}>
            <div style={s.leftHeaderText}>
              <h1 style={s.h1}>{t("page.title")}</h1>
              <p style={s.subtitle}>{t("page.subtitle")}</p>
            </div>
            {repoId && (
              <div style={s.toolbar}>
                <IconBtn icon="FileText" label={t("create.file")} onClick={() => setCreateMode("file")} />
                <IconBtn icon="Folder" label={t("create.folder")} onClick={() => setCreateMode("folder")} />
                <UploadMenu repoId={repoId} label={t("upload.menuLabel")} />
                <IconBtn
                  icon="Search"
                  label={t("page.filterPlaceholder")}
                  onClick={toggleFilter}
                  active={filterOpen}
                />
                <IconBtn
                  icon="RefreshCw"
                  label={refresh.isPending ? t("refresh.refreshing") : t("refresh.action")}
                  onClick={handleRefresh}
                />
              </div>
            )}
          </div>

          {filterOpen && (
            <div style={s.filterBox}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.filterPlaceholder")}
                aria-label={t("page.filterPlaceholder")}
                style={s.filterInput}
              />
            </div>
          )}

          {isLoading && (
            <div style={s.list}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
            </div>
          )}

          {!isLoading && isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

          {!isLoading && !isError && documents.length === 0 && (
            <EmptyState icon="FileText" title={t("emptyState.title")} body={t("emptyState.body")} />
          )}

          {!isLoading && !isError && data && documents.length > 0 && (
            <>
              <div style={s.list}>
                {filtered.length === 0 && <p style={s.noMatches}>{t("list.noMatches")}</p>}
                {filtered.map((doc) => {
                  const selected = doc.path === selectedPath;
                  return (
                    <button
                      key={doc.path}
                      type="button"
                      style={s.row(selected)}
                      onClick={() => setSelectedPath(doc.path)}
                    >
                      <Icon.FileText size={15} style={s.rowIcon} />
                      <span style={s.rowFilename} title={doc.path}>
                        {doc.filename}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={s.footer}>
                <span style={s.footerDot} aria-hidden="true" />
                <div style={s.footerText}>
                  <span>{t("footer.summary", { count: data.file_count, tokens: data.token_total })}</span>
                  <span style={s.footerScanned}>
                    {(() => {
                      const scannedAtText = formatScannedAt(data.scanned_at);
                      return scannedAtText
                        ? t("footer.lastScanned", { time: scannedAtText })
                        : t("footer.neverScanned");
                    })()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={s.rightPane}>
          <DetailPane repoId={repoId} doc={selectedDoc} coveragePct={data?.coverage_pct ?? null} />
        </div>
      </div>

      {createMode && repoId && (
        <CreateModal repoId={repoId} mode={createMode} onClose={() => setCreateMode(null)} />
      )}
    </AppShell>
  );
}
