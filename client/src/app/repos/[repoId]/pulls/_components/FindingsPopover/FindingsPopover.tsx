"use client";

import React from "react";
import { Icon, SEV, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { Severity, Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { githubBlobUrl } from "@/lib/github-urls";

const SEVS: { key: string; color: string }[] = [
  { key: "CRITICAL", color: "var(--crit)" },
  { key: "WARNING", color: "var(--warn)" },
  { key: "SUGGESTION", color: "var(--sugg)" },
];

interface Props {
  prId: string;
  anchor: DOMRect;
  initialSeverity: string | null;
  onClose: () => void;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function FindingsPopover({ prId, anchor, initialSeverity, onClose, repoFullName, headSha }: Props) {
  const { data: reviews, isLoading } = usePrReviews(prId);
  const [severityFilter, setSeverityFilter] = React.useState<string | null>(initialSeverity);
  const popRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const allFindings: FindingRecord[] = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings).filter((f) => !f.dismissed_at),
    [reviews],
  );

  const counts: Record<string, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of allFindings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  const shown = severityFilter ? allFindings.filter((f) => f.severity === severityFilter) : allFindings;

  const left = Math.min(anchor.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360);
  const top = anchor.bottom + 6;

  return (
    <div
      ref={popRef}
      style={{
        position: "fixed",
        left,
        top,
        width: 340,
        maxHeight: 440,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px 8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
          {allFindings.length} FINDINGS
        </span>
        <div style={{ flex: 1 }} />
        {SEVS.map(({ key, color }) => {
          const active = severityFilter === key;
          return (
            <button
              key={key}
              onClick={() => setSeverityFilter((p) => (p === key ? null : key))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 7px",
                borderRadius: 20,
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                border: `1px solid ${active ? color : "var(--border)"}`,
                background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : "transparent",
                color: active ? color : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 11 }}>{counts[key] ?? 0}</span>
              {key}
            </button>
          );
        })}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: "18px 14px", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: "18px 14px", color: "var(--text-muted)", fontSize: 13 }}>No findings</div>
        ) : (
          shown.map((f) => (
            <div
              key={f.id}
              style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                {(() => { const s = SEV[f.severity as Severity]; const SevIc = Icon[s.icon]; return <SevIc size={13} style={{ color: s.c, flexShrink: 0 }} />; })()}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.title}
                </span>
                <CategoryTag category={f.category as Category} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, minWidth: 0 }}>
                {(() => {
                  const fileUrl = repoFullName && headSha
                    ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
                    : undefined;
                  const pathStyle: React.CSSProperties = {
                    fontSize: 11,
                    color: "var(--accent-text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    direction: "rtl",
                    textAlign: "left",
                    textDecoration: "none",
                  };
                  return fileUrl ? (
                    <a
                      className="mono"
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${f.file}:${f.start_line}`}
                      onClick={(e) => e.stopPropagation()}
                      style={pathStyle}
                    >
                      {f.file}:{f.start_line}
                    </a>
                  ) : (
                    <span
                      className="mono"
                      title={`${f.file}:${f.start_line}`}
                      style={pathStyle}
                    >
                      {f.file}:{f.start_line}
                    </span>
                  );
                })()}
                <ConfidenceNum value={f.confidence} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 3,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.4,
                }}
              >
                {f.rationale}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
