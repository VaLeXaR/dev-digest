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
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,

  filePath: {
    flex: 1,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    direction: "rtl",
    textAlign: "left",
  } satisfies CSSProperties,

  diffBadge: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,

  findingsBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn)",
    background: "var(--warn-bg, #1c1200)",
    border: "1px solid var(--warn)",
    borderRadius: 4,
    padding: "1px 6px",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,

  banner: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 16px",
    borderRadius: 8,
    background: "var(--warn-bg, #1c1200)",
    border: "1px solid var(--warn, #f59e0b)",
    marginBottom: 8,
  } satisfies CSSProperties,

  bannerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--warn, #f59e0b)",
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
} as const;
