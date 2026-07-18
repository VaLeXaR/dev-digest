"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, TextInput, Icon } from "@devdigest/ui";
import type { EvalCodeMode } from "@devdigest/shared";
import { DiffView } from "../DiffView/DiffView";
import { s } from "./styles";

export type SkillInputTabKey = "code" | "prMeta";

export interface SkillInputPanesProps {
  activeTab: SkillInputTabKey;
  onTabChange: (tab: SkillInputTabKey) => void;
  mode: EvalCodeMode;
  onModeChange: (mode: EvalCodeMode) => void;
  before: string;
  onBeforeChange: (v: string) => void;
  after: string;
  onAfterChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  generatedDiff: string;
  readOnly: boolean;
}

/**
 * SKILL owner's Input area — `Code` (New file / Modified file sub-tabs +
 * "Preview generated diff" disclosure) and `PR meta` (Title/Body form
 * fields). Controlled by the shell (T-07): no data hooks, no local
 * persistence state — the disclosure's open/closed flag is the only local
 * state this component owns, and it is pure view state, not form data.
 *
 * R17: there is NO legacy fallback. A skill case with a persisted diff but no
 * `code_mode` is unreachable by any data (verified against the live DB), so
 * this component never renders a "legacy diff" branch and takes no
 * `legacyDiff` prop.
 */
export function SkillInputPanes({
  activeTab,
  onTabChange,
  mode,
  onModeChange,
  before,
  onBeforeChange,
  after,
  onAfterChange,
  title,
  onTitleChange,
  body,
  onBodyChange,
  generatedDiff,
  readOnly,
}: SkillInputPanesProps) {
  const t = useTranslations("eval");
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const mainTabs = [
    { key: "code", label: t("caseEditor.tabs.code") },
    { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
  ];

  return (
    <div>
      <div style={s.mainTabsWrap}>
        <Tabs tabs={mainTabs} value={activeTab} onChange={(k) => onTabChange(k as SkillInputTabKey)} pad="0" />
      </div>

      {activeTab === "code" && (
        <div>
          <div style={s.subTabsRow}>
            <button
              type="button"
              style={s.subTabButton(mode === "new_file", readOnly)}
              onClick={readOnly ? undefined : () => onModeChange("new_file")}
            >
              {t("caseEditor.codeTab.newFile")}
            </button>
            <button
              type="button"
              style={s.subTabButton(mode === "modified_file", readOnly)}
              onClick={readOnly ? undefined : () => onModeChange("modified_file")}
            >
              {t("caseEditor.codeTab.modifiedFile")}
            </button>
          </div>

          {mode === "modified_file" && (
            <div style={s.fieldGap}>
              <div style={s.fieldLabel}>{t("caseEditor.codeTab.beforeLabel")}</div>
              <CodeField
                ariaLabel="Before code"
                value={before}
                onChange={onBeforeChange}
                placeholder={t("caseEditor.codeTab.beforePlaceholder")}
                readOnly={readOnly}
              />
            </div>
          )}

          <div style={s.fieldGap}>
            <div style={s.fieldLabel}>{t("caseEditor.codeTab.afterLabel")}</div>
            <CodeField
              ariaLabel="After code"
              value={after}
              onChange={onAfterChange}
              placeholder={t("caseEditor.codeTab.afterPlaceholder")}
              readOnly={readOnly}
            />
          </div>

          <button type="button" style={s.disclosureButton} onClick={() => setPreviewOpen((o) => !o)}>
            <Icon.ChevronRight size={13} style={s.disclosureChevron(previewOpen)} />
            {t("caseEditor.preview")}
          </button>
          {previewOpen && (
            <div style={s.disclosureBody}>
              <DiffView diff={generatedDiff} ariaLabel="Generated diff" />
            </div>
          )}
        </div>
      )}

      {activeTab === "prMeta" && (
        <div>
          <div style={s.prMetaField}>
            <div style={s.fieldLabel}>{t("caseEditor.titleLabel")}</div>
            {readOnly ? (
              <ReadOnlyField ariaLabel="PR title" value={title} />
            ) : (
              <TextInput
                aria-label="PR title"
                value={title}
                onChange={onTitleChange}
                placeholder={t("caseEditor.titlePlaceholder")}
              />
            )}
          </div>
          <div>
            <div style={s.fieldLabel}>{t("caseEditor.bodyLabel")}</div>
            {readOnly ? (
              <ReadOnlyField ariaLabel="PR body" value={body} />
            ) : (
              <textarea
                className="mono"
                aria-label="PR body"
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                placeholder={t("caseEditor.bodyPlaceholder")}
                style={s.textarea}
                rows={5}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One Code-tab field (Before/After). Editable `<textarea className="mono">`
 * when `!readOnly`; a read-only `<pre>` view when `readOnly` (C1), mirroring
 * the agent branch's `InputField` split (`EvalCaseEditor.tsx:405-439`).
 */
function CodeField({
  ariaLabel,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly: boolean;
}) {
  if (readOnly) return <ReadOnlyField ariaLabel={ariaLabel} value={value} />;
  return (
    <textarea
      className="mono"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={s.textarea}
      rows={6}
    />
  );
}

/** Shared read-only view for Code and PR-meta fields — plain monospace text, "—" when empty. */
function ReadOnlyField({ ariaLabel, value }: { ariaLabel: string; value: string }) {
  return (
    <pre className="mono" aria-label={ariaLabel} aria-readonly="true" style={s.readonlyView}>
      {value.trim() ? value : <span style={s.readonlyEmpty}>—</span>}
    </pre>
  );
}
