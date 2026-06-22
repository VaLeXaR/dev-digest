import type { CSSProperties } from "react";

export const s = {
  card: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  ruleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  } satisfies CSSProperties,

  ruleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.4,
    cursor: "pointer",
    borderRadius: 4,
    padding: "2px 4px",
    margin: "-2px -4px",
  } satisfies CSSProperties,

  ruleInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.4,
    background: "var(--bg-input)",
    border: "1px solid var(--accent)",
    borderRadius: 4,
    padding: "2px 6px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,

  editHint: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 2,
    fontStyle: "italic",
  } satisfies CSSProperties,

  pathBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 500,
    fontFamily: "monospace",
    background: "var(--bg-hover)",
    color: "var(--accent-text, var(--accent))",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  snippet: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-surface, var(--bg-hover))",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 12px",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.6,
    maxHeight: 120,
    overflow: "auto",
  } satisfies CSSProperties,

  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  confidenceLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  } satisfies CSSProperties,

  confidencePct: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,

  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  } satisfies CSSProperties,
} as const;
