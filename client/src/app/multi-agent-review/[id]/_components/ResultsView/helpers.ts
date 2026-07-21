import type { CrossAgentGroup, MultiAgentRunAgent, Severity } from "@devdigest/shared";
import { formatSeconds, formatCost } from "@/lib/format";

export { formatCost };

/** `agent_runs.status` raw values (`trace.ts`: running | done | failed | cancelled)
    mapped to the four distinct live states AC-17 requires (Cancelled ≠ Failed). */
export type LiveAgentStatus = "running" | "finished" | "failed" | "cancelled";

export function mapAgentStatus(raw: string): LiveAgentStatus {
  if (raw === "running") return "running";
  if (raw === "failed") return "failed";
  if (raw === "cancelled") return "cancelled";
  return "finished"; // "done" (and any unexpected value) settles as finished
}

/** Nullable-safe wrapper over RunTraceDrawer's `formatSeconds` — a still-running
    or just-failed agent may have no persisted duration yet. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return formatSeconds(ms);
}

/** Summary cost = Σ per-agent (AC-10); null when no agent has a cost yet. */
export function totalCostUsd(agents: MultiAgentRunAgent[]): number | null {
  const known = agents.map((a) => a.costUsd).filter((c): c is number => c != null);
  if (known.length === 0) return null;
  return known.reduce((sum, c) => sum + c, 0);
}

/** Summary duration = MAX per-agent (AC-10, parallel fan-out — wall clock is the
    slowest agent, not the sum). */
export function maxDurationMs(agents: MultiAgentRunAgent[]): number | null {
  const known = agents.map((a) => a.durationMs).filter((d): d is number => d != null);
  if (known.length === 0) return null;
  return Math.max(...known);
}

export interface AgentFinding {
  groupKey: string;
  file: string;
  line: number;
  title: string;
  severity: Severity | null;
}

/**
 * `MultiAgentRunDetail` carries no separate per-agent findings array — `groups`
 * (built server-side from every agent's findings, overlapping or not) is the
 * ONLY source of finding data. Reconstruct one agent's Columns-mode finding
 * list by filtering the groups where that agent's verdict is `flagged`.
 */
export function findingsForAgent(groups: CrossAgentGroup[], agentId: string): AgentFinding[] {
  const out: AgentFinding[] = [];
  groups.forEach((g, i) => {
    const verdict = g.verdicts.find((v) => v.agentId === agentId);
    if (verdict?.state === "flagged") {
      out.push({
        groupKey: `${g.file}:${g.lineStart}:${i}`,
        file: g.file,
        line: g.lineStart,
        title: g.title,
        severity: verdict.severity ?? null,
      });
    }
  });
  return out;
}
