import type React from "react";

export const s = {
  card: (active: boolean, enabled: boolean): React.CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    opacity: enabled ? 1 : 0.5,
    border: active ? "1px solid var(--border-active)" : "1px solid transparent",
    marginBottom: 4,
  }),
  header: { display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
  name: {
    fontWeight: 600,
    fontSize: 13,
    flex: 1,
    color: "var(--text-primary)",
  } as React.CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
  } as React.CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  typeBadge: (color: string): React.CSSProperties => ({
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 4,
    background: color + "22",
    color,
    fontWeight: 600,
  }),
  sourceBadge: { fontSize: 11, color: "var(--text-muted)" } as React.CSSProperties,
};
