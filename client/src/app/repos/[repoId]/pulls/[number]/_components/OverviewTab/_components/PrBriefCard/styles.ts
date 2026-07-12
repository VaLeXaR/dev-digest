import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,

  // ---- Header: risk_level chip (left) + what/why ----
  headerContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  } satisfies CSSProperties,

  whatWhy: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,

  what: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,

  why: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,

  // Severity chip pattern copied from IntentCard (RISK_ICON/RISK_STYLE,
  // IntentCard.tsx:17-27) — deliberately NOT imported, to avoid coupling
  // this card to IntentCard's module (AC-17).
  riskLevelChipHigh: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
    border: "1px solid var(--crit, #ef4444)",
    background: "var(--crit-bg, #1c0a0a)",
    color: "var(--crit, #ef4444)",
  } satisfies CSSProperties,

  riskLevelChipMedium: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
    border: "1px solid var(--warn, #f59e0b)",
    background: "var(--warn-bg, #1c1200)",
    color: "var(--warn, #f59e0b)",
  } satisfies CSSProperties,

  riskLevelChipLow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  // ---- risks[] (own list, independent of IntentCard's RISK AREAS — AC-17) ----
  riskSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  riskSectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  riskRowHigh: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--crit, #ef4444)",
    background: "var(--crit-bg, #1c0a0a)",
  } satisfies CSSProperties,

  riskRowMedium: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn, #f59e0b)",
    background: "var(--warn-bg, #1c1200)",
  } satisfies CSSProperties,

  riskRowLow: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  riskRowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  riskTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  riskFileRefs: {
    display: "inline-flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 2,
    fontSize: 12,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,

  // Individual clickable file_ref (in-diff button / GitHub link) — same
  // decision logic as reviewFocusRow, but no line number and no full-row
  // click target since multiple refs can share one risk row (R11/AC-11).
  riskFileRefLink: {
    color: "var(--accent-text)",
    fontWeight: 500,
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,

  riskUnlinked: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic" as const,
    flexShrink: 0,
  } satisfies CSSProperties,

  riskChevronBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    padding: 2,
    cursor: "pointer",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  riskExplanation: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: 0,
    paddingLeft: 21,
  } satisfies CSSProperties,

  // ---- review_focus[] sub-section (innermost, matches mockup's bottom
  // "REVIEW FOCUS — READ THESE FIRST" position) ----
  reviewFocusSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  reviewFocusLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    padding: "1px 6px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,

  reviewFocusList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,

  reviewFocusRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    width: "100%",
    padding: "4px 2px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    fontSize: 13,
    borderRadius: 4,
    textDecoration: "none",
  } satisfies CSSProperties,

  reviewFocusGlyph: {
    color: "var(--text-muted)",
    flexShrink: 0,
    marginTop: 2,
  } satisfies CSSProperties,

  reviewFocusPath: {
    color: "var(--accent-text)",
    fontWeight: 500,
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  reviewFocusDash: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  reviewFocusReason: {
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
