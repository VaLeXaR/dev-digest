"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Markdown, Modal } from "@devdigest/ui";
import type { DiscoveredDoc, Skill } from "@devdigest/shared";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import {
  useDiscovery,
  useSkillContextDocs,
  useSetSkillContextDocs,
  useDocContent,
} from "../../../../../../../lib/hooks/project-context";
import { s } from "./styles";

/** Client-side sum of already-fetched `token_estimate` values — no LLM call,
    no extra fetch per toggle (AC-11/12). Duplicated locally per ContextTab
    (agent + skill editors don't share tab-internal logic in this codebase). */
function sumTokens(docs: DiscoveredDoc[]): number {
  return docs.reduce((total, d) => total + d.token_estimate, 0);
}

function PreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string | null | undefined;
  path: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useDocContent(repoId, path, true);
  const filename = path.split("/").pop() ?? path;

  return (
    <Modal title={filename} subtitle={path} onClose={onClose}>
      <div style={s.previewBody}>
        {isLoading && <span style={s.previewState}>Loading preview…</span>}
        {!isLoading && isError && (
          <span style={s.previewState}>Could not load this document.</span>
        )}
        {!isLoading && !isError && <Markdown>{data?.content}</Markdown>}
      </div>
    </Modal>
  );
}

/* Same flat-list + in-place-toggle pattern as the agent editor's ContextTab
   (client INSIGHTS 2026-07-10): checking a row must never move it into a
   differently-headed section — that visual "jump" was the bug being fixed
   here. Attached docs render first, in stored (draggable) order; available
   docs render below a divider, unchecked. */
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
}) {
  const isStale = attached && !doc;
  // Stale rows (attached path no longer discovered) have no doc metadata to
  // derive a filename from — identify and display them by their full path,
  // matching the prior implementation's convention.
  const label = doc ? doc.filename : path;

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
        aria-label={`${attached ? "Detach" : "Attach"} ${label}`}
        checked={attached}
        onChange={onToggle}
        style={s.checkbox}
      />
      <span style={s.docName}>{label}</span>
      {doc && (
        <span style={s.docPath} title={path}>{path}</span>
      )}
      {doc && <span style={s.badge(doc.root_folder)}>{doc.root_folder}</span>}
      {doc && !doc.tracked && <span style={s.untrackedBadge}>untracked</span>}
      {isStale && <span style={s.staleBadge}>stale/missing</span>}
      <span style={s.previewBtn}>
        <Button kind="ghost" size="sm" icon="Eye" onClick={onPreview}>
          Preview
        </Button>
      </span>
    </div>
  );
}

export function ContextTab({ skill }: { skill: Skill }) {
  const { repoId } = useActiveRepo();
  const { data: discovery } = useDiscovery(repoId);
  const { data: attached } = useSkillContextDocs(skill.id);
  const setContextDocs = useSetSkillContextDocs(skill.id);

  const [paths, setPaths] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    setPaths(attached?.paths ?? []);
  }, [attached]);

  const documents = discovery?.documents ?? [];
  const docByPath = new Map(documents.map((d) => [d.path, d]));
  const attachedSet = new Set(paths);

  function persist(next: string[]) {
    setPaths(next);
    setContextDocs.mutate(next);
  }

  function handleAttach(path: string) {
    persist([...paths, path]);
  }

  function handleDetach(path: string) {
    persist(paths.filter((p) => p !== path));
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

  const attachedDocs = paths
    .map((p) => docByPath.get(p))
    .filter((d): d is DiscoveredDoc => !!d);
  const attachedVisible = paths.filter((p) => matches(p, docByPath.get(p)?.filename));
  const availableVisible = documents.filter(
    (d) => !attachedSet.has(d.path) && matches(d.path, d.filename),
  );

  const tokenTotal = sumTokens(attachedDocs);
  const overBudget = discovery != null && tokenTotal > discovery.token_budget;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>Project context to use</span>
        <span style={s.countBadge}>{paths.length} attached</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter documents…"
          style={s.search}
        />
      </div>
      <div style={s.hint}>Any agent using this skill inherits these documents.</div>

      {documents.length === 0 && paths.length === 0 ? (
        <div style={s.empty}>
          No documents discovered yet — visit Project Context to add some.
        </div>
      ) : (
        <>
          {attachedVisible.map((path) => (
            <ContextRow
              key={path}
              path={path}
              doc={docByPath.get(path)}
              attached
              dragOver={dragOver === path}
              onToggle={() => handleDetach(path)}
              onDragStart={() => handleDragStart(path)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(path);
              }}
              onDrop={() => handleDrop(path)}
              onDragLeave={() => setDragOver(null)}
              onPreview={() => setPreviewPath(path)}
            />
          ))}

          {availableVisible.length > 0 && (
            <>
              {attachedVisible.length > 0 && <div style={s.divider} />}
              {availableVisible.map((doc) => (
                <ContextRow
                  key={doc.path}
                  path={doc.path}
                  doc={doc}
                  attached={false}
                  dragOver={false}
                  onToggle={() => handleAttach(doc.path)}
                  onPreview={() => setPreviewPath(doc.path)}
                />
              ))}
            </>
          )}
        </>
      )}

      <div style={s.footer}>
        <span>
          {paths.length} attached · ~{tokenTotal} tokens
        </span>
        {overBudget && discovery && (
          <span style={s.warning}>
            Exceeds workspace token budget ({discovery.token_budget})
          </span>
        )}
      </div>

      <div style={s.serializesAs}>
        <div style={s.serializesHeader}>SERIALIZES AS</div>
        <div style={s.serializesHint}>
          Illustrative preview of how this skill&apos;s attached docs appear in the
          assembled prompt — not the runtime header.
        </div>
        {paths.length === 0 ? (
          <div style={s.serializesEmpty}>No attached docs — nothing is serialized.</div>
        ) : (
          <pre style={s.serializesBlock}>
            {["## Project specifications", ...paths.map((p) => `- ${p}`)].join("\n")}
          </pre>
        )}
      </div>

      {previewPath && (
        <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
