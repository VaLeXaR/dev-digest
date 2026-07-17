"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Modal, FormField, TextInput, Button, Badge, Toggle, Tabs, Icon } from "@devdigest/ui";
import type { EvalCase, EvalCaseInput, EvalRunRecord } from "@devdigest/shared";
import { ExpectedFinding } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useCreateSkillEvalCase,
  useCreateEvalCaseFromFinding,
  usePreviewEvalRunFromFinding,
  useUpdateEvalCase,
  useRunEvalCase,
  type CreateEvalCaseInput,
} from "../../../lib/hooks/eval";
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

/** Render a run's produced findings for the read-only "Actual output" panel — "[]" when never run. */
function formatActualOutput(actual: unknown): string {
  if (actual == null) return "[]";
  try {
    return JSON.stringify(actual, null, 2);
  } catch {
    return String(actual);
  }
}

/**
 * The owning agent or skill this case belongs to — carries the display fields
 * the editor actually reads (`name` for the subtitle) plus enough to scope
 * create/update/run through the owner-generic hooks (T-07).
 */
export interface EvalCaseEditorOwner {
  kind: "agent" | "skill";
  id: string;
  name: string;
}

/**
 * New/edit eval-case modal (design/05), owner-generic (agent or skill — R3,
 * T-07 generalization of the original agent-only editor). When editing an
 * existing case the Diff/Files/PR-meta inputs are a READ-ONLY view of the
 * captured fixture — only the Expected output (the assertion) is tuned. In
 * new-case mode they stay editable (G10) so a case can still be hand-authored
 * without a source finding. Save is disabled while the expected-output JSON is
 * invalid (R13/AC-19).
 */
