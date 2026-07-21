"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Icon } from "@devdigest/ui";
import { useSecretsStatus } from "../../../../../../../../../../lib/hooks";
import { POST_AS_VALUES, TRIGGER_IDS, type PostAs, type TriggerId } from "../constants";
import { s } from "../styles";

const POST_AS_KEY: Record<PostAs, string> = {
  github_review: "exportWizard.postAs.githubReview",
  pr_comment: "exportWizard.postAs.prComment",
  none: "exportWizard.postAs.none",
};

/** Step 3 — Configure (design/04-wizard-3-configure.png): trigger chips
    (AC-7), expected-secrets list (AC-8, real status via `useSecretsStatus` for
    OPENROUTER_API_KEY — GITHUB_TOKEN is always "ready", auto-injected by
    Actions regardless of the studio's own GitHub PAT), Post-results-as radios
    (AC-9), the corrected block-merge callout (AC-45). Changing a trigger or
    post-as regenerates the workflow and, if Step 2 had local edits, warns
    they'll be overwritten (AC-47). */
export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onChangePostAs,
  showRegenerateWarning,
  onBack,
  onContinue,
}: {
  triggers: TriggerId[];
  onToggleTrigger: (id: TriggerId) => void;
  postAs: PostAs;
  onChangePostAs: (v: PostAs) => void;
  showRegenerateWarning: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");
  const { data: secretsStatus } = useSecretsStatus();
  const openRouterReady = secretsStatus?.openrouter ?? false;

  return (
    <div style={s.body}>
      {showRegenerateWarning && (
        <div style={s.regenerateWarning}>
          <Icon.AlertTriangle size={14} />
          Your Step 2 file edits were regenerated and overwritten by this change.
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("exportWizard.triggerLabel")}</div>
        <div style={s.chipRow}>
          {TRIGGER_IDS.map((id) => (
            <Chip
              key={id}
              active={triggers.includes(id)}
              icon={triggers.includes(id) ? "Check" : undefined}
              onClick={() => onToggleTrigger(id)}
            >
              {`pull_request:${id}`}
            </Chip>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>Secrets expected</div>
        <div style={s.secretRow}>
          <span className="mono" style={s.secretName}>OPENROUTER_API_KEY</span>
          <span style={s.secretDesc}>Your OpenRouter key</span>
          <span style={{ color: openRouterReady ? "var(--ok)" : "var(--warn)", fontSize: 12, fontWeight: 600 }}>
            {openRouterReady ? "● ready" : "● not set"}
          </span>
        </div>
        <div style={s.secretRow}>
          <span className="mono" style={s.secretName}>GITHUB_TOKEN</span>
          <span style={s.secretDesc}>Auto-provided by Actions</span>
          <span style={{ color: "var(--ok)", fontSize: 12, fontWeight: 600 }}>● ready</span>
        </div>
        <div style={s.secretNote}>{t("exportWizard.secretNote", { key: "these" })}</div>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("exportWizard.postResultsLabel")}</div>
        {POST_AS_VALUES.map((v) => (
          <div key={v} style={s.radioRow} onClick={() => onChangePostAs(v)}>
            <span style={s.radioDot(postAs === v)}>
              <span style={s.radioDotInner(postAs === v)} />
            </span>
            <span style={s.radioLabel}>{t(POST_AS_KEY[v])}</span>
            {v === "github_review" && (
              <span style={{ fontSize: 11, color: "var(--accent-text)" }}>{t("exportWizard.recommended")}</span>
            )}
          </div>
        ))}
      </div>

      <div style={s.callout}>
        <Icon.Info size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--text-muted)" }} />
        <span>{t("exportWizard.blockMergeDesc")}</span>
      </div>

      <div style={{ ...s.footer, marginTop: "auto", paddingTop: 20 }}>
        <Button kind="secondary" icon="ChevronLeft" onClick={onBack}>
          {t("exportWizard.back")}
        </Button>
        <div style={s.footerRight}>
          <Button kind="primary" iconRight="ArrowRight" onClick={onContinue}>
            {t("exportWizard.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
