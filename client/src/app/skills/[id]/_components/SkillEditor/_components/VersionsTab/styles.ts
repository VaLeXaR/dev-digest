import type React from "react";

export const s = {
  empty: { fontSize: 13, color: "var(--text-muted)" } as React.CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 6,
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    cursor: "pointer",
    background: "var(--bg-surface)",
  } as React.CSSProperties,
  version: { fontWeight: 600, fontSize: 13 } as React.CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  preview: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  body: {
    margin: 0,
    padding: "12px 16px",
    background: "var(--bg-primary)",
    fontSize: 12,
    overflow: "auto",
    maxHeight: 300,
    borderTop: "1px solid var(--border)",
  } as React.CSSProperties,
};
