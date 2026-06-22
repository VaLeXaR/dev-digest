import type React from "react";

export const s = {
  field: { marginBottom: 16 } as React.CSSProperties,
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
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } as React.CSSProperties,
};
