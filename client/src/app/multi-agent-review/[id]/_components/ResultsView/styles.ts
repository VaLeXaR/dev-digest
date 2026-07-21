import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 1400,
    margin: "0 auto",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  } satisfies CSSProperties,
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  titleGroup: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flex: 1,
    minWidth: 0,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  h1: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  modeToggle: {
    display: "flex",
    gap: 2,
    padding: 3,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  prMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  prTitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  metaLine: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  columnsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  loadingWrap: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
} as const;
