import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 44px",
    maxWidth: 860,
    margin: "0 auto",
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 6,
  } satisfies CSSProperties,

  headerText: { flex: 1 } satisfies CSSProperties,

  h1: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 6,
    marginBottom: 0,
    maxWidth: 560,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  /* Refresh lives here today; T-15 appends Create folder / Create file /
     Upload actions into this same row without needing to touch layout. */
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,

  filterBox: {
    marginTop: 18,
    marginBottom: 14,
  } satisfies CSSProperties,

  filterInput: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  noMatches: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "16px 4px",
    margin: 0,
  } satisfies CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  rowPath: {
    flex: 1,
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,

  rootFolderBadge: {
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  trackedBadgeTracked: {
    background: "var(--ok-bg)",
    color: "var(--ok)",
  } satisfies CSSProperties,

  trackedBadgeUntracked: {
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  rowTokens: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
    minWidth: 78,
    textAlign: "right" as const,
    flexShrink: 0,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 18,
    padding: "14px 16px",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
