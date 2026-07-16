/* AgentEvalDetail — per-agent Eval Dashboard drill-down (T-13, design/06).
   Non-repo-scoped, mirrors T-12's EvalDashboardView conventions. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Icon,
  LineChart,
  Select,
  SectionLabel,
  Skeleton,
  Sparkline,
} from "@devdigest/ui";
import type { EvalRunBatchRecord } from "@devdigest/shared";
import { AppShell } from "../../../../../components/app-shell";
import { useAgent } from "../../../../../lib/hooks/agents";
import {
  useAgentEvalDashboard,
  useEvalBatches,
  useEvalDashboard,
  useRunEvalSet,
} from "../../../../../lib/hooks/eval";
import { METRIC_COLORS, formatMetricPct, formatRunTimestamp, metricBarWidth } from "../../../_components/EvalDashboardView/constants";
import { CompareRunsModal } from "../CompareRunsModal/CompareRunsModal";
import { DATE_RANGE_OPTIONS, type DateRangeValue, filterByDateRange, formatCost, formatDeltaPt, splitAlert } from "./constants";
import { s } from "./styles";

export function AgentEvalDetail({ agentId }: { agentId: string }) {
  const router = useRouter();
  const { data: agent } = useAgent(agentId);
  const { data: dashboard, isLoading, isError, refetch } = useAgentEvalDashboard(agentId);
  const { data: batches } = useEvalBatches(agentId);
  const { data: overview } = useEvalDashboard();
  const runSet = useRunEvalSet(agentId);

  const [dateRange, setDateRange] = React.useState<DateRangeValue>("30");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = React.useState(false);

  const trend = React.useMemo(
    () => filterByDateRange(dashboard?.trend ?? [], dateRange),
    [dashboard, dateRange],
  );
  const runs = React.useMemo(() => {
    const list = (batches ?? []).slice().sort((a, b) => b.ran_at.localeCompare(a.ran_at));
    return filterByDateRange(list, dateRange);
  }, [batches, dateRange]);

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        // R8/AC-13: enforce EXACTLY two selected — ignore a third check.
        if (next.size >= 2) return prev;
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const selectedRuns = runs.filter((r) => selected.has(r.id));
  const canCompare = selectedRuns.length === 2;
  const [older, newer] = React.useMemo(() => {
    if (selectedRuns.length !== 2) return [undefined, undefined] as const;
    const sorted = [...selectedRuns].sort((a, b) => a.agent_version - b.agent_version);
    return [sorted[0], sorted[1]] as const;
  }, [selectedRuns]);

  const agentOptions = (overview?.agents ?? []).map((a) => ({ value: a.agent_id, label: a.agent_name }));
  const alertParts = splitAlert(dashboard?.alert ?? null);

  return (
    <AppShell
      crumb={[
        { label: "Skills Lab" },
        { label: "Eval Dashboard", href: "/eval" },
        { label: agent?.name ?? "…" },
      ]}
    >
      <div style={s.page}>
        <Link href="/eval" style={s.backLink}>
          <Icon.ChevronLeft size={14} />
          All agents
        </Link>

        <div style={s.headerRow}>
          <div style={s.headerText}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{agent?.name ?? "…"}</h1>
              {agent?.model && (
                <span className="mono" style={s.modelBadge}>
                  {agent.model}
                </span>
              )}
            </div>
            <p style={s.subtitle}>
              {`Regression harness · ${runs.length} run${runs.length === 1 ? "" : "s"} on the ${dashboard?.cases_total ?? 0}-trace gold set`}
            </p>
          </div>
          <div style={s.headerControls}>
            {agentOptions.length > 0 && (
              <Select<string>
                value={agentId}
                onChange={(v) => router.push(`/eval/${v}`)}
                options={agentOptions}
                width={215}
                icon="Cpu"
                size="sm"
              />
            )}
            <Select<DateRangeValue>
              value={dateRange}
              onChange={(v) => setDateRange(v)}
              options={DATE_RANGE_OPTIONS}
              width={124}
              icon="Calendar"
              size="sm"
            />
            <Button
              kind="primary"
              icon="Play"
              loading={runSet.isPending}
              disabled={runSet.isPending}
              onClick={() => runSet.mutate()}
            >
              {runSet.isPending ? "Running…" : "Run eval"}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div style={s.section}>
            <Skeleton height={64} />
          </div>
        )}

        {!isLoading && isError && (
          <ErrorState body="Could not load this agent's eval dashboard." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && dashboard && (
          <>
            {dashboard.alert && (
              <div style={s.banner}>
                <Icon.AlertTriangle size={16} style={s.bannerIcon} />
                <span style={s.bannerText}>
                  {alertParts.bold && <strong>{alertParts.bold}</strong>}
                  {alertParts.rest}
                </span>
              </div>
            )}

            <div style={s.tiles}>
              <MetricTile
                label="RECALL"
                value={dashboard.current.recall}
                delta={dashboard.delta.recall}
                trend={trend.map((p) => p.recall)}
                color={METRIC_COLORS.recall}
              />
              <MetricTile
                label="PRECISION"
                value={dashboard.current.precision}
                delta={dashboard.delta.precision}
                trend={trend.map((p) => p.precision)}
                color={METRIC_COLORS.precision}
              />
              <MetricTile
                label="CITATION ACCURACY"
                value={dashboard.current.citation_accuracy}
                delta={dashboard.delta.citation_accuracy}
                trend={trend.map((p) => p.citation_accuracy)}
                color={METRIC_COLORS.citation}
              />
            </div>

            <div style={s.chartCard}>
              <SectionLabel
                icon="TrendingUp"
                right={
                  <div style={s.legend}>
                    <LegendDot color={METRIC_COLORS.recall} label="Recall" />
                    <LegendDot color={METRIC_COLORS.precision} label="Precision" />
                    <LegendDot color={METRIC_COLORS.citation} label="Citation" />
                  </div>
                }
              >
                METRIC TREND
              </SectionLabel>
              {trend.length === 0 ? (
                <p style={s.emptyText}>No runs in this range yet.</p>
              ) : (
                <>
                  <LineChart
                    series={[
                      { name: "Recall", color: METRIC_COLORS.recall, data: trend.map((p) => p.recall) },
                      { name: "Precision", color: METRIC_COLORS.precision, data: trend.map((p) => p.precision) },
                      { name: "Citation", color: METRIC_COLORS.citation, data: trend.map((p) => p.citation_accuracy) },
                    ]}
                  />
                </>
              )}
            </div>

            <div style={s.section}>
              <SectionLabel
                icon="History"
                right={
                  <Button kind="primary" icon="GitCompare" disabled={!canCompare} onClick={() => setCompareOpen(true)}>
                    Compare
                  </Button>
                }
              >
                RECENT RUNS
                <span style={s.selectedCount}>{`${selected.size} selected`}</span>
              </SectionLabel>

              {runs.length === 0 ? (
                <EmptyState icon="History" title="No runs yet" body="Run this agent's eval set to see history here." />
              ) : (
                <div style={s.table}>
                  <div style={s.runRowHeader}>
                    <span />
                    <span>RAN AT</span>
                    <span>VERSION</span>
                    <span>RECALL</span>
                    <span>PRECISION</span>
                    <span>CITATION</span>
                    <span style={{ textAlign: "right" }}>PASS</span>
                    <span style={{ textAlign: "right" }}>COST</span>
                  </div>
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      checked={selected.has(run.id)}
                      onToggle={(v) => toggleSelect(run.id, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {compareOpen && older && newer && (
        <CompareRunsModal agentId={agentId} older={older} newer={newer} onClose={() => setCompareOpen(false)} />
      )}
    </AppShell>
  );
}

function MetricTile({
  label,
  value,
  delta,
  trend,
  color,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  trend: number[];
  color: string;
}) {
  const pct = value == null || Number.isNaN(value) ? null : Math.round(value * 100);
  const d = formatDeltaPt(delta);
  return (
    <div style={s.tile}>
      <div style={s.tileHeader}>
        <span style={s.tileLabel}>{label}</span>
        {trend.length > 0 && <Sparkline data={trend} color={color} w={64} h={22} />}
      </div>
      <div style={s.tileValueRow}>
        <span className="tnum" style={s.tileValue}>
          {pct == null ? "—" : pct}
          {pct != null && <span style={s.tileSuffix}>%</span>}
        </span>
        <span className="tnum" style={{ ...s.tileDelta, color: d.color }}>
          {d.text}
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={s.legendItem}>
      <span style={{ ...s.legendSwatch, background: color }} />
      {label}
    </span>
  );
}

function RunRow({
  run,
  checked,
  onToggle,
}: {
  run: EvalRunBatchRecord;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div style={s.runRow}>
      <Checkbox checked={checked} onChange={onToggle} />
      <span className="mono tnum" style={s.runTimestamp}>
        {formatRunTimestamp(run.ran_at)}
      </span>
      <span className="mono" style={s.runVersion}>{`v${run.agent_version}`}</span>
      <MetricBarCell value={run.recall} color={METRIC_COLORS.recall} />
      <MetricBarCell value={run.precision} color={METRIC_COLORS.precision} />
      <MetricBarCell value={run.citation_accuracy} color={METRIC_COLORS.citation} />
      <span className="tnum" style={s.runPass}>{`${run.pass_count}/${run.total_count}`}</span>
      <span className="tnum" style={s.runCost}>
        {formatCost(run.cost_usd)}
      </span>
    </div>
  );
}

function MetricBarCell({ value, color }: { value: number | null | undefined; color: string }) {
  return (
    <div style={s.barCell}>
      <div style={s.barTrack}>
        <div style={s.barFill(metricBarWidth(value), color)} />
      </div>
      <span className="tnum" style={s.barValue}>
        {formatMetricPct(value)}
      </span>
    </div>
  );
}
