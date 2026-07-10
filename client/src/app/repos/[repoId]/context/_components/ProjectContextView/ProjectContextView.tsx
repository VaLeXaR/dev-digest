/* ProjectContextView — Project Context page (T-11): discovered-doc list with
   root-folder + tracked badges, filter box, lazy preview modal, refresh, and
   an aggregate footer. `headerActions` is the deliberate insertion point for
   T-15's Create folder / Create file / Upload actions — do not assume this
   row only ever holds Refresh. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, IconBtn, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../../../components/app-shell";
import { useActiveRepo } from "../../../../../../lib/repo-context";
import { useDiscovery, useRefreshDiscovery } from "../../../../../../lib/hooks/project-context";
import { CreateModal } from "./_components/CreateModal/CreateModal";
import { EditDocModal } from "./_components/EditDocModal/EditDocModal";
import { PreviewModal } from "./_components/PreviewModal/PreviewModal";
import { UploadControls } from "./_components/UploadControls/UploadControls";
import { filterDocuments, formatScannedAt, sortDocuments } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? "repository";

  const { data, isLoading, isError, refetch } = useDiscovery(repoId);
  const refresh = useRefreshDiscovery();

  const [query, setQuery] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [editPath, setEditPath] = React.useState<string | null>(null);
  const [createMode, setCreateMode] = React.useState<"folder" | "file" | null>(null);

  const documents = data?.documents ?? [];
  const sorted = React.useMemo(() => sortDocuments(documents), [documents]);
  const filtered = React.useMemo(() => filterDocuments(sorted, query), [sorted, query]);

  function handleRefresh() {
    if (!repoId) return;
    refresh.mutate(repoId);
  }

  return (
    <AppShell crumb={[{ label: "DevDigest" }, { label: `${t("page.title")} · ${repoName}` }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.headerActions}>
            <Button
              kind="secondary"
              size="sm"
              icon={refresh.isPending ? undefined : "RefreshCw"}
              onClick={handleRefresh}
              disabled={!repoId || refresh.isPending}
            >
              {refresh.isPending ? t("refresh.refreshing") : t("refresh.action")}
            </Button>
            {repoId && (
              <>
                <Button kind="secondary" size="sm" icon="Folder" onClick={() => setCreateMode("folder")}>
                  {t("create.folder")}
                </Button>
                <Button kind="secondary" size="sm" icon="FileText" onClick={() => setCreateMode("file")}>
                  {t("create.file")}
                </Button>
                <UploadControls repoId={repoId} />
              </>
            )}
          </div>
        </div>

        <div style={s.filterBox}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("page.filterPlaceholder")}
            aria-label={t("page.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>

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
              {filtered.map((doc) => (
                <div key={doc.path} style={s.row}>
                  <span style={s.rowPath} title={doc.path}>
                    {doc.path}
                  </span>
                  <span style={{ ...s.badge, ...s.rootFolderBadge }}>
                    {t("list.rootFolderBadge", { rootFolder: doc.root_folder })}
                  </span>
                  <span
                    style={{
                      ...s.badge,
                      ...(doc.tracked ? s.trackedBadgeTracked : s.trackedBadgeUntracked),
                    }}
                  >
                    {doc.tracked ? t("trackedBadge.tracked") : t("trackedBadge.untracked")}
                  </span>
                  <span style={s.rowTokens}>{t("list.tokenEstimate", { tokens: doc.token_estimate })}</span>
                  <IconBtn icon="Eye" label={t("preview.open")} onClick={() => setPreviewPath(doc.path)} />
                  {!doc.tracked && (
                    <IconBtn icon="Edit" label={t("edit.action")} onClick={() => setEditPath(doc.path)} />
                  )}
                </div>
              ))}
            </div>

            <div style={s.footer}>
              <span>{t("footer.summary", { count: data.file_count, tokens: data.token_total })}</span>
              <span>
                {(() => {
                  const scannedAtText = formatScannedAt(data.scanned_at);
                  return scannedAtText
                    ? t("footer.lastScanned", { time: scannedAtText })
                    : t("footer.neverScanned");
                })()}
              </span>
            </div>
          </>
        )}
      </div>

      {previewPath && repoId && (
        <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}

      {editPath && repoId && (
        <EditDocModal repoId={repoId} path={editPath} onClose={() => setEditPath(null)} />
      )}

      {createMode && repoId && (
        <CreateModal repoId={repoId} mode={createMode} onClose={() => setCreateMode(null)} />
      )}
    </AppShell>
  );
}
