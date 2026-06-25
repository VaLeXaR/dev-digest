import type React from "react";

export const s = {
  empty: { fontSize: 13, color: "var(--text-muted)" } as React.CSSProperties,

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 24,
  } as React.CSSProperties,

  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as React.CSSProperties,

  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } as React.CSSProperties,

  cardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--text-primary)",
    lineHeight: 1,
  } as React.CSSProperties,

  cardSub: {
    fontSize: 12,
    color: "var(--text-muted)",
  } as React.CSSProperties,

  rateCard: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 20px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as React.CSSProperties,

  rateInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
  } as React.CSSProperties,

  section: { marginBottom: 24 } as React.CSSProperties,

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } as React.CSSProperties,

  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
  } as React.CSSProperties,

  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,

  agentRowLast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 16px",
    background: "var(--bg-surface)",
  } as React.CSSProperties,

  agentName: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
  } as React.CSSProperties,

  openBtn: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "3px 10px",
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,

  noAgents: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    textAlign: "center" as const,
  } as React.CSSProperties,
};
