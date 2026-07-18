import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView (design/04-eval-dashboard.png). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,

  header: { display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 24 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, margin: 0 } satisfies CSSProperties,

  section: { marginTop: 28 } satisfies CSSProperties,

  agentList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,

  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    textDecoration: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  agentIconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,

  agentIdentity: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  agentNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 } satisfies CSSProperties,
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  modelBadge: {
    fontSize: 11,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "1px 6px",
  } satisfies CSSProperties,
  agentMeta: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,

  sparklineCol: { flexShrink: 0, width: 80 } satisfies CSSProperties,

  metricCol: { flexShrink: 0, width: 58, textAlign: "right" } satisfies CSSProperties,
  metricLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 2,
  } satisfies CSSProperties,
  metricValue: (color: string): CSSProperties => ({
    fontSize: 15,
    fontWeight: 700,
    color,
  }),

  chevron: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,

  table: { display: "flex", flexDirection: "column", gap: 0 } satisfies CSSProperties,

  runRow: {
    display: "grid",
    gridTemplateColumns: "180px 150px 44px 1fr 1fr 1fr 64px",
    alignItems: "center",
    gap: 14,
    padding: "11px 4px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  runRowHeader: {
    display: "grid",
    gridTemplateColumns: "180px 150px 44px 1fr 1fr 1fr 64px",
    gap: 14,
    padding: "0 4px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,

  runAgentName: {
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  runTimestamp: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  runVersion: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  runPass: { fontSize: 13.5, fontWeight: 700, textAlign: "right" } satisfies CSSProperties,

  barCell: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-hover)",
    overflow: "hidden",
  } satisfies CSSProperties,
  barFill: (width: number, color: string): CSSProperties => ({
    width: `${width}%`,
    height: "100%",
    background: color,
    borderRadius: 3,
  }),
  barValue: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    width: 34,
    textAlign: "right",
    flexShrink: 0,
  } satisfies CSSProperties,

  emptyRuns: { fontSize: 13.5, color: "var(--text-secondary)", padding: "16px 4px" } satisfies CSSProperties,
} as const;
