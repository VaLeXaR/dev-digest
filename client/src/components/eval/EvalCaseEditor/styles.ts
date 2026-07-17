import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditor. */
export const s = {
  body: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    padding: 24,
  } satisfies CSSProperties,
  // minHeight:0 lets the right column's flex-fill boxes shrink below their
  // content (scroll internally) instead of blowing up the grid row height.
  col: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  // Display-only case-type badge (design/05): derived from expected_output —
  // NEGATIVE (warn/orange) when the case carries no `must_find` expectation,
  // POSITIVE (ok/green) once at least one `must_find` is present. Not editable.
  caseTypeBadge: (negative: boolean): CSSProperties => ({
    border: "1px solid " + (negative ? "var(--warn)" : "var(--ok)"),
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    background: negative ? "var(--warn-bg)" : "var(--ok-bg)",
  }),
  caseTypeLabel: (negative: boolean): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: negative ? "var(--warn)" : "var(--ok)",
  }),
  // Clamp to 2 lines with ellipsis: a long finding title + long file path must
  // NOT grow the badge unboundedly (that stretches the grid row and forces the
  // whole modal body to scroll). `wordBreak` lets an unbroken path wrap instead
  // of overflowing horizontally.
  caseTypeSub: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginTop: 2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  sectionHeaderRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  } satisfies CSSProperties,
  tabsWrap: { marginBottom: 10 } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 150,
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
  // Read-only Input view (design/05): the captured fixture renders as plain
  // monospace text, not an editable box — borderless, sits on the modal panel.
  readonlyView: {
    width: "100%",
    minHeight: 150,
    maxHeight: 200,
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
  // Read-only "Actual output" panel (design/05): the last run's produced
  // findings, JSON-formatted; "[]" before the case has ever run.
  // The right column's Expected + Actual boxes both flex-fill the column, whose
  // height is driven by the left column's Input box (grid stretch). Both grow
  // equally → Expected == Actual, and Actual (last child) reaches the same
  // bottom baseline as the Input box. minHeight:0 keeps long output scrolling
  // inside rather than expanding the modal.
  expectedTextarea: {
    flex: 1,
    minHeight: 0,
    // Hard cap mirrors the left column's diff (`diffContainer`/`readonlyView`
    // maxHeight:200): a grid row with `1fr` columns has an auto height, so a
    // `flex:1` child with no ceiling grows to its content and stretches the
    // whole modal (only the LEFT column was bounded before). Cap → scroll inside.
    maxHeight: 220,
  } satisfies CSSProperties,
  actualOutputBox: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    maxHeight: 220,
    overflow: "auto",
    marginTop: 8,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: "pre",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  // Syntax-highlighted read-only diff (design/05): per-line coloring — hunk
  // headers blue, added lines green band, removed red band, file headers muted.
  diffContainer: {
    width: "100%",
    minHeight: 150,
    maxHeight: 200,
    overflow: "auto",
    margin: 0,
    padding: "10px 0",
    fontSize: 13,
    lineHeight: 1.6,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "hunk" | "meta" | "ctx"): CSSProperties => ({
    padding: "0 14px",
    whiteSpace: "pre",
    color:
      kind === "add"
        ? "var(--ok)"
        : kind === "del"
          ? "var(--crit)"
          : kind === "hunk"
            ? "var(--accent-text)"
            : kind === "meta"
              ? "var(--text-muted)"
              : "var(--text-secondary)",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
  resultLine: (pass: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "11px 14px",
      borderRadius: 8,
      fontSize: 13,
      border: "1px solid " + (pass ? "var(--ok)" : "var(--crit)"),
      background: pass ? "var(--ok-bg)" : "var(--crit-bg)",
    }) satisfies CSSProperties,
  resultIcon: (pass: boolean): CSSProperties => ({ color: pass ? "var(--ok)" : "var(--crit)", flexShrink: 0 }),
  resultLabel: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  resultDetail: { color: "var(--text-secondary)" } satisfies CSSProperties,
  // Footer becomes a column: the full-width run banner (design/05) sits above
  // the toggle + action-button row.
  footerCol: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  footerToggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  footerButtons: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
