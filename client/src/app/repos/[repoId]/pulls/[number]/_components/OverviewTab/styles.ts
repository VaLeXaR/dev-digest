import type { CSSProperties } from "react";

export const s = {
  gridTwoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  // ---- Unified "nothing generated yet" empty state (design/01-overview-pr-brief.png's
  // BriefEmpty screen) — replaces Intent's own Recalculate + Why&Risk Brief's own
  // Generate buttons/empty text with one shared trigger. ----
  emptyCard: {
    minHeight: 320,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  emptyInner: {
    textAlign: "center",
    maxWidth: 340,
  } satisfies CSSProperties,
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 14px",
  } satisfies CSSProperties,
  emptyTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 6,
  } satisfies CSSProperties,
  emptyDescription: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    marginBottom: 18,
  } satisfies CSSProperties,
} as const;
