import type React from "react";

export const s = {
  empty: { fontSize: 13, color: "var(--text-muted)" } as React.CSSProperties,

  header: {
    marginBottom: 20,
  } as React.CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  } as React.CSSProperties,

  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
  } as React.CSSProperties,

  countBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "2px 8px",
  } as React.CSSProperties,

  subtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } as React.CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
  } as React.CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,

  rowLast: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    background: "var(--bg-surface)",
  } as React.CSSProperties,

  vBadge: (current: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 6,
    background: current ? "var(--accent)" : "var(--bg-primary)",
    color: current ? "#fff" : "var(--text-muted)",
    border: current ? "none" : "1px solid var(--border)",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  }),

  meta: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  preview: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  date: {
    fontSize: 12,
    color: "var(--text-muted)",
  } as React.CSSProperties,

  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  } as React.CSSProperties,

  currentBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
    background: "rgba(34,197,94,0.12)",
    color: "rgb(34,197,94)",
    border: "1px solid rgba(34,197,94,0.3)",
  } as React.CSSProperties,

  actionBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
  } as React.CSSProperties,
};
