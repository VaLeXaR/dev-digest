import type { CSSProperties } from "react";

export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  } satisfies CSSProperties,
  toggleLabel: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px 0",
  } satisfies CSSProperties,
  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  group: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  groupLoc: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  groupTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  verdictGrid: (columns: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 1,
    background: "var(--border)",
  }),
  verdictCell: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  verdictAgent: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  verdictState: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  verdictMuted: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
