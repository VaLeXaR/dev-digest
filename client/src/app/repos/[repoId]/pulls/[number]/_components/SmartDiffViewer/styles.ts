import type { CSSProperties } from "react";

export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    userSelect: "none",
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
    marginBottom: 4,
  } satisfies CSSProperties,

  roleDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  } satisfies CSSProperties,

  roleLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,

  roleSubtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginLeft: "auto",
    fontStyle: "italic",
  } satisfies CSSProperties,

  fileBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "1px 6px",
    marginLeft: 4,
  } satisfies CSSProperties,

  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  fileCard: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    fontSize: 13,
    overflow: "hidden",
  } satisfies CSSProperties,

  // File-level fallback marker for click-to-line navigation: an inset ring
  // (not `border`/`borderColor`, to avoid fighting the shorthand `border`
  // above) plus the same one-shot flash as the line highlight. Shown even
  // when the exact target line can't be located in the rendered diff hunks.
  fileCardTarget: {
    boxShadow: "inset 0 0 0 1px var(--accent)",
    animation: "ddLineTargetFlash 2.4s ease-out",
  } satisfies CSSProperties,

  fileCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    cursor: "pointer",
    userSelect: "none",
  } satisfies CSSProperties,

  filePath: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    direction: "rtl",
    textAlign: "left",
  } satisfies CSSProperties,

  findingDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,

  fileCardHeaderRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,

  diffBadge: {
    fontSize: 11.5,
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,

  diffBadgeAdd: {
    color: "var(--code-add-text)",
  } satisfies CSSProperties,

  diffBadgeDel: {
    color: "var(--code-del-text)",
  } satisfies CSSProperties,

  findingsBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 4,
    padding: "1px 6px",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,

  // Pill matching the design's "summary" badge exactly (icon + accent-filled
  // pill, design/02-files-changed-smart-diff.png). User-confirmed: the
  // "generate summary" (not-yet-generated) state uses this SAME styling —
  // no separate muted variant.
  summaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    border: "none",
    borderRadius: 5,
    padding: "2px 7px",
    cursor: "pointer",
    flexShrink: 0,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,

  summaryText: {
    display: "flex",
    gap: 7,
    fontSize: 12,
    color: "var(--text-secondary)",
    padding: "8px 12px 8px 33px",
    borderTop: "1px solid var(--border)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  summaryIcon: {
    color: "var(--accent)",
    flexShrink: 0,
    marginTop: 2,
  } satisfies CSSProperties,

  summaryLabel: {
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,

  banner: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 16px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    marginBottom: 8,
  } satisfies CSSProperties,

  bannerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--warn)",
  } satisfies CSSProperties,

  bannerBody: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  bannerList: {
    margin: "4px 0 0 0",
    paddingLeft: 20,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  skeletonRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,

  chevron: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginLeft: 4,
  } satisfies CSSProperties,

  statsLine: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 8,
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,

  statsAdd: {
    color: "var(--ok)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,

  statsDel: {
    color: "var(--crit)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,

  diffBlock: {
    overflowX: "auto",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: "18px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,

  diffLine: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 8px",
    minHeight: 18,
    borderLeft: "3px solid transparent",
  } satisfies CSSProperties,

  diffLineAdd: {
    background: "rgba(0,180,0,0.06)",
  } satisfies CSSProperties,

  diffLineDel: {
    background: "rgba(220,0,0,0.06)",
  } satisfies CSSProperties,

  // Line jumped to from a click-to-line navigation (e.g. a Blast Radius
  // caller). Flashes once on mount/re-trigger, then settles to a plain
  // accent border so the target stays visibly marked after the flash fades.
  diffLineTarget: {
    animation: "ddLineTargetFlash 2.4s ease-out",
  } satisfies CSSProperties,

  lineNo: {
    minWidth: 32,
    color: "var(--text-muted)",
    textAlign: "right",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,

  lineSign: {
    minWidth: 12,
    textAlign: "center",
    flexShrink: 0,
    userSelect: "none",
  } satisfies CSSProperties,

  lineSignAdd: {
    color: "var(--ok)",
  } satisfies CSSProperties,

  lineSignDel: {
    color: "var(--crit)",
  } satisfies CSSProperties,

  lineContent: {
    flex: 1,
    whiteSpace: "pre",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  severityBadge: {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "sans-serif",
    padding: "1px 5px",
    borderRadius: 3,
    flexShrink: 0,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
  } satisfies CSSProperties,

  viewerRoot: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  // Fallback block showing a fetched window of raw file lines around a
  // click-to-line target that fell outside every rendered diff hunk.
  contextBlock: {
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,

  contextLabel: {
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-muted)",
    padding: "6px 10px 0",
  } satisfies CSSProperties,
} as const;
