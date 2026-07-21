import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  tabRow: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
    // Only horizontal tab scrolling; without this, overflow-x:auto promotes the
    // (visible) y-axis to auto and the tabs' 2px active border overflows the row
    // by ~1px, showing a spurious vertical scrollbar.
    overflowY: "hidden",
  } satisfies CSSProperties,
  tab: (active: boolean, accent: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    borderBottom: "2px solid " + (active ? accent : "transparent"),
    marginBottom: -1,
    cursor: "pointer",
    flexShrink: 0,
  }),
  tabLabel: (active: boolean, accent: string): CSSProperties => ({
    fontSize: 13.5,
    fontWeight: active ? 700 : 500,
    color: active ? accent : "var(--text-secondary)",
  }),
  tabScore: (color: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 700,
    color,
  }),
  summaryCard: (accent: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderLeftWidth: 3,
    borderLeftColor: accent,
    background: "var(--bg-elevated)",
  }),
  scorePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 99,
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    color: "var(--text-muted)",
    fontSize: 14,
    flexShrink: 0,
  } satisfies CSSProperties,
  summaryBody: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  summaryTitle: (accent: string): CSSProperties => ({
    fontSize: 15,
    fontWeight: 700,
    color: accent,
  }),
  summaryText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    marginTop: 4,
  } satisfies CSSProperties,
  summaryRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
  viewTraceLink: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  summaryMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  noFindings: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 2px",
  } satisfies CSSProperties,
} as const;
