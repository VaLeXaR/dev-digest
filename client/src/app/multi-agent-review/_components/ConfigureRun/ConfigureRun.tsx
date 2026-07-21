/* ConfigureRun — R2/AC-3 Configure-run page. Step 1 picks a PR from the
   ACTIVE repo (no cross-repo PR endpoint — `useActiveRepo()` → `usePulls`);
   step 2 lists every agent with a per-agent time/cost hint, defaulting the
   selection to the repo's enabled agents. The run button stays disabled until
   a PR is picked (empty "Pick a pull request first" state). Duration/cost are
   ALWAYS the server's estimate — displayed, never recomputed client-side
   (AC-10: summary cost = Σ, duration = MAX per agent). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon } from "@devdigest/ui";
import { Select } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents, usePulls } from "@/lib/hooks";
import {
  useCreateMultiRun,
  useMultiRunEstimate,
  useMultiRunHistoryForRepo,
} from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";
import { agentCategoryStyle } from "./constants";
import { formatDurationOrDash } from "./helpers";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("multiAgentConfigure");
  const router = useRouter();
  const { repoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const { data: agents } = useAgents();
  const pullList = React.useMemo(() => pulls ?? [], [pulls]);
  const agentList = React.useMemo(() => agents ?? [], [agents]);

  const [prId, setPrId] = React.useState("");
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);

  // Landing behavior: `?configure=1` forces the form (starting a new run).
  // Otherwise, if the repo has any past runs, redirect to the latest run's
  // results — the Configure/empty state shows ONLY when the repo has NEVER had a
  // multi-agent run.
  const searchParams = useSearchParams();
  const configure = searchParams.get("configure") === "1";
  const recentRuns = useMultiRunHistoryForRepo(repoId);
  const latestRunId =
    recentRuns.data && recentRuns.data.length > 0 ? recentRuns.data[0]!.id : null;
  React.useEffect(() => {
    if (!configure && latestRunId) router.replace(`/multi-agent-review/${latestRunId}`);
  }, [configure, latestRunId, router]);

  // Default the selection to the repo's enabled agents, once, the first time
  // the agent list loads — matches design/03.png's pre-checked rows.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current || agentList.length === 0) return;
    seededRef.current = true;
    setSelectedAgentIds(agentList.filter((a) => a.enabled).map((a) => a.id));
  }, [agentList]);

  const estimateAll = useMultiRunEstimate();
  const estimateSelected = useMultiRunEstimate();
  const create = useCreateMultiRun();

  // Per-agent hints render for EVERY listed agent (checked or not, per
  // design/03.png), so fetch the estimate for the full agent list.
  const allAgentIdsKey = agentList.map((a) => a.id).join(",");
  React.useEffect(() => {
    if (!prId || agentList.length === 0) return;
    estimateAll.mutate({ prId, agentIds: agentList.map((a) => a.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId, allAgentIdsKey]);

  // The summary line reflects only the SELECTED agents — fetched separately
  // so it always matches the server's own Σ cost / MAX duration (AC-10).
  const selectedKey = [...selectedAgentIds].sort().join(",");
  React.useEffect(() => {
    if (!prId || selectedAgentIds.length === 0) return;
    estimateSelected.mutate({ prId, agentIds: selectedAgentIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId, selectedKey]);

  function toggleAgent(id: string, checked: boolean) {
    setSelectedAgentIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const allAgentIds = agentList.map((a) => a.id);
  const allSelected = allAgentIds.length > 0 && allAgentIds.every((id) => selectedAgentIds.includes(id));
  function handleSelectAll() {
    setSelectedAgentIds(allSelected ? [] : allAgentIds);
  }

  function handleRun() {
    if (!prId || selectedAgentIds.length === 0) return;
    create.mutate(
      { prId, agentIds: selectedAgentIds },
      { onSuccess: (data) => router.push(`/multi-agent-review/${data.multiRunId}`) },
    );
  }

  const prOptions = pullList.flatMap((p) =>
    p.id ? [{ value: p.id, label: `#${p.number} · ${p.title}` }] : [],
  );

  const summary = estimateSelected.data?.summary;
  const runDisabled = !prId || selectedAgentIds.length === 0 || create.isPending;

  if (!configure) {
    // While history loads or we're redirecting to the latest run, render a blank
    // shell — no flash of the form. The empty state shows only when the repo has
    // never had a run.
    if (recentRuns.isLoading || latestRunId) {
      return (
        <AppShell crumb={[{ label: t("crumbRoot") }]}>
          <div style={s.landing} />
        </AppShell>
      );
    }
    return (
      <AppShell crumb={[{ label: t("crumbRoot") }]}>
        <div style={s.landing}>
          <EmptyState
            icon="Cpu"
            title={t("landingTitle")}
            body={t("landingBody")}
            cta={t("landingCta")}
            onCta={() => router.push("/multi-agent-review?configure=1")}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("crumbRoot"), href: "/multi-agent-review" }, { label: t("crumbCurrent") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("title")}</h1>
        <p style={s.subtitle}>{t("subtitle")}</p>

        <div style={s.step}>
          <div style={s.stepHeader}>
            <span style={s.stepBadge(true)}>1</span>
            <span style={s.stepLabel}>{t("step1Label")}</span>
          </div>
          <Select
            value={prId}
            onChange={setPrId}
            options={prOptions}
            placeholder={t("prPlaceholder")}
            icon="GitPullRequest"
          />
        </div>

        <div style={s.step}>
          <div style={s.stepHeaderRow}>
            <div style={s.stepHeader}>
              <span style={s.stepBadge(false)}>2</span>
              <span style={s.stepLabel}>{t("step2Label")}</span>
            </div>
            {prId && agentList.length > 0 && (
              <button type="button" onClick={handleSelectAll} style={s.selectAllLink}>
                {t("selectAll")}
              </button>
            )}
          </div>

          {!prId ? (
            <div style={s.emptyBox}>
              <EmptyState icon="GitPullRequest" title={t("emptyTitle")} body={t("emptyBody")} />
            </div>
          ) : agentList.length === 0 ? (
            <div style={s.emptyBox}>
              <EmptyState icon="Cpu" title={t("noAgents")} />
            </div>
          ) : (
            <div style={s.agentList}>
              {agentList.map((a) => {
                const checked = selectedAgentIds.includes(a.id);
                const cat = agentCategoryStyle(a.name);
                const CatIcon = Icon[cat.icon];
                const perAgent = estimateAll.data?.perAgent.find((p) => p.agentId === a.id);
                return (
                  <div
                    key={a.id}
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={a.name}
                    tabIndex={0}
                    onClick={() => toggleAgent(a.id, !checked)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleAgent(a.id, !checked);
                      }
                    }}
                    style={s.agentRow(checked, cat.color)}
                  >
                    <span style={s.checkboxBox(checked, cat.color)}>
                      {checked && <Icon.Check size={11} style={{ color: "#fff" }} />}
                    </span>
                    <span style={s.iconBubble(cat.color)}>
                      <CatIcon size={15} style={{ color: cat.color }} />
                    </span>
                    <span style={s.agentText}>
                      <div style={s.agentName}>{a.name}</div>
                      {a.description && <div style={s.agentDesc}>{a.description}</div>}
                    </span>
                    <span style={s.agentHint}>
                      {formatDurationOrDash(perAgent?.estDurationMs)} · {formatCost(perAgent?.estCostUsd)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={s.actionsRow}>
          <Button kind="primary" icon="Users" disabled={runDisabled} loading={create.isPending} onClick={handleRun}>
            {t("runButton", { count: selectedAgentIds.length })}
          </Button>
          {prId && (
            <span style={s.summaryText}>
              {t("summary", {
                duration: formatDurationOrDash(summary?.estDurationMs),
                cost: formatCost(summary?.estCostUsd),
              })}
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
