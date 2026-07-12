import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  iconBox: (bg: string, color: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),

  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  label: (color: string): CSSProperties => ({ fontSize: 18, fontWeight: 700, color }),

  sourceHint: {
    display: "inline-flex",
    alignItems: "center",
    cursor: "help",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  what: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
    margin: 0,
    marginTop: 8,
  } satisfies CSSProperties,

  why: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    margin: 0,
    marginTop: 4,
  } satisfies CSSProperties,

  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  } satisfies CSSProperties,

  scoreLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,

  scoreMeta: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  scoreMetaText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  scoreMetaTokens: {
    color: "var(--text-muted)",
    fontWeight: 400,
  } satisfies CSSProperties,
} as const;
