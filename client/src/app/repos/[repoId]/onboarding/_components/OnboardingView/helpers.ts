/* helpers.ts — pure helpers for OnboardingView: relative-time formatting for
   the header subtitle and the ON-THIS-PAGE scroll-spy's "nearest section to
   viewport top" computation. Kept pure/testable — no DOM reads here. */

import { githubBlobUrl } from "../../../../../../lib/github-urls";

/** Compact relative time for "last refreshed {time} ago" (e.g. "2h", "3d", "now"). */
export function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Given each section id's current top offset (px, relative to viewport —
 * caller supplies via getBoundingClientRect().top), pick the section
 * "nearest the viewport top": the last one whose top has scrolled past
 * `offset`, falling back to the first section when none has yet (page still
 * at the very top). Pure function so the scroll-spy logic is unit-testable
 * without mounting real layout in jsdom.
 */
export function computeActiveSection(
  tops: Array<{ id: string; top: number }>,
  offset = 96,
): string | null {
  if (tops.length === 0) return null;
  let active: string | null = null;
  for (const { id, top } of tops) {
    if (top - offset <= 0) active = id;
  }
  return active ?? tops[0]!.id;
}

/** Opens a repo file at the given path on GitHub in a new tab (R14/AC-17,
    R20/AC-25 Open action — critical-paths rows and first-tasks file chips
    both funnel through this one function). No-op when repo metadata isn't
    loaded yet. */
export function openGithubBlob(
  repoFullName: string | null | undefined,
  defaultBranch: string | null | undefined,
  path: string,
): void {
  if (!repoFullName || !defaultBranch) return;
  window.open(githubBlobUrl(repoFullName, defaultBranch, path), "_blank", "noopener,noreferrer");
}
