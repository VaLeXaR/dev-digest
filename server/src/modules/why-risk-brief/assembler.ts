import { posix } from 'node:path';
import { wrapUntrusted, INJECTION_GUARD } from '@devdigest/reviewer-core';
import type { DiscoveredDoc, DownstreamImpact, SmartDiffGroup } from '@devdigest/shared';

// ---------- Pure helpers ------------------------------------------------------

/** Cap the linked-issue body so a huge author body can't blow the token budget (matches intent, service.ts:159). */
const MAX_ISSUE_BODY_CHARS = 8000;

export interface NormalizedDiffFile {
  path: string;
  additions: number;
  deletions: number;
  role?: string;
}

export interface WhyRiskBriefInputArgs {
  prTitle: string;
  prBody: string | null;
  intent: { intent: string; in_scope: string[]; out_of_scope: string[] } | null;
  blastSummary: string | null;
  downstream: DownstreamImpact[];
  diffStats: NormalizedDiffFile[];
  issue: { title: string; body: string | null } | null;
  specs: { path: string; content: string }[];
}

/**
 * Builds the full input text for the Why+Risk Brief generation call, from
 * ALREADY-FETCHED derived facts only — never raw diff/patch bodies (AC-4).
 *
 * Every externally-authored block (PR title/body, linked-issue body, spec
 * contents) is wrapped in wrapUntrusted() and INJECTION_GUARD is prepended
 * (AC-13) — derived facts computed by our own server logic (intent, blast
 * summary, downstream, diff statistics) are NOT externally authored and are
 * left unwrapped, matching buildIntentInput's precedent.
 *
 * Multi-line strings are built as arrays joined with '\n' to avoid the
 * Edit-tool ASCII-quote -> curly-quote corruption described in INSIGHTS.md.
 */
export function buildWhyRiskBriefInput(args: WhyRiskBriefInputArgs): string {
  const parts: string[] = [];

  // Injection guard — prepended once, ahead of every section.
  parts.push(INJECTION_GUARD);

  // PR title/body — externally authored, always wrapped.
  const prLines: string[] = [['Title:', args.prTitle].join(' ')];
  if (args.prBody) {
    prLines.push(['Body:', args.prBody].join(' '));
  }
  parts.push(['', 'PR:', wrapUntrusted('pr', prLines.join('\n'))].join('\n'));

  // Intent — derived fact, omit section entirely when absent.
  if (args.intent) {
    const inScopeLines = args.intent.in_scope.map((s) => '- ' + s).join('\n');
    const outOfScopeLines = args.intent.out_of_scope.map((s) => '- ' + s).join('\n');
    const intentLines: string[] = ['', 'Intent:', args.intent.intent, '', 'In scope:', inScopeLines, '', 'Out of scope:', outOfScopeLines];
    parts.push(intentLines.join('\n'));
  }

  // Blast summary + grouped downstream — symbol/caller/endpoint names only,
  // no line numbers or file paths for callers.
  if (args.blastSummary || args.downstream.length > 0) {
    const blastLines: string[] = ['', 'Blast Radius:'];
    if (args.blastSummary) {
      blastLines.push(args.blastSummary);
    }
    for (const d of args.downstream) {
      const callerNames = d.callers.map((c) => c.name).join(', ') || 'none';
      const endpointNames = d.endpoints_affected.join(', ') || 'none';
      const cronNames = d.crons_affected.join(', ') || 'none';
      blastLines.push(
        [
          '- Symbol:', d.symbol,
          '| Callers:', callerNames,
          '| Endpoints:', endpointNames,
          '| Crons:', cronNames,
        ].join(' '),
      );
    }
    parts.push(blastLines.join('\n'));
  }

  // Normalized diff statistics — additions/deletions/role only, never patch bodies.
  if (args.diffStats.length > 0) {
    const statLines: string[] = ['', 'Diff Statistics:'];
    for (const f of args.diffStats) {
      const roleSuffix = f.role ? [' (', f.role, ')'].join('') : '';
      statLines.push(['-', f.path + roleSuffix + ':', '+' + String(f.additions), '/', '-' + String(f.deletions)].join(' '));
    }
    parts.push(statLines.join('\n'));
  }

  // Linked issue — externally authored, capped + wrapped.
  if (args.issue) {
    const issueLines: string[] = [args.issue.title];
    if (args.issue.body) {
      issueLines.push(args.issue.body.slice(0, MAX_ISSUE_BODY_CHARS));
    }
    parts.push(['', 'Linked Issue:', wrapUntrusted('issue', issueLines.join('\n'))].join('\n'));
  }

  // Context-Folder specs — externally authored, each wrapped independently.
  if (args.specs.length > 0) {
    const specBlocks: string[] = ['', 'Context-Folder Specs:'];
    for (const spec of args.specs) {
      specBlocks.push(['', ['File:', spec.path].join(' '), wrapUntrusted('spec:' + spec.path, spec.content)].join('\n'));
    }
    parts.push(specBlocks.join('\n'));
  }

  return parts.join('\n');
}

