"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, FormField, Select, Icon } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation, CiRun } from "@devdigest/shared";
import { useCiInstallations, useCiRuns } from "../../../../../../../lib/hooks/ci";
import { useUpdateAgent } from "../../../../../../../lib/hooks/agents";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { CI_FAIL_ON_VALUES } from "../ConfigTab/constants";
import { ExportWizard } from "./_components/ExportWizard/ExportWizard";
import { TARGET_LABEL_KEYS } from "./_components/ExportWizard/constants";
import { latestRunByInstallation, relativeTimeAgo } from "./helpers";
import { s } from "./styles";

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { color: "var(--warn)", bg: "var(--warn-bg)" },
};

function InstallationRow({
  installation,
  latest,
  t,
}: {
  installation: CiInstallation;
  latest: CiRun | undefined;
  t: ReturnType<typeof useTranslations<"ci">>;
}) {
  const statusKey = latest?.status ?? null;
  const statusColors = statusKey ? STATUS_COLOR[statusKey] : undefined;
  const statusLabel =
    statusKey === "succeeded"
      ? t("runs.status.succeeded")
      : statusKey === "no_findings"
        ? t("runs.status.noFindings")
        : statusKey === "failed"
          ? t("runs.status.failed")
          : statusKey === "running"
            ? t("runs.status.running")
            : null;

  return (
    <div style={s.row}>
      <div style={s.rowRepo}>
        <Icon.GitBranch size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="mono" style={s.rowRepoName}>
          {installation.repo}
        </span>
      </div>
      <div style={s.rowRight}>
        <Badge icon="Workflow">{t(TARGET_LABEL_KEYS[installation.target_type])}</Badge>
        {statusLabel && statusColors && (
          <Badge dot color={statusColors.color} bg={statusColors.bg}>
            {statusLabel}
          </Badge>
        )}
        <span style={s.rowTime}>{relativeTimeAgo(latest?.ran_at)}</span>
      </div>
    </div>
  );
}

/**
 * CI tab (design/01) — installation list + the Export Wizard entry points
 * (AC-20/21/22) and the Fail-CI-on / version settings (AC-41/42, not in the
 * mockup — persists via the EXISTING update-agent write path, no new route).
 */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const tAgents = useTranslations("agents");
  const { activeRepo } = useActiveRepo();
  const { data: installations, isLoading } = useCiInstallations(agent.id);
  const { data: runs } = useCiRuns();
  const update = useUpdateAgent();

  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const list = installations ?? [];
  const latestByInstallation = React.useMemo(() => latestRunByInstallation(runs), [runs]);

  const ciFailOnOptions = React.useMemo(
    () => CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: tAgents(`config.ciFailOnOptions.${v}`) })),
    [tAgents],
  );

  function handleCiFailOnChange(v: CiFailOn) {
    setCiFailOn(v);
    update.mutate({ id: agent.id, patch: { ci_fail_on: v } });
  }

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <div style={s.headerTitleGroup}>
          {/* No matching key in ci.json's (stale) `ciTab` namespace for this
              exact design copy — hardcoded per the established "hardcode when
              the owning i18n file isn't in this task's Owned paths" pattern. */}
          <span style={s.title}>CI deployment</span>
          <Badge dot color="var(--ok)" bg="var(--ok-bg)">
            {`Active in ${list.length} ${list.length === 1 ? "repo" : "repos"}`}
          </Badge>
        </div>
        <div style={s.headerActions}>
          {/* Both header buttons open the SAME wizard, so show exactly one that
              matches state: "Add to CI" before the first deployment, and
              "Update CI config" once at least one installation exists (adding
              MORE repos when deployed is handled by the "Add repository" row
              below, so a header "Add to CI" would be redundant there). */}
          {list.length === 0 ? (
            <Button kind="primary" icon="Plus" onClick={() => setWizardOpen(true)}>
              Add to CI
            </Button>
          ) : (
            <Button kind="primary" icon="RefreshCw" onClick={() => setWizardOpen(true)}>
              Update CI config
            </Button>
          )}
        </div>
      </div>

      {!isLoading && list.length === 0 && <div style={s.empty}>Not deployed to CI yet.</div>}

      <div style={s.list}>
        {list.map((installation) => (
          <InstallationRow
            key={installation.id}
            installation={installation}
            latest={latestByInstallation.get(installation.id)}
            t={t}
          />
        ))}
      </div>

      <button type="button" style={s.addRow} onClick={() => setWizardOpen(true)}>
        <Icon.Plus size={14} />
        Add repository
      </button>

      <div style={s.settingsPanel}>
        <div style={s.settingsRow}>
          <div style={s.settingsField}>
            <FormField label={tAgents("config.ciFailOn")} hint={tAgents("config.ciFailOnHint")}>
              <Select value={ciFailOn} onChange={handleCiFailOnChange} options={ciFailOnOptions} />
            </FormField>
          </div>
          <span style={s.versionNote}>{`v${agent.version}`}</span>
        </div>
      </div>

      {wizardOpen && activeRepo && (
        <ExportWizard agent={agent} repo={activeRepo} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
