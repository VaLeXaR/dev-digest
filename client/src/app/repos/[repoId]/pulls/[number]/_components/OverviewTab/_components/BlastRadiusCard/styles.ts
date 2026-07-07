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

  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,

  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,

  statItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,

  statNumber: {
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,

  summary: {
    fontSize: 14,
    fontStyle: "italic" as const,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  toggleGroup: {
    display: "inline-flex",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,

  toggleBtn: {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    background: "transparent",
    color: "var(--text-secondary)",
    border: "none",
    cursor: "pointer",
    textTransform: "capitalize" as const,
  } satisfies CSSProperties,

  toggleBtnActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  symbolGroup: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,

  symbolRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    textAlign: "left" as const,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  symbolCallerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "6px 12px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    padding: "3px 4px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    fontSize: 12.5,
    // Design uses a neutral monospace tone for caller paths, not the accent
    // link-blue — only the tree glyph and the pills carry color.
    color: "var(--text-secondary)",
    borderRadius: 4,
  } satisfies CSSProperties,

  callerGlyph: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  // Truncate from the START so the meaningful end (filename:line) stays
  // visible instead of the long, less-useful directory prefix. Same pattern
  // as FindingsPopover — see client/INSIGHTS.md.
  callerPath: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    direction: "rtl" as const,
    textAlign: "left" as const,
  } satisfies CSSProperties,

  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    padding: "10px 12px",
  } satisfies CSSProperties,

  pillEndpoint: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 9px",
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,

  pillCron: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 9px",
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,

  degradedBadge: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,

  degradedBadgeLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--warn)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } satisfies CSSProperties,

  degradedBadgeText: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