// ---------- selectOverlappingSpecs -------------------------------------------

/** Normalizes a possibly-Windows-separated, possibly-relative path to a clean POSIX form. */
function toPosix(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/'));
}

/** Directory segments of a path, excluding the filename itself. */
function dirSegments(path: string): string[] {
  const segments = toPosix(path).split('/').filter((s) => s.length > 0 && s !== '.');
  segments.pop();
  return segments;
}

/**
 * True when `a` and `b` share a directory prefix — compared segment by
 * segment, never as a raw string prefix (a naive path.startsWith(prefix) on
 * un-resolved paths is bypassable, e.g. "src/foo-evil" matching prefix
 * "src/foo" — INSIGHTS.md 2026-07-09).
 */
function sharesDirectoryPrefix(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Selects discovered Context-Folder docs that share a directory prefix with
 * at least one changed file, accumulating token_estimate until tokenBudget
 * would be exceeded. Returns [] when no discovered doc overlaps (AC-14).
 */
export function selectOverlappingSpecs(
  docs: DiscoveredDoc[],
  changedFiles: string[],
  tokenBudget: number,
): DiscoveredDoc[] {
  const changedDirs = changedFiles.map(dirSegments);

  const selected: DiscoveredDoc[] = [];
  let used = 0;

  for (const doc of docs) {
    const docDirs = dirSegments(doc.path);
    const overlaps = changedDirs.some((cd) => sharesDirectoryPrefix(docDirs, cd));
    if (!overlaps) continue;

    if (used + doc.token_estimate > tokenBudget) break;

    selected.push(doc);
    used += doc.token_estimate;
  }

  return selected;
}

// ---------- normalizeDiffStats -----------------------------------------------

/**
 * Normalizes per-file diff statistics: prefers SmartDiffGroup[] when present
 * (carries a per-group role), else falls back to raw per-file
 * additions/deletions (AC-15, when Smart Diff has not been generated).
 */
export function normalizeDiffStats(args: {
  smartDiffGroups?: SmartDiffGroup[];
  rawFiles: { path: string; additions: number; deletions: number }[];
}): NormalizedDiffFile[] {
  if (args.smartDiffGroups && args.smartDiffGroups.length > 0) {
    const result: NormalizedDiffFile[] = [];
    for (const group of args.smartDiffGroups) {
      for (const file of group.files) {
        result.push({
          path: file.path,
          additions: file.additions,
          deletions: file.deletions,
          role: group.role,
        });
      }
    }
    return result;
  }

  return args.rawFiles.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

// ---------- Token instrument --------------------------------------------------

/** Rough token estimate: 1 token ~= 4 characters (same formula as intent/extractor.ts's estimateTokens). */
export function estimateBriefTokens(input: string): number {
  return Math.ceil(input.length / 4);
}

/**
 * Estimates the token cost of the FULL raw diff (all patch bodies
 * concatenated) — used only as the denominator for the token-savings
 * instrument (R19/SC4); never fed into the actual generation input.
 */
export function estimateFullDiffTokens(files: { patch: string | null }[]): number {
  return estimateBriefTokens(files.map((f) => f.patch ?? '').join('\n'));
}
