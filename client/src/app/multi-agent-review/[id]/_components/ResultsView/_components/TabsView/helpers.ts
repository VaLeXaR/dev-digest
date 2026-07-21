/** Score-tier color, matching `CircularScore`'s own threshold formula
    (`vendor/ui/primitives/CircularScore.tsx:14`) — duplicated locally because
    the ring component doesn't export its color function and the tab row's
    score badge needs the same tier color independently of the ring. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-muted)";
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}
