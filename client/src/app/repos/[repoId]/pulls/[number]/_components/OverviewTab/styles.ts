import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  intentSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  intentSummary: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    marginBottom: 4,
  } satisfies CSSProperties,

  chipGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  chipGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,

  chipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  } satisfies CSSProperties,

  chipIn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--ok, #22c55e)",
    background: "var(--ok-bg, #052e1c)",
    color: "var(--ok, #22c55e)",
  } satisfies CSSProperties,

  chipOut: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  chipRiskHigh: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--crit, #ef4444)",
    background: "var(--crit-bg, #1c0a0a)",
    color: "var(--crit, #ef4444)",
  } satisfies CSSProperties,

  chipRiskMedium: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--warn, #f59e0b)",
    background: "var(--warn-bg, #1c1200)",
    color: "var(--warn, #f59e0b)",
  } satisfies CSSProperties,

  chipRiskLow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  emptyIntentText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
