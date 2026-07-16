/** Constants + client-side prompt diff for CompareRunsModal (T-13, design/02). */

export interface PromptDiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

/**
 * Simple LCS-based line diff (client-side, per T-13's "no new server compare
 * endpoint" constraint) — good enough for two system-prompt strings. Returns
 * an ordered list of unchanged/added/removed lines so the UI can highlight
 * added lines green (design/02) and, for completeness, removed lines too.
 */
export function diffLines(oldText: string, newText: string): PromptDiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const ai = a[i] ?? "";
      const bj = b[j] ?? "";
      const diag = dp[i + 1]?.[j + 1] ?? 0;
      const down = dp[i + 1]?.[j] ?? 0;
      const right = dp[i]?.[j + 1] ?? 0;
      const row = dp[i];
      if (row) row[j] = ai === bj ? diag + 1 : Math.max(down, right);
    }
  }

  const result: PromptDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const ai = a[i] ?? "";
    const bj = b[j] ?? "";
    if (ai === bj) {
      result.push({ type: "unchanged", text: ai });
      i++;
      j++;
    } else {
      const down = dp[i + 1]?.[j] ?? 0;
      const right = dp[i]?.[j + 1] ?? 0;
      if (down >= right) {
        result.push({ type: "removed", text: ai });
        i++;
      } else {
        result.push({ type: "added", text: bj });
        j++;
      }
    }
  }
  while (i < n) {
    result.push({ type: "removed", text: a[i] ?? "" });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", text: b[j] ?? "" });
    j++;
  }
  return result;
}
