import type { CSSProperties } from "react";

export const TOAST_DURATION_MS = 4000;

export const s = {
  container: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxWidth: 380,
  } satisfies CSSProperties,

  item: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 9,
    color: "var(--text-primary)",
    fontSize: 14,
    boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
    animation: "ddToastIn .16s ease-out",
  } satisfies CSSProperties,

  message: { flex: 1 } satisfies CSSProperties,

  dismiss: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 16,
  } satisfies CSSProperties,
};
