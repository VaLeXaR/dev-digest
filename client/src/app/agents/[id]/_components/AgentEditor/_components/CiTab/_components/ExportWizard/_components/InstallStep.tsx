"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Icon } from "@devdigest/ui";
import type { InstallMethod } from "../constants";
import { s } from "../styles";

/** Step 4 — Install (design/05-wizard-4-install.png). Open-PR is recommended
    and calls `useExportCi` with `action=open_pr`, surfacing `pr_url` on
    success (AC-11); Copy-as-zip calls `action=files` and downloads a real
    client-built .zip without opening a PR (AC-12, `zip.ts` — no zip
    dependency exists in this package). */
export function InstallStep({
  repo,
  filesCount,
  installMethod,
  onChangeMethod,
  prUrl,
  zipDownloaded,
  installing,
  onBack,
  onInstall,
}: {
  repo: string;
  filesCount: number;
  installMethod: InstallMethod;
  onChangeMethod: (m: InstallMethod) => void;
  prUrl: string | null;
  zipDownloaded: boolean;
  installing: boolean;
  onBack: () => void;
  onInstall: () => void;
}) {
  const t = useTranslations("ci");
  const done = prUrl !== null || zipDownloaded;

  return (
    <div style={s.body}>
      {prUrl ? (
        <div style={s.successBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />
            <strong>Pull request opened</strong>
          </div>
          <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.docsLink}>
            View pull request →
          </a>
        </div>
      ) : zipDownloaded ? (
        <div style={s.successBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />
            <strong>Files downloaded</strong>
          </div>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            Add the extracted files to {repo} manually, then commit and push.
          </span>
        </div>
      ) : (
        <>
          <button
            type="button"
            style={s.installCard(installMethod === "open_pr")}
            onClick={() => onChangeMethod("open_pr")}
          >
            <div style={s.installCardHeader}>
              <Icon.GitPullRequest size={16} style={{ color: "var(--accent)" }} />
              <span style={s.installCardTitle}>{t("exportWizard.installCardTitle")}</span>
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.recommended")}</Badge>
            </div>
            <span style={s.installCardDesc}>
              {t("exportWizard.installCardBody", { repo, count: filesCount })}
            </span>
          </button>

          <button
            type="button"
            style={s.installCard(installMethod === "zip")}
            onClick={() => onChangeMethod("zip")}
          >
            <div style={s.installCardHeader}>
              <Icon.Copy size={16} style={{ color: "var(--text-muted)" }} />
              <span style={s.installCardTitle}>Copy files as a zip</span>
              <span style={s.installCardTrailing}>add them manually</span>
            </div>
          </button>

          <a
            href="https://docs.github.com/en/actions"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.docsLink, alignSelf: "center", marginTop: 4 }}
          >
            GitHub Action setup docs →
          </a>
        </>
      )}

      <div style={{ ...s.footer, marginTop: "auto", paddingTop: 20 }}>
        <Button kind="secondary" icon="ChevronLeft" onClick={onBack} disabled={done}>
          {t("exportWizard.back")}
        </Button>
        <div style={s.footerRight}>
          {!done && (
            <Button kind="primary" icon="Check" onClick={onInstall} loading={installing}>
              {installing ? t("exportWizard.installing") : t("exportWizard.install")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
