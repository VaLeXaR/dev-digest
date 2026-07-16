import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditor. */
export const s = {
  body: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    padding: 24,
  } satisfies CSSProperties,
  col: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
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
    minHeight: 320,
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
    minHeight: 320,
    maxHeight: 480,
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
  // Syntax-highlighted read-only diff (design/05): per-line coloring — hunk
  // headers blue, added lines green band, removed red band, file headers muted.
  diffContainer: {
    width: "100%",
    minHeight: 320,
    maxHeight: 480,
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
      marginTop: 12,
      padding: "11px 14px",
      borderRadius: 8,
      fontSize: 13,
      border: "1px solid " + (pass ? "var(--ok)" : "var(--crit)"),
      background: pass ? "var(--ok-bg)" : "var(--crit-bg)",
    }) satisfies CSSProperties,
  resultIcon: (pass: boolean): CSSProperties => ({ color: pass ? "var(--ok)" : "var(--crit)", flexShrink: 0 }),
  resultLabel: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  resultDetail: { color: "var(--text-secondary)" } satisfies CSSProperties,
  // Neutral "run in progress" line — shown while a run executes (design/05).
  runningLine: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginTop: 12,
    padding: "11px 14px",
    borderRadius: 8,
    fontSize: 13,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  runningIcon: { color: "var(--text-secondary)", flexShrink: 0, animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
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
