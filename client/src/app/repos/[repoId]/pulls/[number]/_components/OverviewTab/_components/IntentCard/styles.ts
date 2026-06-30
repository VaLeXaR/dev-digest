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

  summary: {
    fontSize: 14,
    fontStyle: "italic" as const,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
  } satisfies CSSProperties,

  scopeColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,

  scopeColumnHeaderIn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--ok, #22c55e)",
  } satisfies CSSProperties,

  scopeColumnHeaderOut: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  scopeList: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,

  scopeItem: {
    display: "flex",
    gap: 7,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  scopeItemBullet: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  riskGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  riskGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  riskRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  } satisfies CSSProperties,

  riskChipHigh: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--crit, #ef4444)",
    background: "var(--crit-bg, #1c0a0a)",
    color: "var(--crit, #ef4444)",
  } satisfies CSSProperties,

  riskChipMedium: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--warn, #f59e0b)",
    background: "var(--warn-bg, #1c1200)",
    color: "var(--warn, #f59e0b)",
  } satisfies CSSProperties,

  riskChipLow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
