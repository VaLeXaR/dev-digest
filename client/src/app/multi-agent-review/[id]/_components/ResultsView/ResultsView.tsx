/* ResultsView — Multi-Agent Review results (T-12/T-13). Results shell (header +
   Columns/Tabs toggle scaffold), Columns mode (one AgentColumn per agent that
   ran), and the shared WhereAgentsDisagree block. Tabs mode content is wired by
   T-13 — the toggle exists here so its state has somewhere to live. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Modal, Skeleton, type DropdownItemDef } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useDeleteMultiRun, useMultiRun, useMultiRunHistoryForRepo } from "@/lib/hooks/multi-agent";
import { usePullDetail } from "@/lib/hooks";
import { useRunEvents } from "@/lib/hooks/reviews";
import RunTraceDrawer from "@/components/RunTraceDrawer";
import { AgentColumn } from "./_components/AgentColumn";
import { TabsView } from "./_components/TabsView";
import { WhereAgentsDisagree } from "./_components/WhereAgentsDisagree";
import {
  findingsForAgent,
  formatCost,
  formatDuration,
  mapAgentStatus,
  maxDurationMs,
  totalCostUsd,
} from "./helpers";
import { s } from "./styles";

export function ResultsView() {
  const t = useTranslations("multiAgentResults");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { data: detail, isLoading, isError, refetch } = useMultiRun(id);
  const { data: pr } = usePullDetail(detail?.prId);
  const { activeRepo, repoId } = useActiveRepo();
  // Recent runs across the active repo — powers the "History" switcher so you
  // can reopen a previous multi-agent review (US8).
  const { data: recentRuns } = useMultiRunHistoryForRepo(repoId);

  // Live per-agent status: seed from useMultiRun (polls every 4s while
  // status==='running'), and additionally subscribe to SSE so the moment the
  // last stream closes we refetch immediately rather than waiting for the next
  // poll tick.
  const runIds = React.useMemo(() => (detail?.agents ?? []).map((a) => a.runId), [detail]);
  const subscribing = detail?.status === "running";
  const { running: sseRunning } = useRunEvents(subscribing ? runIds : []);
  const wasSseRunning = React.useRef(false);
  React.useEffect(() => {
    if (subscribing) wasSseRunning.current = sseRunning;
  }, [subscribing, sseRunning]);
  React.useEffect(() => {
    if (wasSseRunning.current && !sseRunning) {
      wasSseRunning.current = false;
      refetch();
    }
  }, [sseRunning, refetch]);

  const [mode, setMode] = React.useState<"columns" | "tabs">("columns");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; label: string } | null>(null);
  const del = useDeleteMultiRun();

  const crumb = [
    { label: t("header.title"), href: "/multi-agent-review" },
    { label: pr ? `#${pr.number}` : "…", mono: true },
  ];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loadingWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  if (isError || !detail) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("error.title")} body={t("error.body")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  const agents = detail.agents;
  const totalCost = totalCostUsd(agents);
  const totalDuration = maxDurationMs(agents);
  const visibleGroups = onlyConflicts ? detail.groups.filter((g) => g.isConflict) : detail.groups;
  const traceAgent = agents.find((a) => a.runId === traceRunId) ?? null;

  const historyLabel = (ranAt: string) =>
    new Date(ranAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const historyItems: DropdownItemDef[] = (recentRuns ?? []).map((run) => ({
    label: historyLabel(run.ranAt),
    icon: run.status === "complete" ? "Check" : run.status === "failed" ? "XCircle" : "Clock",
    hint: t("header.historyItemHint", { count: run.agentCount, cost: formatCost(run.totalCostUsd) }),
    muted: run.id === id, // the run being viewed
    onClick: run.id === id ? undefined : () => router.push(`/multi-agent-review/${run.id}`),
    onRemove: () => setPendingDelete({ id: run.id, label: historyLabel(run.ranAt) }),
    removeLabel: t("header.historyDelete"),
  }));

  // Deleting the run currently open must navigate away (its detail page would
  // otherwise 404 on the next refetch); deleting any OTHER run just refreshes
  // the history list via the hook's invalidation.
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deletingCurrent = pendingDelete.id === id;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        if (deletingCurrent) router.push("/multi-agent-review");
      },
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <div style={s.headerLeft}>
            <Button kind="secondary" size="sm" icon="Settings" onClick={() => router.push("/multi-agent-review?configure=1")}>
              {t("header.configureRun")}
            </Button>
            {historyItems.length > 1 && (
              <Dropdown
                width={260}
                trigger={
                  <Button kind="secondary" size="sm" icon="History">
                    {t("header.history")}
                  </Button>
                }
                items={historyItems}
              />
            )}
          </div>
          <div style={s.titleGroup}>
            <h1 style={s.h1}>{t("header.title")}</h1>
            <span style={s.subtitle}>{t("header.subtitle", { count: agents.length })}</span>
          </div>
          <div style={s.modeToggle}>
            <Button kind="tertiary" size="sm" active={mode === "columns"} onClick={() => setMode("columns")}>
              {t("header.columns")}
            </Button>
            <Button kind="tertiary" size="sm" active={mode === "tabs"} onClick={() => setMode("tabs")}>
              {t("header.tabs")}
            </Button>
          </div>
        </div>

        {pr && (
          <div style={s.prMetaRow}>
            <span style={s.prTitle}>
              #{pr.number} {pr.title}
            </span>
            <span style={s.metaLine}>
              <Icon.Cpu size={12} />
              {t("header.meta", {
                count: agents.length,
                duration: formatDuration(totalDuration),
                cost: formatCost(totalCost),
              })}
            </span>
          </div>
        )}

        {mode === "columns" && (
          <div style={s.columnsGrid}>
            {agents.map((agent, i) => (
              <AgentColumn
                key={agent.agentId}
                agent={agent}
                index={i}
                findings={findingsForAgent(detail.groups, agent.agentId)}
                onViewTrace={() => setTraceRunId(agent.runId)}
              />
            ))}
          </div>
        )}

        {mode === "tabs" && (
          <TabsView
            agents={agents}
            prId={detail.prId}
            repoFullName={activeRepo?.full_name ?? null}
            headSha={pr?.head_sha ?? null}
            onViewTrace={setTraceRunId}
          />
        )}

        <WhereAgentsDisagree
          groups={visibleGroups}
          agents={agents}
          onlyConflicts={onlyConflicts}
          onToggleOnlyConflicts={setOnlyConflicts}
        />
      </div>

      {traceAgent && (
        <RunTraceDrawer
          runId={traceAgent.runId}
          agentName={traceAgent.name}
          prNumber={pr?.number ?? null}
          running={mapAgentStatus(traceAgent.status) === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}

      {pendingDelete && (
        <Modal
          width={420}
          title={t("delete.confirmTitle")}
          subtitle={t(
            pendingDelete.id === id ? "delete.confirmCurrentBody" : "delete.confirmBody",
            { label: pendingDelete.label },
          )}
          onClose={del.isPending ? undefined : () => setPendingDelete(null)}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button kind="secondary" size="sm" onClick={() => setPendingDelete(null)} disabled={del.isPending}>
                {t("delete.cancel")}
              </Button>
              <Button kind="danger" size="sm" onClick={confirmDelete} disabled={del.isPending}>
                {del.isPending ? t("delete.deleting") : t("delete.confirm")}
              </Button>
            </div>
          }
        />
      )}
    </AppShell>
  );
}
