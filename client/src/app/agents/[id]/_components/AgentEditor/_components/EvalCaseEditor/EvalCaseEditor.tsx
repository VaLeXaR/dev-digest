"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Modal, FormField, TextInput, Button, Badge, Toggle, Tabs, Icon } from "@devdigest/ui";
import type { Agent, EvalCase, EvalRunRecord } from "@devdigest/shared";
import { ExpectedFinding } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useUpdateEvalCase,
  useRunEvalCase,
  type CreateEvalCaseInput,
} from "../../../../../../../lib/hooks/eval";
import { findingSkeleton, MODAL_WIDTH, type InputTabKey } from "./constants";
import { s } from "./styles";

/** Schema for validating/parsing the "Expected output" textarea (R13/AC-19). */
const ExpectedOutputArray = z.array(ExpectedFinding);

/** Anything not valid JSON, or valid JSON but not an `ExpectedFinding[]`, is falsy. */
function parseExpectedOutput(text: string): ExpectedFinding[] | null {
  try {
    const json: unknown = JSON.parse(text);
    const result = ExpectedOutputArray.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Files/PR-meta are optional free-form JSON — fall back to the raw string if it doesn't parse. */
function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

interface LastRunDisplay {
  record: EvalRunRecord;
  expectedCount: number;
  gotCount: number;
}

/** Build the inline result-line display from a run record + the case's expected output. */
function lastRunDisplayFrom(record: EvalRunRecord, expected: ExpectedFinding[]): LastRunDisplay {
  return {
    record,
    expectedCount: expected.filter((e) => e.type === "must_find").length,
    gotCount: Array.isArray(record.actual_output) ? record.actual_output.length : 0,
  };
}

/**
 * New/edit eval-case modal (design/05). When editing an existing case the
 * Diff/Files/PR-meta inputs are a READ-ONLY view of the captured fixture — only
 * the Expected output (the assertion) is tuned. In new-case mode they stay
 * editable (G10) so a case can still be hand-authored without a source finding.
 * Save is disabled while the expected-output JSON is invalid (R13/AC-19).
 */
export function EvalCaseEditor({
  agent,
  existingCase,
  initialLastRun,
  onClose,
}: {
  agent: Agent;
  existingCase?: EvalCase;
  /** The case's persisted last run, shown immediately on open (design/05). */
  initialLastRun?: EvalRunRecord;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const create = useCreateEvalCase(agent.id);
  const update = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  const [caseId, setCaseId] = React.useState<string | undefined>(existingCase?.id);
  const [name, setName] = React.useState(existingCase?.name ?? "");
  const [inputDiff, setInputDiff] = React.useState(existingCase?.input_diff ?? "");
  const [inputFilesText, setInputFilesText] = React.useState(
    existingCase?.input_files != null ? JSON.stringify(existingCase.input_files, null, 2) : "",
  );
  const [inputMetaText, setInputMetaText] = React.useState(
    existingCase?.input_meta != null ? JSON.stringify(existingCase.input_meta, null, 2) : "",
  );
  const [expectedOutputText, setExpectedOutputText] = React.useState(
    JSON.stringify(existingCase?.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [activeInputTab, setActiveInputTab] = React.useState<InputTabKey>("diff");
  const [lastRun, setLastRun] = React.useState<LastRunDisplay | null>(() =>
    initialLastRun ? lastRunDisplayFrom(initialLastRun, existingCase?.expected_output ?? []) : null,
  );

  // Editing an existing case: the input fixture is immutable (design/05) — only
  // the Expected output assertion is editable. New-case mode keeps inputs open.
  const readOnlyInput = existingCase != null;

  const parsedExpected = React.useMemo(
    () => parseExpectedOutput(expectedOutputText),
    [expectedOutputText],
  );
  const isValidJson = parsedExpected !== null;

  const saving = create.isPending || update.isPending;
  const running = runCase.isPending;
  const busy = saving || running;

  function buildPayload(): CreateEvalCaseInput {
    return {
      name: name.trim(),
      input_diff: inputDiff,
      input_files: parseMaybeJson(inputFilesText),
      input_meta: parseMaybeJson(inputMetaText),
      expected_output: parsedExpected ?? [],
    };
  }

  /** Create-or-update from current form state; returns the persisted case id. */
  async function ensureSaved(): Promise<string> {
    const payload = buildPayload();
    if (caseId) {
      const saved = await update.mutateAsync({ id: caseId, patch: payload, agentId: agent.id });
      return saved.id;
    }
    const created = await create.mutateAsync(payload);
    setCaseId(created.id);
    return created.id;
  }

  async function runAndCapture(id: string) {
    const record = await runCase.mutateAsync({ caseId: id, agentId: agent.id });
    setLastRun(lastRunDisplayFrom(record, parsedExpected ?? []));
  }

  async function handleRunCase() {
    if (!isValidJson) return;
    const id = await ensureSaved();
    await runAndCapture(id);
  }

  async function handleSave() {
    if (!isValidJson) return;
    const id = await ensureSaved();
    if (runOnSave) await runAndCapture(id);
    onClose();
  }

  function addSkeleton() {
    const current = parsedExpected ?? [];
    setExpectedOutputText(JSON.stringify([...current, findingSkeleton()], null, 2));
  }

  const inputTabs = [
    { key: "diff", label: t("caseEditor.tabs.diff") },
    { key: "files", label: "Files" },
    { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
  ];

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("caseEditor.caseTitle", { name: name.trim() || "Untitled" })}
      subtitle={`${agent.name} · simulate a PR and assert the expected output`}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.footerToggle}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            Run on save
          </label>
          <div style={s.footerButtons}>
            <Button kind="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button kind="secondary" icon="Play" onClick={handleRunCase} disabled={!isValidJson || busy}>
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" icon="Check" onClick={handleSave} disabled={!isValidJson || busy}>
              {saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.col}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
          </FormField>
          <div style={s.sectionTitle}>{t("caseEditor.inputLabel")}</div>
          <div style={s.tabsWrap}>
            <Tabs
              tabs={inputTabs}
              value={activeInputTab}
              onChange={(k) => setActiveInputTab(k as InputTabKey)}
              pad="0"
            />
          </div>
          {activeInputTab === "diff" && (
            <InputField
              ariaLabel="Diff input"
              value={inputDiff}
              onChange={setInputDiff}
              placeholder={t("caseEditor.diffPlaceholder")}
              readOnly={readOnlyInput}
              highlightDiff
            />
          )}
          {activeInputTab === "files" && (
            <InputField
              ariaLabel="Files input"
              value={inputFilesText}
              onChange={setInputFilesText}
              placeholder="[]"
              readOnly={readOnlyInput}
            />
          )}
          {activeInputTab === "prMeta" && (
            <InputField
              ariaLabel="PR meta input"
              value={inputMetaText}
              onChange={setInputMetaText}
              placeholder="{}"
              readOnly={readOnlyInput}
            />
          )}
        </div>

        <div style={s.col}>
          <div style={s.sectionHeaderRow}>
            <span style={{ ...s.sectionTitle, marginBottom: 0 }}>{t("caseEditor.expectedOutput")}</span>
            <Badge
              icon={isValidJson ? "Check" : "XCircle"}
              color={isValidJson ? "var(--ok)" : "var(--crit)"}
              bg={isValidJson ? "var(--ok-bg)" : "var(--crit-bg)"}
            >
              {isValidJson ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
            </Badge>
            <div style={{ marginLeft: "auto" }}>
              <Button kind="secondary" size="sm" icon="Plus" onClick={addSkeleton}>
                Finding skeleton
              </Button>
            </div>
          </div>
          <textarea
            className="mono"
            aria-label="Expected output JSON"
            value={expectedOutputText}
            onChange={(e) => setExpectedOutputText(e.target.value)}
            style={s.textarea}
            rows={16}
          />
          {running ? (
            <div style={s.runningLine}>
              <Icon.RefreshCw size={14} style={s.runningIcon} />
              <span style={s.resultLabel}>{t("caseEditor.running")}</span>
            </div>
          ) : lastRun ? (
            <div style={s.resultLine(lastRun.record.pass ?? false)}>
              {lastRun.record.pass ? (
                <Icon.Check size={14} style={s.resultIcon(true)} />
              ) : (
                <Icon.XCircle size={14} style={s.resultIcon(false)} />
              )}
              <span style={s.resultLabel}>
                {lastRun.record.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")}
              </span>
              <span style={s.resultDetail}>
                {` · expected ${lastRun.expectedCount} finding${lastRun.expectedCount === 1 ? "" : "s"}, got ${lastRun.gotCount} · ${
                  lastRun.record.duration_ms != null ? (lastRun.record.duration_ms / 1000).toFixed(1) : "—"
                }s · ${lastRun.record.cost_usd != null ? `$${lastRun.record.cost_usd.toFixed(2)}` : "—"}`}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/**
 * One Input tab's content. Editable `<textarea>` in new-case mode; a read-only
 * view of the captured fixture when editing an existing case (design/05). The
 * diff tab renders syntax-highlighted (`highlightDiff`); Files/PR-meta stay plain.
 */
function InputField({
  ariaLabel,
  value,
  onChange,
  placeholder,
  readOnly,
  highlightDiff,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly: boolean;
  highlightDiff?: boolean;
}) {
  if (readOnly) {
    if (highlightDiff) return <DiffView diff={value} ariaLabel={ariaLabel} />;
    return (
      <pre className="mono" aria-label={ariaLabel} aria-readonly="true" style={s.readonlyView}>
        {value.trim() ? value : <span style={s.readonlyEmpty}>—</span>}
      </pre>
    );
  }
  return (
    <textarea
      className="mono"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={s.textarea}
      rows={16}
    />
  );
}

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

/** Classify one unified-diff line for coloring (order matters: headers before +/-). */
function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

/** Read-only, per-line syntax-highlighted unified diff (design/05). */
function DiffView({ diff, ariaLabel }: { diff: string; ariaLabel: string }) {
  const lines = diff.length > 0 ? diff.split("\n") : [];
  return (
    <div className="mono" aria-label={ariaLabel} aria-readonly="true" style={s.diffContainer}>
      {lines.length === 0 ? (
        <div style={{ ...s.diffLine("ctx"), color: "var(--text-muted)" }}>—</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} style={s.diffLine(classifyDiffLine(line))}>
            {line === "" ? " " : line}
          </div>
        ))
      )}
    </div>
  );
}
