import type { CSSProperties } from "react";

/** Co-located styles for CompareRunsModal (design/02-compare-runs-modal.png). */
export const s = {
  body: { padding: "18px 24px 6px" } satisfies CSSProperties,

  tiles: { display: "flex", gap: 12, marginBottom: 22 } satisfies CSSProperties,
  tile: {
    flex: 1,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    minWidth: 0,
  } satisfies CSSProperties,
  tileLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 6 } satisfies CSSProperties,
  tileOld: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  tileArrow: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  tileNew: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  tileDelta: { display: "block", fontSize: 12.5, fontWeight: 600, marginTop: 6 } satisfies CSSProperties,

  diffSection: { marginBottom: 8 } satisfies CSSProperties,
  diffHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  diffLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  diffLegend: { display: "flex", alignItems: "center", gap: 16, marginBottom: 10 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendSwatch: { width: 10, height: 10, borderRadius: 2, display: "inline-block" } satisfies CSSProperties,

  diffBox: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.6,
    maxHeight: 260,
    overflow: "auto",
    marginBottom: 18,
  } satisfies CSSProperties,
  diffLoading: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  diffLineUnchanged: {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  diffLineAdded: {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-primary)",
    background: "var(--ok-bg)",
    whiteSpace: "pre-wrap",
    borderRadius: 3,
    padding: "0 4px",
    margin: "1px 0",
  } satisfies CSSProperties,
  diffLineRemoved: {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-muted)",
    background: "var(--crit-bg)",
    textDecoration: "line-through",
    whiteSpace: "pre-wrap",
    borderRadius: 3,
    padding: "0 4px",
    margin: "1px 0",
  } satisfies CSSProperties,

  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
