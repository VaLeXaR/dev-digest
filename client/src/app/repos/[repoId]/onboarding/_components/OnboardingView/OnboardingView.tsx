/* OnboardingView — repo-scoped Onboarding Tour page (T-08). Three states:
   index_required / not_generated (both a centered EmptyState, no header
   actions, no ON-THIS-PAGE nav) and ready (full page: header with
   Regenerate/Share, ON-THIS-PAGE scroll-spy nav, and the five section
   cards). Mirrors the ProjectContextView route pattern (client/INSIGHTS.md
   2026-07-09). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../../../components/app-shell";
import { useActiveRepo } from "../../../../../../lib/repo-context";
import { useOnboarding, useRegenerateOnboarding } from "../../../../../../lib/hooks";
import { OnThisPageNav, type OnThisPageSection } from "./_components/OnThisPageNav/OnThisPageNav";
import { ArchitectureSection } from "./_components/ArchitectureSection/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection/CriticalPathsSection";
import { RunLocallySection } from "./_components/RunLocallySection/RunLocallySection";
import { ReadingPathSection } from "./_components/ReadingPathSection/ReadingPathSection";
import { FirstTasksSection } from "./_components/FirstTasksSection/FirstTasksSection";
import { relativeAgo } from "./helpers";
import { s } from "./styles";

const SHARE_COPY_RESET_MS = 1500;

export function OnboardingView() {
  const t = useTranslations("onboarding");
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.full_name ?? "repository";

  const { data, isLoading, isError, refetch } = useOnboarding(repoId);
  const regenerate = useRegenerateOnboarding();
  const [shareCopied, setShareCopied] = React.useState(false);

  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  function handleRegenerate() {
    if (!repoId) return;
    regenerate.mutate(repoId);
  }

  function handleShare() {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), SHARE_COPY_RESET_MS);
  }

  if (!repoId || isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.container}>
          <Skeleton height={28} width={280} />
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.container}>
          <ErrorState title={t("loadError.title")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  if (data.state === "index_required") {
    return (
      <AppShell crumb={crumb}>
        <div style={s.container}>
          <EmptyState icon="Workflow" title={t("indexRequired.title")} body={t("indexRequired.body")} />
        </div>
      </AppShell>
    );
  }

  if (data.state === "not_generated") {
    return (
      <AppShell crumb={crumb}>
        <div style={s.container}>
          <EmptyState
            icon="Workflow"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={t("generate.cta")}
            onCta={handleRegenerate}
            ctaLoading={regenerate.isPending}
          />
        </div>
      </AppShell>
    );
  }

  // ready
  const { tour, currentIndexedSha } = data;
  const stale = currentIndexedSha !== tour.meta.indexedAtSha;

  const sections: OnThisPageSection[] = [
    { id: "architecture", label: t("sectionNav.architecture") },
    { id: "criticalPaths", label: t("sectionNav.criticalPaths") },
    { id: "runLocally", label: t("sectionNav.runLocally") },
    { id: "readingPath", label: t("sectionNav.readingPath") },
    { id: "firstTasks", label: t("sectionNav.firstTasks") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.container}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.h1}>
              {t("header.titlePrefix")} <span style={s.repoName}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {t("header.subtitle", { files: tour.meta.filesIndexed, time: relativeAgo(tour.meta.generatedAt) })}
              {stale && <span style={s.staleHint}>{t("staleHint")}</span>}
            </p>
          </div>
          <div style={s.actions}>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={handleRegenerate}
              loading={regenerate.isPending}
              disabled={regenerate.isPending}
            >
              {t("regenerate")}
            </Button>
            <Button kind="secondary" icon={shareCopied ? "Check" : "Link"} onClick={handleShare}>
              {shareCopied ? t("shareLinkCopied") : t("shareLink")}
            </Button>
          </div>
        </div>

        <div style={s.layout}>
          <OnThisPageNav label={t("onThisPage")} sections={sections} />

          <div style={s.sections}>
            <ArchitectureSection id="architecture" title={t("sectionNav.architecture")} architecture={tour.architecture} />
            <CriticalPathsSection
              id="criticalPaths"
              title={t("sectionNav.criticalPaths")}
              openLabel={t("criticalPaths.open")}
              emptyText={t("criticalPaths.empty")}
              paths={tour.criticalPaths}
              repoFullName={activeRepo?.full_name}
              defaultBranch={activeRepo?.default_branch}
            />
            <RunLocallySection
              id="runLocally"
              title={t("sectionNav.runLocally")}
              aiGeneratedCaption={t("runLocally.aiGenerated")}
              emptyText={t("runLocally.empty")}
              runLocally={tour.runLocally}
            />
            <ReadingPathSection
              id="readingPath"
              title={t("sectionNav.readingPath")}
              emptyText={t("readingPath.empty")}
              entries={tour.readingPath}
            />
            <FirstTasksSection
              id="firstTasks"
              title={t("sectionNav.firstTasks")}
              emptyText={t("firstTasks.empty")}
              tasks={tour.firstTasks}
              repoFullName={activeRepo?.full_name}
              defaultBranch={activeRepo?.default_branch}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default OnboardingView;
