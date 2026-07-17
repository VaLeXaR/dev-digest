import type { CSSProperties } from "react";

/**
 * Co-located styles for `DiffView` — moved VERBATIM out of
 * `EvalCaseEditor/styles.ts` (`diffContainer`/`diffLine`, T-06) so the
 * agent-branch diff view and the skill Code tab's "Preview generated diff"
 * disclosure share one implementation. Do not redesign; T-07 deletes the
 * originals in `EvalCaseEditor/styles.ts` and switches to this import.
 */
export const s = {
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
} as const;