export function EvalCaseEditor({
  owner,
  existingCase,
  seed,
  fromFinding,
  initialLastRun,
  onClose,
}: {
  owner: EvalCaseEditorOwner;
  existingCase?: EvalCase;
  /** Pre-filled fixture for a NOT-yet-persisted case (the "Turn into eval case"
   *  seed modal, screen 2). Mutually exclusive with `existingCase`. */
  seed?: EvalCaseInput;
  /** Present in seed mode: the finding this new case is derived from. Save then
   *  persists via `from-finding` (which links + re-snapshots server-side). */
  fromFinding?: { findingId: string };
  /** The case's persisted last run, shown immediately on open (design/05). */
  initialLastRun?: EvalRunRecord;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  // Both create hooks are always instantiated (Rules of Hooks) — only the one
  // matching `owner.kind` is ever invoked. Reuse the owner-agnostic update/run
  // hooks unchanged for both owner kinds (mirrors T-06's hooks-file decision).
  const createAgentCase = useCreateEvalCase(owner.kind === "agent" ? owner.id : "");
  const createSkillCase = useCreateSkillEvalCase(owner.kind === "skill" ? owner.id : "");
  const createFromFinding = useCreateEvalCaseFromFinding(owner.kind === "agent" ? owner.id : "");
  const previewRun = usePreviewEvalRunFromFinding(fromFinding?.findingId ?? "");
  const update = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  // Initial form state comes from an existing case (edit) or a finding-derived
  // seed (screen 2) — whichever is present.
  const src = existingCase ?? seed;
  const [caseId, setCaseId] = React.useState<string | undefined>(existingCase?.id);
  const [name, setName] = React.useState(src?.name ?? "");
  const [inputDiff, setInputDiff] = React.useState(src?.input_diff ?? "");
  const [inputFilesText, setInputFilesText] = React.useState(
    src?.input_files != null ? JSON.stringify(src.input_files, null, 2) : "",
  );
  const [inputMetaText, setInputMetaText] = React.useState(
    src?.input_meta != null ? JSON.stringify(src.input_meta, null, 2) : "",
  );
  const [expectedOutputText, setExpectedOutputText] = React.useState(
    JSON.stringify(src?.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [activeInputTab, setActiveInputTab] = React.useState<InputTabKey>("diff");
  const [lastRun, setLastRun] = React.useState<EvalRunRecord | null>(() => initialLastRun ?? null);

  // The input fixture is immutable when editing an existing case (design/05) OR
  // when seeded from a finding — in both cases the server owns the snapshot, so
  // only the Expected output assertion (and name) is editable.
  const readOnlyInput = existingCase != null || fromFinding != null;

  const parsedExpected = React.useMemo(
    () => parseExpectedOutput(expectedOutputText),
    [expectedOutputText],
  );
  const isValidJson = parsedExpected !== null;

  // Display-only case-type indicator (design/05): a case is NEGATIVE ("must not
  // flag") until it carries at least one `must_find` expectation, at which point
  // it flips POSITIVE ("must find"). Derived, never an editable control — while
  // the JSON is mid-edit and unparseable we fall back to the persisted output.
  const effectiveExpected = parsedExpected ?? existingCase?.expected_output ?? [];
  const isNegativeCase = !effectiveExpected.some((e) => e.type === "must_find");

  // Case-type sub-label spells out the primary expectation, e.g.
  // `MUST find "Missing authentication in API calls" at client/src/lib/api.ts:9`
  // (design/05). Falls back to the generic verb when there is no titled entry
  // (an empty precision case, or a hand-authored entry with no title).
  const primaryExpectation =
    effectiveExpected.find((e) => (isNegativeCase ? e.type === "must_not_flag" : e.type === "must_find")) ??
    effectiveExpected[0];
  const caseTypeSubText = primaryExpectation?.title
    ? t(isNegativeCase ? "caseEditor.mustNotFlagAt" : "caseEditor.mustFindAt", {
        title: primaryExpectation.title,
        location: `${primaryExpectation.file}:${primaryExpectation.start_line}`,
      })
    : t(isNegativeCase ? "caseEditor.mustNotFlag" : "caseEditor.mustFind");

  const saving =
    createAgentCase.isPending ||
    createSkillCase.isPending ||
    createFromFinding.isPending ||
    update.isPending;
  const running = runCase.isPending || previewRun.isPending;
  const busy = saving || running;

  // The owner-agnostic update/run hooks scope invalidation via an optional
  // `agentId` — only meaningful for an agent owner; a skill owner passes
  // `undefined` (T-06 already keeps these hooks agent-scoped-only).
  const agentScopeId = owner.kind === "agent" ? owner.id : undefined;

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
      // Only the assertion (name + expected output) is editable on an existing
      // case — its input fixture is read-only. PATCH just those fields; never
      // re-send the immutable `input_diff`/`input_files` snapshot, which for a
      // large PR exceeds the server's 1 MiB body limit (413 "body too large").
      const saved = await update.mutateAsync({
        id: caseId,
        patch: { name: payload.name, expected_output: payload.expected_output },
        agentId: agentScopeId,
      });
      return saved.id;
    }
    // Seed mode (screen 2): persist via `from-finding` so the case is LINKED to
    // its finding and the fixture is re-snapshotted server-side. Only the
    // editable name/expected-output are sent as overrides.
    if (fromFinding) {
      const created = await createFromFinding.mutateAsync({
        finding_id: fromFinding.findingId,
        name: payload.name,
        expected_output: payload.expected_output,
      });
      setCaseId(created.id);
      return created.id;
    }
    const created =
      owner.kind === "skill"
        ? await createSkillCase.mutateAsync(payload)
        : await createAgentCase.mutateAsync(payload);
    setCaseId(created.id);
    return created.id;
  }

  async function runAndCapture(id: string) {
    const record = await runCase.mutateAsync({
      caseId: id,
      agentId: agentScopeId,
      caseName: name.trim() || undefined,
      // The modal shows the result inline (run banner) — no redundant toast.
      silent: true,
    });
    setLastRun(record);
  }

  async function handleRunCase() {
    if (!isValidJson) return;
    // Seed mode (unsaved from-finding case): run WITHOUT persisting anything —
    // the server rebuilds the fixture from the finding and scores against the
    // current expected output, but writes no eval case and no run row. Only
    // Save creates the case; only saved cases get persisted runs.
    if (fromFinding && !caseId) {
      const record = await previewRun.mutateAsync({ expected_output: parsedExpected ?? [] });
      setLastRun(record);
      return;
    }
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

  // Full-width run-RESULT banner (design/05), shown above the footer buttons.
  // No separate "running" line — the Run button's own spinner is the in-flight
  // indicator, so the banner only ever shows the last completed run's result.
  const runBanner = lastRun ? (
    <div style={s.resultLine(lastRun.pass ?? false)}>
      {lastRun.pass ? (
        <Icon.Check size={14} style={s.resultIcon(true)} />
      ) : (
        <Icon.XCircle size={14} style={s.resultIcon(false)} />
      )}
      <span style={s.resultLabel}>
        {lastRun.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")}
      </span>
      <span style={s.resultDetail}>
        {` · ${t("caseEditor.casesPassed", { passed: lastRun.pass ? 1 : 0, total: 1 })} · ${
          lastRun.duration_ms != null ? (lastRun.duration_ms / 1000).toFixed(1) : "—"
        }s · ${lastRun.cost_usd != null ? `$${lastRun.cost_usd.toFixed(2)}` : "—"}`}
      </span>
    </div>
  ) : null;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={existingCase ? t("caseEditor.caseTitle", { name: name.trim() || "Untitled" }) : t("caseEditor.newCase")}
      subtitle={
        fromFinding
          ? isNegativeCase
            ? t("caseEditor.seededFromDismissed")
            : t("caseEditor.seededFromAccepted")
          : `${owner.name} · simulate a PR and assert the expected output`
      }
      onClose={onClose}
      footer={
        <div style={s.footerCol}>
          {runBanner}
          <div style={s.footer}>
            <label style={s.footerToggle}>
              <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
              Run on save
            </label>
            <div style={s.footerButtons}>
              <Button kind="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button kind="secondary" icon="Play" loading={running} onClick={handleRunCase} disabled={!isValidJson || busy}>
                {running ? t("caseEditor.running") : t("caseEditor.runCase")}
              </Button>
              <Button kind="primary" icon="Check" loading={saving} onClick={handleSave} disabled={!isValidJson || busy}>
                {saving ? t("caseEditor.saving") : t("caseEditor.save")}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.col}>
          <div style={s.caseTypeBadge(isNegativeCase)} aria-label="Case type">
            <div style={s.caseTypeLabel(isNegativeCase)}>
              {isNegativeCase ? t("caseEditor.negativeCase") : t("caseEditor.positiveCase")}
            </div>
            <div style={s.caseTypeSub}>{caseTypeSubText}</div>
          </div>
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
            style={{ ...s.textarea, ...s.expectedTextarea }}
            rows={6}
          />
          <div style={{ ...s.sectionTitle, marginTop: 16 }}>{t("caseEditor.actualOutput")}</div>
          <pre className="mono" aria-label="Actual output" aria-readonly="true" style={s.actualOutputBox}>
            {formatActualOutput(lastRun?.actual_output)}
          </pre>
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
      rows={6}
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
