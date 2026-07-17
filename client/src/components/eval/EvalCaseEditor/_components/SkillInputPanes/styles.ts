import type { CSSProperties } from "react";

/** Co-located styles for `SkillInputPanes` (design/01-04, T-06). */
export const s = {
  mainTabsWrap: { marginBottom: 10 } satisfies CSSProperties,
  // Code sub-tabs (`New file` | `Modified file`, design/01,03) — a LOCAL row,
  // not the kit `Tabs`: `kit/Tabs.tsx:35` hardcodes a blue `var(--accent)`
  // active underline, while the design's sub-tabs use a white-ish one.
  subTabsRow: {
    display: "flex",
    gap: 20,
    marginBottom: 16,
  } satisfies CSSProperties,
  subTabButton: (active: boolean, readOnly: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "0 0 10px 0",
    border: "none",
    background: "transparent",
    borderBottom: "2px solid " + (active ? "var(--text-primary)" : "transparent"),
    cursor: readOnly ? "default" : "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  fieldLabel: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } satisfies CSSProperties,
  fieldGap: { marginBottom: 16 } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 100,
    resize: "vertical",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.6,
    outline: "none",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  // Read-only Code/PR-meta field (C1): the captured fixture renders as plain
  // monospace text, not an editable box — mirrors the agent branch's
  // `InputField` readOnly view (`EvalCaseEditor/styles.ts:readonlyView`).
  readonlyView: {
    width: "100%",
    minHeight: 100,
    maxHeight: 160,
    overflow: "auto",
    margin: 0,
    padding: "2px 0",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: "pre",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  readonlyEmpty: { color: "var(--text-muted)" } satisfies CSSProperties,
  // "Preview generated diff" disclosure (design/02,03) — collapsed by default,
  // a small right-pointing chevron that rotates 90° open, matching the
  // established `FileCard`/`chevronFor` pattern (client/INSIGHTS.md 2026-07-12).
  disclosureButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  disclosureChevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
  disclosureBody: { marginTop: 10 } satisfies CSSProperties,
  prMetaField: { marginBottom: 20 } satisfies CSSProperties,
} as const;
