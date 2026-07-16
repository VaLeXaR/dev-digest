import type { CSSProperties } from "react";

/**
 * Co-located styles for the skill Evals tab (design/07) — trimmed subset of
 * the agent EvalsTab's styles (`AgentEditor/_components/EvalsTab/styles.ts`):
 * no EVAL METRICS tile/dashboard-link styles, since design/07 omits them.
 */
export const s = {
  wrap: { padding: "20px 28px 40px", display: "flex", flexDirection: "column" } satisfies CSSProperties,

  casesHeaderRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  casesTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  casesHeaderRight: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
  } satisfies CSSProperties,

  casesList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  caseRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  statusIconWrap: {
    width: 18,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  neverRunDot: {
    width: 13,
    height: 13,
    borderRadius: "50%",
    border: "2px solid var(--text-muted)",
    background: "transparent",
  } satisfies CSSProperties,
  caseInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  caseName: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  caseSubtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  caseBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
  caseActions: {
    display: "flex",
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,

  empty: {
    padding: "24px 0",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,
  loading: {
    padding: "24px 0",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
