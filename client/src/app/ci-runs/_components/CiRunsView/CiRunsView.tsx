/* CiRunsView — global CI Runs page (T-04, design/06-ci-runs-page.png).
   Non-repo-scoped (like /eval, /conventions): CI runs span every installed
   agent/repo. Data via T-03's useCiRuns() — the list hook itself polls
   GET /ci-runs unconditionally every ~15s. AC-39 also requires new runner
   results to be INGESTED on each poll (not just re-read), so this component
   additionally ticks POST /ci-runs/refresh on the same ~15s cadence via the
   silent `useSilentRefreshCiRuns()` — auto-ingest failures must not toast;
   only the manual Refresh button surfaces errors. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Select,
  Skeleton,
  SEV,
  type Severity,
} from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import {
  CI_RUNS_POLL_MS,
  useCiRuns,
  useRefreshCiRuns,
  useSilentRefreshCiRuns,
} from "../../../../lib/hooks/ci";
import {
  CI_STATUS_META,
  COLUMNS,
  SKELETON_ROWS,
  SOURCE_TARGET_KEYS,
  formatCost,
  formatDuration,
  formatRunTimestamp,
  isWithinDays,
} from "./constants";
import { s } from "./styles";

type FilterValue = "all" | (string & {});

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useCiRuns();
  const refresh = useRefreshCiRuns();
  const silentRefresh = useSilentRefreshCiRuns();

  // AC-39: auto-ingest new runner results on the same ~15s cadence the list
  // itself polls on. Guarded by `tickInFlight` so a slow POST never overlaps
  // with the next tick, and cleared on unmount so no timer survives navigation.
  const tickInFlight = React.useRef(false);
  React.useEffect(() => {
    const id = setInterval(() => {
      if (tickInFlight.current) return;
      tickInFlight.current = true;
      void silentRefresh().finally(() => {
        tickInFlight.current = false;
      });
    }, CI_RUNS_POLL_MS);
    return () => clearInterval(id);
  }, [silentRefresh]);

  const [dateRange, setDateRange] = React.useState<"7d">("7d");
  const [agentFilter, setAgentFilter] = React.useState<FilterValue>("all");
  const [repoFilter, setRepoFilter] = React.useState<FilterValue>("all");
  const [statusFilter, setStatusFilter] = React.useState<FilterValue>("all");
  const [sourceFilter, setSourceFilter] = React.useState<FilterValue>("all");

  const runs = data ?? [];

  const agentOptions = React.useMemo(() => {
    const names = Array.from(new Set(runs.map((r) => r.agent).filter((a): a is string => !!a)));
    return [
      { value: "all" as FilterValue, label: t("runs.filters.allAgents") },
      ...names.map((n) => ({ value: n as FilterValue, label: n })),
    ];
  }, [runs, t]);

  const sourceOptions = React.useMemo(() => {
    const sources = Array.from(new Set(runs.map((r) => r.source).filter((sv): sv is string => !!sv)));
    return [
      { value: "all" as FilterValue, label: t("runs.filters.allSources") },
      ...sources.map((sv) => ({
        value: sv as FilterValue,
        label: SOURCE_TARGET_KEYS.includes(sv) ? t(`exportWizard.targets.${sv}`) : sv,
      })),
    ];
  }, [runs, t]);

  const statusOptions: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("runs.filters.allStatuses") },
    { value: "succeeded", label: t("runs.status.succeeded") },
    { value: "no_findings", label: t("runs.status.noFindings") },
    { value: "failed", label: t("runs.status.failed") },
    { value: "running", label: t("runs.status.running") },
  ];

  // Only one date-range value exists today (no i18n key for a broader range) —
  // still a real Select per the task's Select-not-native-<select> instruction.
  const dateRangeOptions: { value: "7d"; label: string }[] = [
    { value: "7d", label: t("runs.filters.last7Days") },
  ];

  // No per-run repo field is ingested on `CiRun` yet (only `ci_installation_id`)
  // — rendered as a single-option Select rather than fabricating a repo filter
  // with no backing data. See Process notes in the implementer report.
  const repoOptions: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("runs.filters.allRepos") },
  ];

  const filteredRuns = React.useMemo(() => {
    return runs
      .filter((r) => dateRange !== "7d" || isWithinDays(r.ran_at, 7))
      .filter((r) => agentFilter === "all" || r.agent === agentFilter)
      .filter((r) => repoFilter === "all")
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => sourceFilter === "all" || r.source === sourceFilter)
      .slice()
      .sort((a, b) => (Date.parse(b.ran_at ?? "") || 0) - (Date.parse(a.ran_at ?? "") || 0));
  }, [runs, dateRange, agentFilter, repoFilter, statusFilter, sourceFilter]);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.headerRight}>
            <span style={s.autoRefresh}>
              <span style={s.autoRefreshDot} />
              {t("runs.autoRefresh")}
            </span>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
          </div>
        </div>

        <div style={s.filterRow}>
          <Select<"7d">
            value={dateRange}
            onChange={setDateRange}
            options={dateRangeOptions}
            width={140}
            icon="Calendar"
            size="sm"
          />
          <Select<FilterValue>
            value={agentFilter}
            onChange={setAgentFilter}
            options={agentOptions}
            width={160}
            icon="Settings"
            size="sm"
          />
          <Select<FilterValue>
            value={repoFilter}
            onChange={setRepoFilter}
            options={repoOptions}
            width={140}
            icon="GitBranch"
            size="sm"
          />
          <Select<FilterValue>
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            width={150}
            size="sm"
          />
          <Select<FilterValue>
            value={sourceFilter}
            onChange={setSourceFilter}
            options={sourceOptions}
            width={150}
            icon="GitBranch"
            size="sm"
          />
        </div>

        <div style={s.tableCard}>
          <div style={s.headRow}>
            {COLUMNS.map((col) => (
              <div key={col.key}>{col.labelKey ? t(`runs.table.${col.labelKey}`) : col.label}</div>
            ))}
          </div>

          {isLoading ? (
            <div style={s.loadingStack}>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <Skeleton key={i} height={28} />
              ))}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filteredRuns.length === 0 ? (
            <EmptyState
              icon="Workflow"
              title={t("runs.emptyTitle")}
              body={t("runs.emptyBody")}
              cta={t("runs.emptyCta")}
              onCta={() => router.push("/agents")}
            />
          ) : (
            filteredRuns.map((run) => <RunRow key={run.id} run={run} t={t} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

function RunRow({ run, t }: { run: CiRun; t: ReturnType<typeof useTranslations> }) {
  const isFailed = run.status === "failed";
  const statusMeta = run.status ? CI_STATUS_META[run.status] : undefined;
  const title = run.pr_title ?? "";
  const truncatedTitle = title.length > 42 ? `${title.slice(0, 42)}…` : title;

  return (
    <div style={s.row}>
      <span style={s.timestamp}>{formatRunTimestamp(run.ran_at)}</span>

      <div style={s.prCell}>
        {run.github_url ? (
          <a href={run.github_url} target="_blank" rel="noreferrer" className="mono" style={s.prNumber}>
            {`#${run.pr_number ?? "—"}`}
          </a>
        ) : (
          <span className="mono" style={s.prNumber}>{`#${run.pr_number ?? "—"}`}</span>
        )}
        {title && (
          <span style={s.prTitle} title={title}>
            {truncatedTitle}
          </span>
        )}
      </div>

      <div style={s.agentCell}>
        {run.agent ? (
          <>
            <Icon.Cpu size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={s.agentName}>{run.agent}</span>
          </>
        ) : (
          <span style={s.dash}>—</span>
        )}
      </div>

      {run.source ? (
        <span style={s.sourceBadge}>
          <Icon.GitBranch size={12} />
          {SOURCE_TARGET_KEYS.includes(run.source) ? t(`exportWizard.targets.${run.source}`) : run.source}
        </span>
      ) : (
        <span style={s.dash}>—</span>
      )}

      <span style={s.duration}>{isFailed ? "—" : formatDuration(run.duration_s)}</span>

      <FindingsCell run={run} isFailed={isFailed} />

      <span style={s.cost}>{isFailed ? "—" : formatCost(run.cost_usd)}</span>

      {statusMeta ? (
        <Badge dot color={statusMeta.c} bg={statusMeta.bg}>
          {t(`runs.status.${statusMeta.labelKey}`)}
        </Badge>
      ) : (
        <span style={s.dash}>—</span>
      )}

      {run.github_url ? (
        <a href={run.github_url} target="_blank" rel="noreferrer" style={s.traceLink}>
          Trace
        </a>
      ) : (
        <span style={s.dash}>Trace</span>
      )}
    </div>
  );
}

/** Per-severity icon+count pairs (AC-25) — plain icon+number, no pill background,
    matching the FindingCard inline-severity pattern (client/INSIGHTS.md 2026-06-20). */
function FindingsCell({ run, isFailed }: { run: CiRun; isFailed: boolean }) {
  if (isFailed) return <span style={s.dash}>—</span>;

  const allSeverities: { sev: Severity; count: number }[] = [
    { sev: "CRITICAL", count: run.critical ?? 0 },
    { sev: "WARNING", count: run.warning ?? 0 },
    { sev: "SUGGESTION", count: run.suggestion ?? 0 },
  ];
  const parts = allSeverities.filter((p) => p.count > 0);

  if (parts.length === 0) return <span style={s.dash}>—</span>;

  return (
    <div style={s.findingsCell}>
      {parts.map(({ sev, count }) => {
        const meta = SEV[sev];
        const SevIcon = Icon[meta.icon];
        return (
          <span key={sev} style={s.findingPair}>
            <SevIcon size={13} style={{ color: meta.c }} />
            <span className="tnum" style={{ color: meta.c }}>
              {count}
            </span>
          </span>
        );
      })}
    </div>
  );
}
