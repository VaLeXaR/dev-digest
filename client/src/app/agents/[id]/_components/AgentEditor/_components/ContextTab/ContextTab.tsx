"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown, Modal } from "@devdigest/ui";
import type { Agent, DiscoveredDoc } from "@devdigest/shared";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import {
  useDiscovery,
  useAgentContextDocs,
  useSetAgentContextDocs,
  useDocContent,
} from "../../../../../../../lib/hooks/project-context";
import { s } from "./styles";

function PreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string | null | undefined;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("agents.context");
  const { data, isLoading, isError } = useDocContent(repoId, path, true);
  const filename = path.split("/").pop() ?? path;

  return (
    <Modal title={filename} subtitle={path} onClose={onClose}>
      <div style={s.previewBody}>
        {isLoading && <span style={s.previewState}>{t("previewLoading")}</span>}
        {!isLoading && isError && <span style={s.previewState}>{t("previewError")}</span>}
        {!isLoading && !isError && <Markdown>{data?.content}</Markdown>}
      </div>
    </Modal>
  );
}

function ContextRow({
  path,
  doc,
  attached,
  dragOver,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onPreview,
  attachLabel,
  detachLabel,
  staleLabel,
  staleTitle,
  previewLabel,
}: {
  path: string;
  doc: DiscoveredDoc | undefined;
  attached: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragLeave?: () => void;
  onPreview: () => void;
  attachLabel: string;
  detachLabel: string;
  staleLabel: string;
  staleTitle: string;
  previewLabel: string;
}) {
  const isStale = attached && !doc;
  const filename = doc?.filename ?? path.split("/").pop() ?? path;

  return (
    <div
      draggable={attached}
      onDragStart={attached ? onDragStart : undefined}
      onDragOver={attached ? onDragOver : undefined}
      onDrop={attached ? onDrop : undefined}
      onDragLeave={attached ? onDragLeave : undefined}
      style={attached ? s.row(dragOver) : s.unlinkedRow()}
    >
      <span style={attached ? s.drag : s.dragPlaceholder}>≡</span>
      <input
        type="checkbox"
        aria-label={`${attached ? detachLabel : attachLabel} ${path}`}
        checked={attached}
        onChange={onToggle}
        style={s.checkbox}
      />
      <span style={s.docName}>{filename}</span>
      <span style={s.docPath}>{path}</span>
      {doc && <span style={s.rootBadge(doc.root_folder)}>{doc.root_folder}</span>}
      {isStale && (
        <span style={s.staleBadge} title={staleTitle}>
          {staleLabel}
        </span>
      )}
      <span style={s.previewBtn}>
        <Button kind="ghost" size="sm" icon="Eye" onClick={onPreview}>
          {previewLabel}
        </Button>
      </span>
    </div>
  );
}

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents.context");
  const { repoId } = useActiveRepo();
  const { data: discovery } = useDiscovery(repoId);
  const { data: attachedData } = useAgentContextDocs(agent.id);
  const setContextDocs = useSetAgentContextDocs(agent.id);

  const [search, setSearch] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  // `attachedData` arrives after initial render (async query) — sync local
  // order state whenever it changes so drag-reorder has something to mutate.
  useEffect(() => {
    if (attachedData) setPaths(attachedData.paths);
  }, [attachedData]);

  const documents = discovery?.documents ?? [];
  const docMap = new Map(documents.map((d) => [d.path, d]));

  function persist(next: string[]) {
    setPaths(next);
    setContextDocs.mutate(next);
  }

  function handleToggle(path: string) {
    if (paths.includes(path)) {
      persist(paths.filter((p) => p !== path));
    } else {
      persist([...paths, path]);
    }
  }

  function handleDragStart(path: string) {
    dragId.current = path;
  }

  function handleDrop(targetPath: string) {
    if (!dragId.current || dragId.current === targetPath) return;
    const fromIdx = paths.indexOf(dragId.current);
    const toIdx = paths.indexOf(targetPath);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...paths];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId.current);
    persist(reordered);
    dragId.current = null;
    setDragOver(null);
  }

  const q = search.toLowerCase();
  const matches = (path: string, filename?: string) =>
    !q || path.toLowerCase().includes(q) || (filename ?? "").toLowerCase().includes(q);

  const attachedVisible = paths.filter((p) => matches(p, docMap.get(p)?.filename));
  const availableVisible = documents.filter(
    (d) => !paths.includes(d.path) && matches(d.path, d.filename),
  );

  const tokenTotal = paths.reduce((sum, p) => sum + (docMap.get(p)?.token_estimate ?? 0), 0);
  const tokenBudget = discovery?.token_budget;
  const overBudget = typeof tokenBudget === "number" && tokenTotal > tokenBudget;

  const attachLabel = t("attach");
  const detachLabel = t("detach");
  const staleLabel = t("staleBadge");
  const staleTitle = t("staleTitle");
  const previewLabel = t("preview");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("title")}</span>
        <span style={s.countBadge}>
          {t("countBadge", { attached: paths.length, total: documents.length })}
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("filterPlaceholder")}
          style={s.search}
        />
      </div>
      <div style={s.hint}>{t("hint")}</div>

      {documents.length === 0 && paths.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <>
          {attachedVisible.map((path) => (
            <ContextRow
              key={path}
              path={path}
              doc={docMap.get(path)}
              attached
              dragOver={dragOver === path}
              onToggle={() => handleToggle(path)}
              onDragStart={() => handleDragStart(path)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(path);
              }}
              onDrop={() => handleDrop(path)}
              onDragLeave={() => setDragOver(null)}
              onPreview={() => setPreviewPath(path)}
              attachLabel={attachLabel}
              detachLabel={detachLabel}
              staleLabel={staleLabel}
              staleTitle={staleTitle}
              previewLabel={previewLabel}
            />
          ))}

          {availableVisible.length > 0 && (
            <>
              {attachedVisible.length > 0 && <div style={s.divider} />}
              {availableVisible.map((d) => (
                <ContextRow
                  key={d.path}
                  path={d.path}
                  doc={d}
                  attached={false}
                  dragOver={false}
                  onToggle={() => handleToggle(d.path)}
                  onPreview={() => setPreviewPath(d.path)}
                  attachLabel={attachLabel}
                  detachLabel={detachLabel}
                  staleLabel={staleLabel}
                  staleTitle={staleTitle}
                  previewLabel={previewLabel}
                />
              ))}
            </>
          )}
        </>
      )}

      <div style={s.footer}>
        <span>{t("tokenFooter", { tokens: tokenTotal })}</span>
        <span style={s.footerNotice}>{t("injectedNotice")}</span>
        {overBudget && (
          <span style={s.warning}>{t("budgetWarning", { budget: tokenBudget })}</span>
        )}
      </div>

      {previewPath && (
        <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
