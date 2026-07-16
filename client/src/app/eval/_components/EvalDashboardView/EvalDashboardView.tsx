/* EvalDashboardView — cross-agent Eval Dashboard landing page (T-12, design/04).
   Non-repo-scoped (like /conventions): agents/eval runs are not repo-scoped data. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalDashboardOverview } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { api } from "../../../../lib/api";
import { useEvalDashboard } from "../../../../lib/hooks/eval";
import { METRIC_COLORS, formatMetricPct, formatRunTimestamp, metricBarWidth } from "./constants";
import { s } from "./styles";

type OverviewAgent = EvalDashboardOverview["agents"][number];
type RecentRun = EvalDashboardOverview["recent_runs"][number];

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const qc = useQueryClient();
  const [runningAll, setRunningAll] = React.useState(false);

  const agents = data?.agents ?? [];
  const recentRuns = data?.recent_runs ?? [];

  // R19/AC-27: "Run all agents" fans out SEQUENTIALLY — a for...of + await
  // loop, never Promise.all — so the per-route eval-runs rate limit (C2,
  // { max: 10, timeWindow: '1 minute' }) is never hit by a burst of parallel
  // POSTs, and one agent's run failing doesn't cancel the rest mid-flight.
  async function handleRunAllAgents() {
    if (runningAll || agents.length === 0) return;
    setRunningAll(true);
    try {
      for (const agent of agents) {
        await api.post(`/agents/${agent.agent_id}/eval-runs`);
      }
    } finally {
      setRunningAll(false);
      qc.invalidateQueries({ queryKey: ["eval-dashboard-overview"] });
    }
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.subtitle}>
              Regression harness across all reviewer agents · pick an agent to see its runs
            </p>
          </div>
          <Button
            kind="primary"
            icon="Play"
            onClick={handleRunAllAgents}
            disabled={runningAll || isLoading || agents.length === 0}
            loading={runningAll}
          >
            {runningAll ? "Running…" : "Run all agents"}
          </Button>
        </div>

        {isLoading && (
          <div style={s.agentList}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        )}

        {!isLoading && isError && (
          <ErrorState body="Could not load the eval dashboard." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && (
          <>
            <div style={s.section}>
              <SectionLabel icon="Settings">AGENTS</SectionLabel>
              {agents.length === 0 ? (
                <EmptyState
                  icon="FlaskConical"
                  title="No agents yet"
                  body="Create an agent to start running evals."
                />
              ) : (
                <div style={s.agentList}>
                  {agents.map((agent) => (
                    <AgentRow key={agent.agent_id} agent={agent} />
                  ))}
                </div>
              )}
            </div>

            <div style={s.section}>
              <SectionLabel icon="History">RECENT EVAL RUNS · ALL AGENTS</SectionLabel>
              {recentRuns.length === 0 ? (
                <p style={s.emptyRuns}>No eval runs yet.</p>
              ) : (
                <div style={s.table}>
                  {recentRuns.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({ agent }: { agent: OverviewAgent }) {
  const batch = agent.latest_batch;
  return (
    <Link href={`/eval/${agent.agent_id}`} style={s.agentRow}>
      <div style={s.agentIconBox}>
        <Icon.Cpu size={15} />
      </div>
      <div style={s.agentIdentity}>
        <div style={s.agentNameRow}>
          <span style={s.agentName}>{agent.agent_name}</span>
          <span className="mono" style={s.modelBadge}>
            {agent.model}
          </span>
        </div>
        <div style={s.agentMeta}>
          {batch
            ? `Last run v${batch.owner_version} · ${formatRunTimestamp(batch.ran_at)} · ${batch.pass_count}/${batch.total_count} pass`
            : "Never run"}
        </div>
      </div>
      <div style={s.sparklineCol}>
        <Sparkline data={agent.sparkline} color={METRIC_COLORS.recall} w={80} h={22} />
      </div>
      <MetricColumn label="RECALL" value={batch?.recall} color={METRIC_COLORS.recall} />
      <MetricColumn label="PREC" value={batch?.precision} color={METRIC_COLORS.precision} />
      <MetricColumn label="CITE" value={batch?.citation_accuracy} color={METRIC_COLORS.citation} />
      <Icon.ChevronRight size={16} style={s.chevron} />
    </Link>
  );
}

function MetricColumn({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  return (
    <div style={s.metricCol}>
      <span style={s.metricLabel}>{label}</span>
      <span className="tnum" style={s.metricValue(color)}>
        {formatMetricPct(value)}
      </span>
    </div>
  );
}

function RunRow({ run }: { run: RecentRun }) {
  return (
    <div style={s.runRow}>
      <span style={s.runAgentName}>{run.agent_name}</span>
      <span className="mono tnum" style={s.runTimestamp}>
        {formatRunTimestamp(run.ran_at)}
      </span>
      <Link href={`/eval/${run.owner_id}`} className="mono" style={{ ...s.runVersion, color: "var(--accent-text)" }}>
        {`v${run.owner_version}`}
      </Link>
      <MetricBarCell value={run.recall} color={METRIC_COLORS.recall} />
      <MetricBarCell value={run.precision} color={METRIC_COLORS.precision} />
      <MetricBarCell value={run.citation_accuracy} color={METRIC_COLORS.citation} />
      <span className="tnum" style={s.runPass}>
        {`${run.pass_count}/${run.total_count}`}
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
