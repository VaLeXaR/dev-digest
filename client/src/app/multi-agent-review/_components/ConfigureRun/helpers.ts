import { formatSeconds } from "@/components/RunTraceDrawer/helpers";

/**
 * "8.2s" for a duration estimate, "—" when null — an absolute cold start (no
 * repo/workspace token-rate derivable yet) returns null cost/duration from the
 * server; never render a fabricated number (R5/AC-11).
 */
export function formatDurationOrDash(ms: number | null | undefined): string {
  return ms == null ? "—" : formatSeconds(ms);
}
