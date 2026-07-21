import type { CSSProperties } from "react";

/** Co-located styles for CiTab (design/01-ci-tab-agent-page.png). */
export const s = {
  wrap: { padding: "20px 28px 40px", display: "flex", flexDirection: "column" } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  headerActions: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
  } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowRepo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  rowRepoName: {
    fontSize: 13.5,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  rowTime: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  addRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    transition: "background .12s, color .12s",
  } satisfies CSSProperties,

  empty: {
    padding: "16px 0",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,

  settingsPanel: {
    marginTop: 28,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  settingsRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
  } satisfies CSSProperties,
  settingsField: {
    maxWidth: 320,
  } satisfies CSSProperties,
  versionNote: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
