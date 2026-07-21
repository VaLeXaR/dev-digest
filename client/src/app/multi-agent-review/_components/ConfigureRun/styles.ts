import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 60px",
    maxWidth: 760,
    margin: "0 auto",
  } satisfies CSSProperties,

  landing: {
    minHeight: "70vh",
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,

  h1: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 1.5,
    maxWidth: 620,
  } satisfies CSSProperties,

  step: {
    marginBottom: 28,
  } satisfies CSSProperties,

  stepHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } satisfies CSSProperties,

  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,

  stepBadge: (primary: boolean): CSSProperties => ({
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
    background: primary ? "var(--accent)" : "var(--accent-bg)",
    color: primary ? "#fff" : "var(--accent-text)",
  }),

  stepLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  selectAllLink: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent-text, var(--accent))",
    cursor: "pointer",
  } satisfies CSSProperties,

  emptyBox: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  agentList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies CSSProperties,

  agentRow: (checked: boolean, color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid " + (checked ? color : "var(--border)"),
    background: checked ? color + "0d" : "var(--bg-elevated)",
    cursor: "pointer",
  }),

  checkboxBox: (checked: boolean, color: string): CSSProperties => ({
    width: 17,
    height: 17,
    borderRadius: 4,
    border: "1.5px solid " + (checked ? color : "var(--border-strong)"),
    background: checked ? color : "transparent",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),

  iconBubble: (color: string): CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: 7,
    background: color + "1a",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),

  agentText: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  agentName: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  agentDesc: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 2,
    lineHeight: 1.4,
  } satisfies CSSProperties,

  agentHint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,

  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginTop: 24,
  } satisfies CSSProperties,

  summaryText: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
