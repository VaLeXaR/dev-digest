/* DetailPane — right pane of the two-pane Project Context redesign (T-03).
   Replaces the popup PreviewModal/EditDocModal: shows the selected document
   inline with a Preview|Edit segmented toggle (Edit only when
   `doc.tracked === false`, RR12/RR13), a "Used by N agents" pill
   (`doc.used_by_agents`, RR5/RR7), and a repo-level coverage ring
   (`coverage_pct`, RR6/RR8/D-COV — same value on every doc, null-safe).
   Preview renders <Markdown> via the shipped `useDocContent` hook (moved
   from PreviewModal); Edit renders the shipped CodeMirror + lang-markdown
   setup (moved from EditDocModal), saved via the shipped `useEditDoc`. */
"use client";

import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Markdown } from "@devdigest/ui";
import type { DiscoveredDoc } from "@devdigest/shared";
import { useDocContent, useEditDoc } from "../../../../../../../../lib/hooks/project-context";
import { s } from "../../styles";

/* Inline SVG ring, copied verbatim from `StatsTab.tsx`'s `RingChart`
   (client INSIGHTS 2026-06-22) — self-contained, no chart library. Renders a
   null-safe placeholder when `pct` is null (zero discovered docs). */
const RING_R = 20;
const RING_CIRC = 2 * Math.PI * RING_R;

function RingChart({ pct }: { pct: number | null }) {
  const filled = pct == null ? 0 : (pct / 100) * RING_CIRC;
  return (
    <svg width={56} height={56} style={{ flexShrink: 0 }}>
      <circle cx={28} cy={28} r={RING_R} fill="none" stroke="var(--border)" strokeWidth={5} />
      {pct != null && (
        <circle
          cx={28}
          cy={28}
          r={RING_R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={5}
          strokeDasharray={`${filled} ${RING_CIRC - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
      )}
      <text
        x={28}
        y={28}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill={pct == null ? "var(--text-muted)" : "var(--text-primary)"}
      >
        {pct == null ? "—" : pct}
      </text>
    </svg>
  );
}

export function DetailPane({
  repoId,
  doc,
  coveragePct,
}: {
  repoId: string | null | undefined;
  doc: DiscoveredDoc | null;
  coveragePct: number | null;
}) {
  const t = useTranslations("context");
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [body, setBody] = React.useState("");
  const [loadedPath, setLoadedPath] = React.useState<string | null>(null);
  const editDoc = useEditDoc();

  const { data, isLoading, isError } = useDocContent(repoId, doc?.path, !!doc);

  // A new selection should always land on Preview, and re-arm the editor's
  // local body buffer for the newly-selected doc's content.
  React.useEffect(() => {
    setMode("preview");
  }, [doc?.path]);

  React.useEffect(() => {
    if (data && loadedPath !== data.path) {
      setBody(data.content);
      setLoadedPath(data.path);
    }
  }, [data, loadedPath]);

  if (!doc) {
    return (
      <div style={s.detailEmpty}>
        <EmptyState icon="FileText" title={t("detail.emptyTitle")} body={t("detail.emptyBody")} />
      </div>
    );
  }

  const canEdit = doc.tracked === false;
  const editorReady = !isLoading && !isError && loadedPath === doc.path;
  const titleTooltip = `${doc.path} — ${
    doc.tracked ? t("trackedBadge.tracked") : t("trackedBadge.untracked")
  } · ${t("list.tokenEstimate", { tokens: doc.token_estimate })}`;

  function handleSave() {
    if (!repoId || !doc) return;
    editDoc.mutate({ repoId, body: { path: doc.path, content: body } });
  }

  return (
    <div style={s.detail}>
      <div style={s.detailHeader}>
        <div style={s.detailHeaderRow}>
          <div style={s.detailTitleRow}>
            <h2 style={s.detailTitle} title={titleTooltip}>
              {doc.filename}
            </h2>

            <div style={s.modeToggle}>
              <button
                type="button"
                style={{ ...s.modeToggleBtn, ...(mode === "preview" ? s.modeToggleBtnActive : {}) }}
                onClick={() => setMode("preview")}
              >
                {t("mode.preview")}
              </button>
              {canEdit && (
                <button
                  type="button"
                  style={{ ...s.modeToggleBtn, ...(mode === "edit" ? s.modeToggleBtnActive : {}) }}
                  onClick={() => setMode("edit")}
                >
                  {t("mode.edit")}
                </button>
              )}
            </div>
          </div>

          <div style={s.detailHeaderRight}>
            <span style={s.usedByPill}>
              <Icon.Settings size={12} style={{ flexShrink: 0 }} />
              {t("usedBy.pill", { count: doc.used_by_agents })}
            </span>

            <div style={s.coverageBlock}>
              <RingChart pct={coveragePct} />
              <span style={s.coverageLabel}>{t("coverage.label")}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={s.detailBody}>
        {isLoading && <p>{t("preview.loading")}</p>}
        {!isLoading && isError && <p>{t("preview.loadError")}</p>}

        {!isLoading && !isError && mode === "preview" && <Markdown>{data?.content}</Markdown>}

        {!isLoading && !isError && mode === "edit" && canEdit && (
          <>
            <CodeMirror
              value={body}
              height="400px"
              extensions={[markdown()]}
              theme={oneDark}
              onChange={setBody}
            />
            <div style={s.detailEditActions}>
              <Button
                kind="primary"
                size="sm"
                onClick={handleSave}
                disabled={editDoc.isPending || !editorReady}
              >
                {editDoc.isPending ? t("edit.saving") : t("edit.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
