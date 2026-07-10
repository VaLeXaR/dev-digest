import type { CSSProperties } from "react";

export const s = {
  container: {
    display: "flex",
    height: "calc(100vh - 64px)",
    minHeight: 480,
  } satisfies CSSProperties,

  /* --- Left pane (list) --- */

  leftPane: {
    width: 360,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    padding: "20px 16px",
    overflow: "hidden",
  } satisfies CSSProperties,

  leftHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 6,
  } satisfies CSSProperties,

  leftHeaderText: { minWidth: 0 } satisfies CSSProperties,

  h1: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    margin: 0,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    marginTop: 3,
    marginBottom: 0,
    lineHeight: 1.4,
  } satisfies CSSProperties,

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,

  uploadMenuWrap: {
    position: "relative",
    display: "inline-block",
  } satisfies CSSProperties,

  uploadMenuPanel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: 200,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    zIndex: 40,
    animation: "ddpop .12s ease",
  } satisfies CSSProperties,

  filterBox: {
    marginTop: 16,
    marginBottom: 12,
    flexShrink: 0,
  } satisfies CSSProperties,

  filterInput: {
    width: "100%",
    padding: "8px 11px",
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
    gap: 4,
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
  } satisfies CSSProperties,

  noMatches: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "16px 4px",
    margin: 0,
  } satisfies CSSProperties,

  row: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid transparent",
    background: selected ? "var(--accent-bg)" : "transparent",
    borderColor: selected ? "var(--accent)" : "transparent",
    width: "100%",
    textAlign: "left" as const,
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
  }),

  rowIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  rowFilename: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,

  footerDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--ok)",
    flexShrink: 0,
    marginTop: 4,
  } satisfies CSSProperties,

  footerText: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 12,
    color: "var(--text-secondary)",
    minWidth: 0,
  } satisfies CSSProperties,

  footerScanned: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /* --- Right pane (detail) --- */

  rightPane: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  } satisfies CSSProperties,

  detailEmpty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,

  detail: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  } satisfies CSSProperties,

  detailHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "20px 28px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,

  detailHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minWidth: 0,
  } satisfies CSSProperties,

  detailHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    flexShrink: 0,
  } satisfies CSSProperties,

  detailTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    minWidth: 0,
  } satisfies CSSProperties,

  detailTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    fontFamily: "var(--font-mono, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  usedByPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 600,
    padding: "4px 11px",
    borderRadius: 999,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,

  modeToggle: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,

  modeToggleBtn: {
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    textTransform: "capitalize" as const,
  } satisfies CSSProperties,

  modeToggleBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  coverageBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  } satisfies CSSProperties,

  coverageLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
  } satisfies CSSProperties,

  detailBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "22px 28px",
  } satisfies CSSProperties,

  detailEditActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 14,
  } satisfies CSSProperties,
} as const;
