import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  // ---- review_focus[] — its own bottom card (design/01-overview-pr-brief.png) ----
  reviewFocusLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    padding: "1px 6px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,

  reviewFocusList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,

  reviewFocusRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    width: "100%",
    padding: "4px 2px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    fontSize: 13,
    borderRadius: 4,
    textDecoration: "none",
  } satisfies CSSProperties,

  reviewFocusGlyph: {
    color: "var(--text-muted)",
    flexShrink: 0,
    marginTop: 2,
  } satisfies CSSProperties,

  reviewFocusPath: {
    color: "var(--accent-text)",
    fontWeight: 500,
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  reviewFocusDash: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  reviewFocusReason: {
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
