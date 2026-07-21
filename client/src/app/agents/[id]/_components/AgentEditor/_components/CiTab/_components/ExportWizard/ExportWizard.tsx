"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ExportWizardSteps } from "@devdigest/ui";
import type { Agent, CiExportInputBody, CiFile, Repo } from "@devdigest/shared";
import { useExportCi } from "../../../../../../../../../lib/hooks/ci";
import { useToast } from "../../../../../../../../../lib/toast";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import {
  DEFAULT_TRIGGERS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_PREVIEW,
  STEP_TARGET,
  type InstallMethod,
  type PostAs,
  type TriggerId,
} from "./constants";
import { buildZip, downloadBlob } from "./zip";
import { s } from "./styles";

const TARGET: "gha" = "gha";

function pickDefaultPath(files: CiFile[]): string | null {
  return files.find((f) => f.editable)?.path ?? files[0]?.path ?? null;
}

/**
 * The 4-step Export Wizard (design/02–05) — Target → Preview → Configure →
 * Install. The target repo is ALWAYS the active repo (REC-3, `repo` prop) —
 * there is no free-text repo field anywhere in these steps.
 */
export function ExportWizard({
  agent,
  repo,
  onClose,
}: {
  agent: Agent;
  repo: Repo;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const toast = useToast();
  const qc = useQueryClient();
  const exportCi = useExportCi(agent.id);

  const [step, setStep] = React.useState(STEP_TARGET);
  const [triggers, setTriggers] = React.useState<TriggerId[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [files, setFiles] = React.useState<CiFile[]>([]);
  const [previewLoaded, setPreviewLoaded] = React.useState(false);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [editedWorkflow, setEditedWorkflow] = React.useState<string | null>(null);
  const [showRegenerateWarning, setShowRegenerateWarning] = React.useState(false);
  const [installMethod, setInstallMethod] = React.useState<InstallMethod>("open_pr");
  const [prUrl, setPrUrl] = React.useState<string | null>(null);
  const [zipDownloaded, setZipDownloaded] = React.useState(false);

  // Derived, not stored: the workflow is "edited" exactly while an edited copy exists.
  const workflowEdited = editedWorkflow !== null;

  const stepLabels = [
    t("exportWizard.steps.target"),
    t("exportWizard.steps.preview"),
    t("exportWizard.steps.configure"),
    t("exportWizard.steps.install"),
  ];

  function buildInput(
    action: "files" | "open_pr",
    overrides?: Partial<Pick<CiExportInputBody, "triggers" | "post_as">>,
  ): CiExportInputBody {
    return {
      repo: repo.full_name,
      target: TARGET,
      action,
      post_as: overrides?.post_as ?? postAs,
      triggers: overrides?.triggers ?? triggers,
      base: repo.default_branch,
    };
  }

  async function regenerate(overrides?: Partial<Pick<CiExportInputBody, "triggers" | "post_as">>) {
    try {
      const result = await exportCi.mutateAsync(buildInput("files", overrides));
      setFiles(result.files);
      setPreviewLoaded(true);
      setSelectedPath((prev) => (prev && result.files.some((f) => f.path === prev) ? prev : pickDefaultPath(result.files)));
      setEditedWorkflow(null);
    } catch {
      toast.error("Could not generate the CI files.");
    }
  }

  function handleContinueFromTarget() {
    setStep(STEP_PREVIEW);
    if (!previewLoaded) void regenerate();
  }

  function handleEditWorkflow(v: string) {
    setEditedWorkflow(v);
  }

  function handleToggleTrigger(id: TriggerId) {
    const next = triggers.includes(id) ? triggers.filter((x) => x !== id) : [...triggers, id];
    setTriggers(next);
    setShowRegenerateWarning(workflowEdited);
    void regenerate({ triggers: next });
  }

  function handleChangePostAs(v: PostAs) {
    setPostAs(v);
    setShowRegenerateWarning(workflowEdited);
    void regenerate({ post_as: v });
  }

  async function handleInstall() {
    if (installMethod === "open_pr") {
      try {
        const result = await exportCi.mutateAsync(buildInput("open_pr"));
        setPrUrl(result.pr_url);
        qc.invalidateQueries({ queryKey: ["ci-installations", agent.id] });
        qc.invalidateQueries({ queryKey: ["ci-runs"] });
      } catch {
        toast.error("Could not open the pull request.");
      }
    } else {
      try {
        const result = await exportCi.mutateAsync(buildInput("files"));
        downloadBlob(
          buildZip(result.files.map((f) => ({ path: f.path, contents: f.contents }))),
          "devdigest-ci.zip",
        );
        setZipDownloaded(true);
      } catch {
        toast.error("Could not generate the CI files.");
      }
    }
  }

  return (
    <Modal
      width={860}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
    >
      <div style={s.stepsBar}>
        <ExportWizardSteps step={step} labels={stepLabels} />
      </div>

      {step === STEP_TARGET && <TargetStep target={TARGET} onContinue={handleContinueFromTarget} />}

      {step === STEP_PREVIEW && (
        <PreviewStep
          files={files}
          loading={exportCi.isPending}
          selectedPath={selectedPath}
          onSelectPath={setSelectedPath}
          editedWorkflow={editedWorkflow}
          onEditWorkflow={handleEditWorkflow}
          onBack={() => setStep(STEP_TARGET)}
          onContinue={() => setStep(STEP_CONFIGURE)}
        />
      )}

      {step === STEP_CONFIGURE && (
        <ConfigureStep
          triggers={triggers}
          onToggleTrigger={handleToggleTrigger}
          postAs={postAs}
          onChangePostAs={handleChangePostAs}
          showRegenerateWarning={showRegenerateWarning}
          onBack={() => setStep(STEP_PREVIEW)}
          onContinue={() => setStep(STEP_INSTALL)}
        />
      )}

      {step === STEP_INSTALL && (
        <InstallStep
          repo={repo.full_name}
          filesCount={files.length}
          installMethod={installMethod}
          onChangeMethod={setInstallMethod}
          prUrl={prUrl}
          zipDownloaded={zipDownloaded}
          installing={exportCi.isPending}
          onBack={() => setStep(STEP_CONFIGURE)}
          onInstall={handleInstall}
        />
      )}
    </Modal>
  );
}
