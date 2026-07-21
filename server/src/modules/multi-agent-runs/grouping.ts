import type { CrossAgentGroup, CrossAgentVerdict, Severity } from '@devdigest/shared';

/**
 * Cross-agent "where agents disagree" grouping (pure, R6/AC-12..16). Groups
 * findings from different agents that land on the same file, an overlapping
 * line range, AND a similar essence (see `titlesSimilar`), and emits a binary
 * flagged/did-not-flag verdict per agent that ACTUALLY ran (E1) — never a
 * reason for "did not flag" (E9, bare state only).
 *
 * NOTE: the essence-similarity clause OVERRIDES spec non-goal N3 (which had
 * scoped grouping to file + line-overlap only). Product decision 2026-07-20:
 * two unrelated findings that merely share an overlapping range (e.g. one flags
 * "SSRF", another "missing rate limit" at the same block) must NOT collapse into
 * one group under a single title — they now split. Same-issue findings phrased
 * differently by different agents still merge as long as they share enough
 * meaningful tokens.
 */

export interface CrossAgentFindingInput {
  agentId: string;
  findingId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
}

/**
 * Inclusive-range line overlap. Duplicated locally on purpose — NOT imported
 * from reviewer-core: `overlaps()` in reviewer-core/src/eval/score.ts is a
 * private, eval-shaped module helper (reviewer-core/INSIGHTS.md:23), and this
 * module's grouping semantics are a different concern than eval scoring's
 * expectation matching.
 */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

/** Very common English words that carry no signal about a finding's essence. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are',
  'was', 'be', 'this', 'that', 'it', 'its', 'with', 'via', 'into', 'from', 'at',
  'as', 'by', 'not', 'no', 'will', 'can', 'may', 'under', 'over', 'new',
]);

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/**
 * Essence-similarity threshold, expressed as an overlap coefficient
 * (|A ∩ B| / min(|A|, |B|)) over normalized title token sets. The overlap
 * coefficient (not Jaccard) is deliberate: different agents describe the same
 * issue at very different verbosity ("SSRF" vs "Unvalidated webhook URL allows
 * SSRF to internal network"), and Jaccard over-penalizes the length gap. Tuned
 * leniently — the goal is to SPLIT clearly-unrelated findings that merely
 * overlap in lines, not to hair-split near-synonyms. Exported alongside
 * `titlesSimilar` so both stay unit-testable and tunable.
 */
export const SIMILARITY_THRESHOLD = 0.34;

export function titlesSimilar(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  // No usable signal on either side → fall back to line-overlap-only behavior
  // (an empty/opaque title carries no evidence that the two issues differ).
  if (ta.size === 0 || tb.size === 0) return true;
  let intersection = 0;
  for (const w of ta) if (tb.has(w)) intersection += 1;
  const denom = Math.min(ta.size, tb.size);
  return intersection / denom >= SIMILARITY_THRESHOLD;
}

/**
 * `ranAgentIds` is the full set of agents that participated in this run
 * (regardless of whether they produced any findings) — a group's verdict
 * array always has exactly one entry per ran agent (AC-14), so an agent with
 * zero findings anywhere still reads `did_not_flag` in every group (E1).
 */
export function groupCrossAgent(
  findings: CrossAgentFindingInput[],
  ranAgentIds: string[],
): CrossAgentGroup[] {
  const byFile = new Map<string, CrossAgentFindingInput[]>();
  for (const finding of findings) {
    const arr = byFile.get(finding.file) ?? [];
    arr.push(finding);
    byFile.set(finding.file, arr);
  }

  const groups: CrossAgentGroup[] = [];
  for (const [file, fileFindings] of byFile) {
    // Cluster this file's findings by connected components of the relation
    // "overlapping line range AND similar essence" (union-find / single
    // linkage). Union-find — not the previous greedy left-to-right interval
    // merge — because similarity is not a range property: two findings can
    // overlap yet belong to different clusters, so a clean interval sweep can
    // no longer decide membership from line ordering alone.
    const parent = fileFindings.map((_, i) => i);
    const find = (i: number): number => {
      let root = i;
      while (parent[root] !== root) root = parent[root]!;
      while (parent[i] !== root) {
        const next = parent[i]!;
        parent[i] = root;
        i = next;
      }
      return root;
    };
    const union = (i: number, j: number): void => {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
    };

    for (let i = 0; i < fileFindings.length; i += 1) {
      for (let j = i + 1; j < fileFindings.length; j += 1) {
        const a = fileFindings[i]!;
        const b = fileFindings[j]!;
        if (
          rangesOverlap(a.startLine, a.endLine, b.startLine, b.endLine) &&
          titlesSimilar(a.title, b.title)
        ) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, CrossAgentFindingInput[]>();
    fileFindings.forEach((finding, i) => {
      const root = find(i);
      const arr = clusters.get(root) ?? [];
      arr.push(finding);
      clusters.set(root, arr);
    });

    for (const members of clusters.values()) {
      // Deterministic representative: earliest start line, then findingId.
      const ordered = [...members].sort(
        (a, b) => a.startLine - b.startLine || a.findingId.localeCompare(b.findingId),
      );
      const lineStart = Math.min(...members.map((m) => m.startLine));
      const lineEnd = Math.max(...members.map((m) => m.endLine));
      const title = ordered[0]!.title;

      const byAgent = new Map<string, CrossAgentFindingInput>();
      for (const member of ordered) {
        if (!byAgent.has(member.agentId)) byAgent.set(member.agentId, member);
      }

      const verdicts: CrossAgentVerdict[] = ranAgentIds.map((agentId) => {
        const finding = byAgent.get(agentId);
        return finding
          ? {
              agentId,
              state: 'flagged' as const,
              severity: finding.severity,
              findingId: finding.findingId,
            }
          : { agentId, state: 'did_not_flag' as const, severity: null, findingId: null };
      });

      const isConflict =
        verdicts.some((v) => v.state === 'flagged') &&
        verdicts.some((v) => v.state === 'did_not_flag');

      groups.push({ file, lineStart, lineEnd, title, verdicts, isConflict });
    }
  }

  // Stable, location-ordered output (file → line → title) so the UI list and
  // tests don't depend on Map insertion / union-find root ordering.
  groups.sort(
    (a, b) => a.file.localeCompare(b.file) || a.lineStart - b.lineStart || a.title.localeCompare(b.title),
  );
  return groups;
}
