"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Agent, DiscoveredDoc } from "@devdigest/shared";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import {
  useDiscovery,
  useAgentContextDocs,
  useSetAgentContextDocs,
} from "../../../../../../../lib/hooks/project-context";
import { s } from "./styles";

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
  attachLabel,
  detachLabel,
  staleLabel,
  staleTitle,
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
  attachLabel: string;
  detachLabel: string;
  staleLabel: string;
  staleTitle: string;
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
      {doc && <span style={s.rootBadge}>{doc.root_folder}</span>}
      {isStale && (
        <span style={s.staleBadge} title={staleTitle}>
          {staleLabel}
        </span>
      )}
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

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("title")}</span>
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
              attachLabel={attachLabel}
              detachLabel={detachLabel}
              staleLabel={staleLabel}
              staleTitle={staleTitle}
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
                  attachLabel={attachLabel}
                  detachLabel={detachLabel}
                  staleLabel={staleLabel}
                  staleTitle={staleTitle}
                />
              ))}
            </>
          )}
        </>
      )}

      <div style={s.footer}>
        <span>{t("tokenFooter", { count: paths.length, tokens: tokenTotal })}</span>
        {overBudget && (
          <span style={s.warning}>{t("budgetWarning", { budget: tokenBudget })}</span>
        )}
      </div>
    </div>
  );
}
