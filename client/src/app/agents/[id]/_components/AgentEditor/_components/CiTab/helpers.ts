import type { CiRun } from "@devdigest/shared";

/** "4m ago" / "1h ago" / "2d ago" — matches design/01's relative-time column
    (distinct from `pulls/helpers.ts:relativeTime`, which omits the "ago" suffix). */
export function relativeTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Client-side join (AC-21): the CI tab has no per-installation "latest run"
    endpoint, so the latest `CiRun` per `ci_installation_id` is derived here from
    the already-fetched `useCiRuns()` list, picked by max `ran_at`. */
export function latestRunByInstallation(runs: CiRun[] | undefined): Map<string, CiRun> {
  const map = new Map<string, CiRun>();
  for (const run of runs ?? []) {
    if (!run.ci_installation_id) continue;
    const existing = map.get(run.ci_installation_id);
    const runTime = run.ran_at ? Date.parse(run.ran_at) : 0;
    const existingTime = existing?.ran_at ? Date.parse(existing.ran_at) : -1;
    if (!existing || runTime > existingTime) map.set(run.ci_installation_id, run);
  }
  return map;
}
