"use client";

import React, { useEffect, useState } from "react";
import type { DiscoveredDoc, Skill } from "@devdigest/shared";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import {
  useDiscovery,
  useSkillContextDocs,
  useSetSkillContextDocs,
} from "../../../../../../../lib/hooks/project-context";
import { s } from "./styles";

/** Client-side sum of already-fetched `token_estimate` values — no LLM call,
    no extra fetch per toggle (AC-11/12). Duplicated locally per ContextTab
    (agent + skill editors don't share tab-internal logic in this codebase). */
function sumTokens(docs: DiscoveredDoc[]): number {
  return docs.reduce((total, d) => total + d.token_estimate, 0);
}

export function ContextTab({ skill }: { skill: Skill }) {
  const { repoId } = useActiveRepo();
  const { data: discovery } = useDiscovery(repoId);
  const { data: attached } = useSkillContextDocs(skill.id);
  const setContextDocs = useSetSkillContextDocs(skill.id);

  const [paths, setPaths] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setPaths(attached?.paths ?? []);
  }, [attached]);

  const documents = discovery?.documents ?? [];
  const docByPath = new Map(documents.map((d) => [d.path, d]));
  const attachedSet = new Set(paths);

  const q = search.toLowerCase();
  const matches = (doc: DiscoveredDoc) =>
    !q || doc.filename.toLowerCase().includes(q) || doc.path.toLowerCase().includes(q);

  const attachedDocs = paths
    .map((p) => docByPath.get(p))
    .filter((d): d is DiscoveredDoc => !!d);
  const staleAttachedPaths = paths.filter((p) => !docByPath.has(p));
  const attachedVisible = documents.filter((d) => attachedSet.has(d.path) && matches(d));
  const availableVisible = documents.filter((d) => !attachedSet.has(d.path) && matches(d));

  const tokenTotal = sumTokens(attachedDocs);
  const overBudget = discovery != null && tokenTotal > discovery.token_budget;

  function handleAttach(path: string) {
    const next = [...paths, path];
    setPaths(next);
    setContextDocs.mutate(next);
  }

  function handleDetach(path: string) {
    const next = paths.filter((p) => p !== path);
    setPaths(next);
    setContextDocs.mutate(next);
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>Project Context</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter documents…"
          style={s.search}
        />
      </div>
      <div style={s.hint}>
        Attach markdown docs from Project Context to this skill. Any agent this skill is
        linked to inherits them at run time.
      </div>

      {documents.length === 0 && staleAttachedPaths.length === 0 ? (
        <div style={s.empty}>
          No documents discovered yet — visit Project Context to add some.
        </div>
      ) : (
        <>
          {(attachedVisible.length > 0 || staleAttachedPaths.length > 0) && (
            <div style={s.section}>
              <span style={s.sectionLabel}>Attached</span>
              {attachedVisible.map((doc) => (
                <div key={doc.path} style={s.row}>
                  <input
                    type="checkbox"
                    aria-label={`Detach ${doc.filename}`}
                    checked
                    onChange={() => handleDetach(doc.path)}
                    style={s.checkbox}
                  />
                  <span style={s.docPath} title={doc.path}>{doc.filename}</span>
                  <span style={s.badge}>{doc.root_folder}</span>
                  {!doc.tracked && <span style={s.untrackedBadge}>untracked</span>}
                  <span style={s.tokenCount}>~{doc.token_estimate} tok</span>
                </div>
              ))}
              {staleAttachedPaths.map((path) => (
                <div key={path} style={s.row}>
                  <input
                    type="checkbox"
                    aria-label={`Detach ${path}`}
                    checked
                    onChange={() => handleDetach(path)}
                    style={s.checkbox}
                  />
                  <span style={s.docPathFlex} title={path}>{path}</span>
                  <span style={s.staleBadge}>stale/missing</span>
                </div>
              ))}
            </div>
          )}

          {availableVisible.length > 0 && (
            <div style={s.section}>
              <span style={s.sectionLabel}>Available</span>
              {availableVisible.map((doc) => (
                <div key={doc.path} style={s.row}>
                  <input
                    type="checkbox"
                    aria-label={`Attach ${doc.filename}`}
                    checked={false}
                    onChange={() => handleAttach(doc.path)}
                    style={s.checkbox}
                  />
                  <span style={s.docPath} title={doc.path}>{doc.filename}</span>
                  <span style={s.badge}>{doc.root_folder}</span>
                  <span style={s.tokenCount}>~{doc.token_estimate} tok</span>
                </div>
              ))}
            </div>
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
    </div>
  );
}
