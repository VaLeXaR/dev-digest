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

/**
 * New/edit eval-case modal (design/05). Diff/Files/PR-meta inputs are editable in
 * both modes (G10) so a case can be hand-authored without a source finding. Save
 * is disabled while the expected-output JSON is invalid (R13/AC-19).
 */
export function EvalCaseEditor({
  agent,
  existingCase,
  onClose,
}: {
  agent: Agent;
  existingCase?: EvalCase;
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
  const [lastRun, setLastRun] = React.useState<LastRunDisplay | null>(null);

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
    const expectedCount = (parsedExpected ?? []).filter((e) => e.type === "must_find").length;
    const record = await runCase.mutateAsync({ caseId: id, agentId: agent.id });
    const gotCount = Array.isArray(record.actual_output) ? record.actual_output.length : 0;
    setLastRun({ record, expectedCount, gotCount });
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

  function toggleEntryType(index: number) {
    if (!parsedExpected) return;
    const next = parsedExpected.map((entry, i) =>
      i === index
        ? { ...entry, type: entry.type === "must_find" ? ("must_not_flag" as const) : ("must_find" as const) }
        : entry,
    );
    setExpectedOutputText(JSON.stringify(next, null, 2));
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
            <textarea
              className="mono"
              aria-label="Diff input"
              value={inputDiff}
              onChange={(e) => setInputDiff(e.target.value)}
              placeholder={t("caseEditor.diffPlaceholder")}
              style={s.textarea}
              rows={16}
            />
          )}
          {activeInputTab === "files" && (
            <textarea
              className="mono"
              aria-label="Files input"
              value={inputFilesText}
              onChange={(e) => setInputFilesText(e.target.value)}
              placeholder="[]"
              style={s.textarea}
              rows={16}
            />
          )}
          {activeInputTab === "prMeta" && (
            <textarea
              className="mono"
              aria-label="PR meta input"
              value={inputMetaText}
              onChange={(e) => setInputMetaText(e.target.value)}
              placeholder="{}"
              style={s.textarea}
              rows={16}
            />
          )}
        </div>

        <div style={s.col}>
          <div style={s.sectionHeaderRow}>
            <span style={s.sectionTitle}>{t("caseEditor.expectedOutput")}</span>
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
          {parsedExpected && parsedExpected.length > 0 && (
            <div style={s.entriesWrap}>
              {parsedExpected.map((entry, i) => (
                <div key={i} style={s.entryRow}>
                  <span className="mono" style={s.entryPath}>
                    {entry.file || "(no file)"}:{entry.start_line}-{entry.end_line}
                  </span>
                  <button
                    type="button"
                    aria-label={`Toggle expectation ${i + 1} type`}
                    onClick={() => toggleEntryType(i)}
                    style={s.entryTypeBadge(entry.type)}
                  >
                    {entry.type}
                  </button>
                </div>
              ))}
            </div>
          )}
          {lastRun && (
            <div style={s.resultLine(lastRun.record.pass ?? false)}>
              {lastRun.record.pass ? <Icon.Check size={14} /> : <Icon.XCircle size={14} />}
              <span>
                {lastRun.record.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")} · expected{" "}
                {lastRun.expectedCount} finding{lastRun.expectedCount === 1 ? "" : "s"}, got {lastRun.gotCount} ·{" "}
                {lastRun.record.duration_ms != null ? (lastRun.record.duration_ms / 1000).toFixed(1) : "—"}s ·{" "}
                {lastRun.record.cost_usd != null ? `$${lastRun.record.cost_usd.toFixed(2)}` : "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
