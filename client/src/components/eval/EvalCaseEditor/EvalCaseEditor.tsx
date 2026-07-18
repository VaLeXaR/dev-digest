"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Modal, FormField, TextInput, Button, Badge, Toggle, Tabs, Icon } from "@devdigest/ui";
import type { EvalCase, EvalCaseInput, EvalCodeMode, EvalRunRecord } from "@devdigest/shared";
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
import { notify } from "../../../lib/toast";
import { findingSkeleton, findingSkillSkeleton, MODAL_WIDTH, type InputTabKey } from "./constants";
import { generateDiff } from "./generateDiff";
import { parseSkillExpectedOutput } from "./skillExpectedOutput";
import { SkillInputPanes } from "./_components/SkillInputPanes/SkillInputPanes";
import { DiffView } from "./_components/DiffView/DiffView";
import { s } from "./styles";

/** Schema for validating/parsing the "Expected output" textarea (R13/AC-19) — agent branch only (R11). */
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

/** Read a `title`/`body` string out of the case's `input_meta` (`z.unknown()`) — never cast (R9-adjacent defensiveness). */
function readMetaString(meta: unknown, key: "title" | "body"): string {
  if (typeof meta !== "object" || meta === null) return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** Whether a caught error is a deliberate `AbortController.abort()` rejection — swallow, don't toast (R8). */
function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err as { name?: string } | null | undefined)?.name === "AbortError"
  );
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
 * existing case the input fixture is a READ-ONLY view of the captured
 * snapshot — only the Expected output (the assertion) is tuned. In new-case
 * mode it stays editable (G10) so a case can still be hand-authored without a
 * source finding. Save is disabled while the expected-output JSON is invalid
 * (R13/AC-19).
 *
 * R1/R13: `owner.kind === "agent"` renders the original `Diff | Files | PR
 * meta` raw-textarea Input area, byte-identical to the pre-T-07 behaviour.
 * `owner.kind === "skill"` renders the `Code | PR meta` design instead
 * (`SkillInputPanes`) — no `Files` tab (R2), Before/After + generated-diff
 * preview (R3/R14), and a real Title/Body PR-meta form (R6).
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
   *  seed modal, screen 2). Mutually exclusive with `existingCase`. Agent-only (C2). */
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
  // SKILL Code tab source snippets + mode (R4). Default mode for a brand-new
  // case is "modified_file" (R15); an existing/seeded case seeds from its
  // persisted values.
  const [codeMode, setCodeMode] = React.useState<EvalCodeMode>(src?.code_mode ?? "modified_file");
  const [codeBefore, setCodeBefore] = React.useState(src?.code_before ?? "");
  const [codeAfter, setCodeAfter] = React.useState(src?.code_after ?? "");
  // SKILL PR-meta form fields, read defensively from `input_meta` (z.unknown()).
  const [metaTitle, setMetaTitle] = React.useState(() => readMetaString(src?.input_meta, "title"));
  const [metaBody, setMetaBody] = React.useState(() => readMetaString(src?.input_meta, "body"));
  const [expectedOutputText, setExpectedOutputText] = React.useState(
    JSON.stringify(src?.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [activeInputTab, setActiveInputTab] = React.useState<InputTabKey>(
    owner.kind === "skill" ? "code" : "diff",
  );
  const [lastRun, setLastRun] = React.useState<EvalRunRecord | null>(() => initialLastRun ?? null);

  // R7/R8: the ONE in-flight run's controller (if any). Only run mutations
  // ever register here — save mutations never do, which is what makes
  // "Cancel during a save aborts nothing" true by construction (aborting the
  // HTTP request cannot undo a committed INSERT).
  const abortRef = React.useRef<AbortController | null>(null);
  // R8: blocks Save for the duration of the fresh run a Run-on-save Save
  // triggers (distinct from `busy`/`saving`, which drive the OTHER button).
  const [saveRunInFlight, setSaveRunInFlight] = React.useState(false);

  // The input fixture is immutable when editing an existing case (design/05) OR
  // when seeded from a finding — in both cases the server owns the snapshot, so
  // only the Expected output assertion (and name) is editable.
  const readOnlyInput = existingCase != null || fromFinding != null;

  // R14: the single generated diff, used for BOTH the preview disclosure and
  // the persisted payload — never recomputed separately in buildPayload().
  const generatedDiff = React.useMemo(
    () => generateDiff({ mode: codeMode, before: codeBefore, after: codeAfter }),
    [codeMode, codeBefore, codeAfter],
  );

  // R10: an empty generated diff would run/score against no code at all (a
  // fake failure). Scoped to editable skill mode only — in edit mode
  // Before/After are read-only persisted values, so the diff is non-empty by
  // construction. The agent path keeps its current valid-JSON-only gate.
  const skillDiffEmpty = owner.kind === "skill" && !readOnlyInput && generatedDiff.trim() === "";

  // R11: the skill branch parses leniently (file/type default) and normalizes
  // to a full ExpectedFinding before it ever reaches the payload; the agent
  // branch keeps the strict parse, byte-identical to before (R1).
  const parsedExpected = React.useMemo(
    () =>
      owner.kind === "skill"
        ? parseSkillExpectedOutput(expectedOutputText)
        : parseExpectedOutput(expectedOutputText),
    [expectedOutputText, owner.kind],
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
    if (owner.kind === "skill") {
      const trimmedTitle = metaTitle.trim();
      const trimmedBody = metaBody.trim();
      const meta =
        trimmedTitle || trimmedBody
          ? { title: trimmedTitle || undefined, body: trimmedBody || undefined }
          : undefined;
      return {
        name: name.trim(),
        input_diff: generatedDiff,
        input_files: undefined,
        input_meta: meta,
        expected_output: parsedExpected ?? [],
        code_before: codeMode === "new_file" ? undefined : codeBefore,
        code_after: codeAfter,
        code_mode: codeMode,
      };
    }
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
      // re-send the immutable input snapshot (C1) — for a large PR (agent) or
      // a persisted before/after (skill) that would exceed the server's 1 MiB
      // body limit (413 "body too large").
      const saved = await update.mutateAsync({
        id: caseId,
        patch: { name: payload.name, expected_output: payload.expected_output },
        agentId: agentScopeId,
      });
      return saved.id;
    }
    // Seed mode (screen 2, agent-only per C2): persist via `from-finding` so
    // the case is LINKED to its finding and the fixture is re-snapshotted
    // server-side. Only the editable name/expected-output are sent as overrides.
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

  /** Runs the persisted case, registering an abortable controller (R7/R8). `silent` is a parameter (R8). */
  async function runAndCapture(id: string, opts: { silent: boolean }) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const record = await runCase.mutateAsync({
        caseId: id,
        agentId: agentScopeId,
        caseName: name.trim() || undefined,
        silent: opts.silent,
        signal: ctrl.signal,
      });
      setLastRun(record);
    } finally {
      abortRef.current = null;
    }
  }

  /** Aborts the one in-flight RUN, if any. Never registers/aborts a save (R8). */
  function abortRun() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /** Cancel and the Modal's X behave identically (R8): abort any in-flight run, then close. */
  function handleClose() {
    abortRun();
    onClose();
  }

  async function handleRunCase() {
    if (!isValidJson || skillDiffEmpty) return;
    try {
      // Seed mode (unsaved from-finding case, agent-only per C2): run WITHOUT
      // persisting anything — the server rebuilds the fixture from the finding
      // and scores against the current expected output, but writes no eval
      // case and no run row. Only Save creates the case; only saved cases get
      // persisted runs. Registered in `abortRef` exactly like a persisted run
      // (R7) so Cancel/X/Save abort it identically — there is no case id to
      // scope the abort against, but the controller itself doesn't need one.
      if (fromFinding && !caseId) {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
          const record = await previewRun.mutateAsync({
            expected_output: parsedExpected ?? [],
            signal: ctrl.signal,
          });
          setLastRun(record);
        } finally {
          abortRef.current = null;
        }
        return;
      }
      const id = await ensureSaved();
      // The button's own run stays silent: true — the inline banner is the
      // feedback, and the modal stays open (R8).
      await runAndCapture(id, { silent: true });
    } catch (err) {
      if (isAbortError(err)) return;
      notify.error(err instanceof Error ? err.message : "Failed to run the eval case");
    }
  }

  async function handleSave() {
    if (!isValidJson || skillDiffEmpty) return;
    // Abort any in-flight Run-case run first — Save is pressable while one is
    // running (R7's deliberate `busy` drop from Save's disabled rule), and per
    // R8 pressing Save aborts it rather than waiting for it.
    abortRun();
    try {
      const id = await ensureSaved();
      if (runOnSave) {
        // Fresh run against the just-saved case, silent: false — the modal is
        // closing, so the toast is the only surviving feedback (R8). Save
        // stays blocked for this run's duration via `saveRunInFlight`.
        setSaveRunInFlight(true);
        try {
          await runAndCapture(id, { silent: false });
        } finally {
          setSaveRunInFlight(false);
        }
      }
      onClose();
    } catch (err) {
      // A Cancel click during the post-save run aborts THAT run and closes via
      // `handleClose` itself (R8) — this catch must not also call onClose(),
      // just swallow. The already-committed save is never undone (only runs
      // are abortable).
      if (isAbortError(err)) return;
      notify.error(err instanceof Error ? err.message : "Failed to save the eval case");
    }
  }

  function addSkeleton() {
    const current = parsedExpected ?? [];
    const skeleton = owner.kind === "skill" ? findingSkillSkeleton() : findingSkeleton();
    setExpectedOutputText(JSON.stringify([...current, skeleton], null, 2));
  }

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
      onClose={handleClose}
      footer={
        <div style={s.footerCol}>
          {runBanner}
          <div style={s.footer}>
            <label style={s.footerToggle}>
              <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
              Run on save
            </label>
            <div style={s.footerButtons}>
              <Button kind="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                kind="secondary"
                icon="Play"
                loading={running}
                onClick={handleRunCase}
                disabled={!isValidJson || busy || skillDiffEmpty}
              >
                {running ? t("caseEditor.running") : t("caseEditor.runCase")}
              </Button>
              <Button
                kind="primary"
                icon="Check"
                loading={saving}
                onClick={handleSave}
                disabled={!isValidJson || saving || saveRunInFlight || skillDiffEmpty}
              >
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
          {owner.kind === "skill" ? (
            <SkillInputPanes
              activeTab={activeInputTab === "prMeta" ? "prMeta" : "code"}
              onTabChange={setActiveInputTab}
              mode={codeMode}
              onModeChange={setCodeMode}
              before={codeBefore}
              onBeforeChange={setCodeBefore}
              after={codeAfter}
              onAfterChange={setCodeAfter}
              title={metaTitle}
              onTitleChange={setMetaTitle}
              body={metaBody}
              onBodyChange={setMetaBody}
              generatedDiff={generatedDiff}
              readOnly={readOnlyInput}
            />
          ) : (
            <AgentInputPanes
              t={t}
              activeInputTab={activeInputTab}
              onTabChange={setActiveInputTab}
              inputDiff={inputDiff}
              onDiffChange={setInputDiff}
              inputFilesText={inputFilesText}
              onFilesChange={setInputFilesText}
              inputMetaText={inputMetaText}
              onMetaChange={setInputMetaText}
              readOnlyInput={readOnlyInput}
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
 * Agent owner's Input area — `Diff | Files | PR meta` tabs, byte-identical to
 * the pre-T-07 behaviour (R1). `inputTabs` lives here (not module/component
 * scope) so a skill owner never builds a `Files` tab (R2).
 */
function AgentInputPanes({
  t,
  activeInputTab,
  onTabChange,
  inputDiff,
  onDiffChange,
  inputFilesText,
  onFilesChange,
  inputMetaText,
  onMetaChange,
  readOnlyInput,
}: {
  t: ReturnType<typeof useTranslations>;
  activeInputTab: InputTabKey;
  onTabChange: (k: InputTabKey) => void;
  inputDiff: string;
  onDiffChange: (v: string) => void;
  inputFilesText: string;
  onFilesChange: (v: string) => void;
  inputMetaText: string;
  onMetaChange: (v: string) => void;
  readOnlyInput: boolean;
}) {
  const inputTabs = [
    { key: "diff", label: t("caseEditor.tabs.diff") },
    { key: "files", label: "Files" },
    { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
  ];
  return (
    <>
      <div style={s.tabsWrap}>
        <Tabs tabs={inputTabs} value={activeInputTab} onChange={(k) => onTabChange(k as InputTabKey)} pad="0" />
      </div>
      {activeInputTab === "diff" && (
        <InputField
          ariaLabel="Diff input"
          value={inputDiff}
          onChange={onDiffChange}
          placeholder={t("caseEditor.diffPlaceholder")}
          readOnly={readOnlyInput}
          highlightDiff
        />
      )}
      {activeInputTab === "files" && (
        <InputField
          ariaLabel="Files input"
          value={inputFilesText}
          onChange={onFilesChange}
          placeholder="[]"
          readOnly={readOnlyInput}
        />
      )}
      {activeInputTab === "prMeta" && (
        <InputField
          ariaLabel="PR meta input"
          value={inputMetaText}
          onChange={onMetaChange}
          placeholder="{}"
          readOnly={readOnlyInput}
        />
      )}
    </>
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
