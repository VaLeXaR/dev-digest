import type { CSSProperties } from "react";
import { GRID } from "./constants";

/** Co-located styles for CiRunsView (design/06-ci-runs-page.png). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1400, margin: "0 auto" } satisfies CSSProperties,

  header: { display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, margin: 0 } satisfies CSSProperties,

  headerRight: { display: "flex", alignItems: "center", gap: 12, flexShrink: 0 } satisfies CSSProperties,
  autoRefresh: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  autoRefreshDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    background: "var(--ok)",
    boxShadow: "0 0 0 3px var(--ok-bg)",
  } satisfies CSSProperties,

  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  tableCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  headRow: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 14,
    padding: "10px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,

  row: {
    display: "grid",
    gridTemplateColumns: GRID,
    alignItems: "center",
    gap: 14,
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  timestamp: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  prCell: { minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  prNumber: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--accent-text)",
    textDecoration: "none",
    width: "fit-content",
  } satisfies CSSProperties,
  prTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,

  agentCell: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 } satisfies CSSProperties,
  agentName: {
    fontSize: 13,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,

  sourceBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  duration: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  findingsCell: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  findingPair: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,

  cost: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  traceLink: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,

  dash: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  loadingStack: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
} as const;
