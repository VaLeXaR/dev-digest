import type React from "react";

export const s = {
  section: { marginBottom: 24 } as React.CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
    display: "block",
  } as React.CSSProperties,
  helper: { fontSize: 11, color: "var(--text-muted)", marginTop: 4 } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text-primary)",
    fontSize: 13,
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  editorHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  } as React.CSSProperties,
  filename: { fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" } as React.CSSProperties,
  unsaved: {
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" } as React.CSSProperties,
  saveRow: { display: "flex", justifyContent: "flex-end", marginTop: 16 } as React.CSSProperties,
};
