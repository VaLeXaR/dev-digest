/* CompareRunsModal — client-assembled compare view for two eval batches
   (T-13, design/02). No new server "compare" endpoint (per plan Architecture
   notes) — reads each version's system prompt via the existing
   GET /agents/:id/versions/:version and diffs them client-side. */
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon, Modal } from "@devdigest/ui";
import type { AgentVersion, EvalRunBatchRecord } from "@devdigest/shared";
import { api } from "../../../../../lib/api";
import { usePromoteAgentVersion } from "../../../../../lib/hooks/eval";
import { METRIC_COLORS, formatMetricPct } from "../../../_components/EvalDashboardView/constants";
import { formatCost, formatCostDelta, formatDeltaPt } from "../AgentEvalDetail/constants";
import { diffLines } from "./constants";
import { s } from "./styles";

function useAgentVersion(agentId: string, version: number) {
  return useQuery({
    queryKey: ["agent-version", agentId, version],
    queryFn: () => api.get<AgentVersion>(`/agents/${agentId}/versions/${version}`),
  });
}

function safeDelta(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : b - a;
}

export function CompareRunsModal({
  agentId,
  older,
  newer,
  onClose,
}: {
  agentId: string;
  older: EvalRunBatchRecord;
  newer: EvalRunBatchRecord;
  onClose: () => void;
}) {
  const oldVersionQuery = useAgentVersion(agentId, older.agent_version);
  const newVersionQuery = useAgentVersion(agentId, newer.agent_version);
  const promote = usePromoteAgentVersion(agentId);

  const versionsReady = !!oldVersionQuery.data && !!newVersionQuery.data;
  const oldPrompt = oldVersionQuery.data?.config.system_prompt ?? "";
  const newPrompt = newVersionQuery.data?.config.system_prompt ?? "";
  const diff = React.useMemo(
    () => (versionsReady ? diffLines(oldPrompt, newPrompt) : []),
    [versionsReady, oldPrompt, newPrompt],
  );

  function handlePromote() {
    promote.mutate(newer.agent_version, { onSuccess: onClose });
  }

  const footer = (
    <div style={s.footer}>
      <Button kind="ghost" onClick={onClose}>
        Close
      </Button>
      <Button kind="primary" icon="GitBranch" loading={promote.isPending} onClick={handlePromote}>
        {`Promote v${newer.agent_version}`}
      </Button>
    </div>
  );

  return (
    <Modal
      width={860}
      title={`Compare runs · v${older.agent_version} → v${newer.agent_version}`}
      subtitle="Old prompt vs new — metric deltas and prompt diff on the gold set"
      onClose={onClose}
      footer={footer}
    >
      <div style={s.body}>
        <div style={s.tiles}>
          <DeltaTile
            label="RECALL"
            oldText={formatMetricPct(older.recall)}
            newText={formatMetricPct(newer.recall)}
            newColor={METRIC_COLORS.recall}
            delta={formatDeltaPt(safeDelta(older.recall, newer.recall))}
          />
          <DeltaTile
            label="PRECISION"
            oldText={formatMetricPct(older.precision)}
            newText={formatMetricPct(newer.precision)}
            newColor={METRIC_COLORS.precision}
            delta={formatDeltaPt(safeDelta(older.precision, newer.precision))}
          />
          <DeltaTile
            label="CITATION"
            oldText={formatMetricPct(older.citation_accuracy)}
            newText={formatMetricPct(newer.citation_accuracy)}
            newColor={METRIC_COLORS.citation}
            delta={formatDeltaPt(safeDelta(older.citation_accuracy, newer.citation_accuracy))}
          />
          <DeltaTile
            label="COST"
            oldText={formatCost(older.cost_usd)}
            newText={formatCost(newer.cost_usd)}
            newColor="var(--text-primary)"
            delta={formatCostDelta(older.cost_usd, newer.cost_usd)}
          />
        </div>

        <div style={s.diffSection}>
          <div style={s.diffHeader}>
            <Icon.FileText size={13} style={{ color: "var(--text-muted)" }} />
            <span style={s.diffLabel}>SYSTEM PROMPT DIFF</span>
          </div>
          <div style={s.diffLegend}>
            <span style={s.legendItem}>
              <span style={{ ...s.legendSwatch, background: "var(--crit)" }} />
              {`v${older.agent_version} (old)`}
            </span>
            <span style={s.legendItem}>
              <span style={{ ...s.legendSwatch, background: "var(--ok)" }} />
              {`v${newer.agent_version} (new)`}
            </span>
          </div>
          <div style={s.diffBox}>
            {!versionsReady && <p style={s.diffLoading}>Loading prompts…</p>}
            {versionsReady &&
              diff.map((line, i) => (
                <div
                  key={i}
                  style={
                    line.type === "added"
                      ? s.diffLineAdded
                      : line.type === "removed"
                        ? s.diffLineRemoved
                        : s.diffLineUnchanged
                  }
                >
                  {line.text || " "}
                </div>
              ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DeltaTile({
  label,
  oldText,
  newText,
  newColor,
  delta,
}: {
  label: string;
  oldText: string;
  newText: string;
  newColor: string;
  delta: { text: string; color: string };
}) {
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>{label}</span>
      <div style={s.tileValueRow}>
        <span className="tnum" style={s.tileOld}>
          {oldText}
        </span>
        <Icon.ArrowRight size={13} style={s.tileArrow} />
        <span className="tnum" style={{ ...s.tileNew, color: newColor }}>
          {newText}
        </span>
      </div>
      <span className="tnum" style={{ ...s.tileDelta, color: delta.color }}>
        {delta.text}
      </span>
    </div>
  );
}
