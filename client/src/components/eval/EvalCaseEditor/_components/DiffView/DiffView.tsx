import { s } from "./styles";

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

/** Classify one unified-diff line for coloring (order matters: headers before +/-). */
function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

/**
 * Read-only, per-line syntax-highlighted unified diff (design/05) — moved
 * VERBATIM out of `EvalCaseEditor.tsx` (T-06) so it can be shared between the
 * agent branch's Diff tab and the skill Code tab's "Preview generated diff"
 * disclosure (R3/R14). Same per-line coloring, same `aria-label`/
 * `aria-readonly` attributes, same `—` empty state.
 */
export function DiffView({ diff, ariaLabel }: { diff: string; ariaLabel: string }) {
  const lines = diff.length > 0 ? diff.split("\n") : [];
  return (
    <div className="mono" aria-label={ariaLabel} aria-readonly="true" style={s.diffContainer}>
      {lines.length === 0 ? (
        <div style={{ ...s.diffLine("ctx"), color: "var(--text-muted)" }}>—</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} style={s.diffLine(classifyDiffLine(line))}>
            {line === "" ? " " : line}
          </div>
        ))
      )}
    </div>
  );
}
