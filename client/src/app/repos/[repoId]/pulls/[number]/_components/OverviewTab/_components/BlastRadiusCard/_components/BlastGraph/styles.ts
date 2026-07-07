import type { CSSProperties } from "react";

export const s = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "32px 12px",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  icon: {
    color: "var(--text-muted)",
    opacity: 0.6,
  } satisfies CSSProperties,

  text: {
    fontSize: 14,
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
