import type React from "react";

export const s = {
  body: { padding: 24 } as React.CSSProperties,
  field: { marginBottom: 16 } as React.CSSProperties,
  fieldLast: { marginBottom: 0 } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } as React.CSSProperties,
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
  typePicker: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  } as React.CSSProperties,
  typeBtn: (active: boolean, color: string): React.CSSProperties => ({
    padding: "9px 14px",
    borderRadius: 8,
    border: `1.5px solid ${active ? color : "var(--border)"}`,
    background: active ? color + "22" : "var(--bg-input)",
    color: active ? color : "var(--text-secondary)",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color .12s, background .12s, color .12s",
  }),
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } as React.CSSProperties,
};
