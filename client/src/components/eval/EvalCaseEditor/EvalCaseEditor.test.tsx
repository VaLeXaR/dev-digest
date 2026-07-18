import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { generateDiff } from "./generateDiff";

const createMutateAsync = vi.fn();
const createSkillMutateAsync = vi.fn();
const createFromFindingMutateAsync = vi.fn();
const previewRunMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const runMutateAsync = vi.fn();

// Overridable per-test (R7/T-07): a few tests need `isPending: true` from the
// update/run hooks to exercise the busy/saveRunInFlight-driven disabled rules.
let updateIsPending = false;
let runIsPending = false;

vi.mock("../../../lib/hooks/eval", () => ({
  useCreateEvalCase: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useCreateSkillEvalCase: () => ({ mutateAsync: createSkillMutateAsync, isPending: false }),
  useCreateEvalCaseFromFinding: () => ({ mutateAsync: createFromFindingMutateAsync, isPending: false }),
  usePreviewEvalRunFromFinding: () => ({ mutateAsync: previewRunMutateAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: updateMutateAsync, isPending: updateIsPending }),
  useRunEvalCase: () => ({ mutateAsync: runMutateAsync, isPending: runIsPending }),
}));

import { EvalCaseEditor, type EvalCaseEditorOwner } from "./EvalCaseEditor";

afterEach(() => {
  cleanup();
  createMutateAsync.mockReset();
  createSkillMutateAsync.mockReset();
  createFromFindingMutateAsync.mockReset();
  previewRunMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  runMutateAsync.mockReset();
  updateIsPending = false;
  runIsPending = false;
});

const SEED = {
  owner_kind: "agent" as const,
  owner_id: "ag1",
  name: "From finding: Missing auth",
  input_diff: "diff --git a/x b/x",
  input_files: [],
  input_meta: {},
  expected_output: [{ type: "must_find" as const, file: "api.ts", start_line: 9, end_line: 12 }],
};

const AGENT_OWNER: EvalCaseEditorOwner = { kind: "agent", id: "ag1", name: "Security Reviewer" };
const SKILL_OWNER: EvalCaseEditorOwner = { kind: "skill", id: "sk1", name: "pr-quality-rubric" };

const EXISTING_CASE: EvalCase = {
  id: "case1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n+  stripeKey: \"sk_live_x\",",
  input_files: null,
  input_meta: null,
  expected_output: [
    { type: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 },
  ],
  notes: null,
};

// R17: there is NO legacy fallback — a skill case with a persisted diff but no
// `code_mode` is unreachable by any data (see the plan's evidence: eval_cases
// holds zero skill-owned rows). This is the realistic skill fixture replacing
// the earlier (agent-shaped) pairing with SKILL_OWNER. `input_diff` is
// generated FROM `code_before`/`code_after` via the real `generateDiff`, so
// the three fields are consistent by construction, not hand-typed separately.
const SKILL_CODE_BEFORE = "type UserResponse = {\n  id: string;\n  name: string;\n}";
const SKILL_CODE_AFTER = "type UserResponse = {\n  id: string;\n}";
const SKILL_EXISTING_CASE: EvalCase = {
  id: "skillcase1",
  owner_kind: "skill",
  owner_id: "sk1",
  name: "pr-quality-rubric-case",
  input_diff: generateDiff({ mode: "modified_file", before: SKILL_CODE_BEFORE, after: SKILL_CODE_AFTER }),
  input_files: null,
  input_meta: { title: "Add Stripe integration", body: "Wire up payments via Stripe SDK." },
  code_mode: "modified_file",
  code_before: SKILL_CODE_BEFORE,
  code_after: SKILL_CODE_AFTER,
  expected_output: [{ type: "must_find", file: "snippet.ts", start_line: 1, end_line: 1 }],
  notes: null,
};

// The designs' own Expected-output entry (design/01, design/03, design/04) —
// no `file`, no `type` key — badges valid JSON only for a skill owner (R11).
const DESIGN_EXPECTED_JSON = JSON.stringify([
  {
    title: "Public fields 'name' and 'email' removed from UserResponse without version bump",
    category: "security",
    end_line: 3,
    severity: "CRITICAL",
    start_line: 1,
  },
]);

function renderEditor(props: Partial<React.ComponentProps<typeof EvalCaseEditor>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseEditor owner={AGENT_OWNER} onClose={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("T-07 EvalCaseEditor (owner-generic)", () => {
  it("renders title, name field, and the three input tabs", () => {
    renderEditor({ existingCase: EXISTING_CASE });
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByDisplayValue("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("PR meta")).toBeInTheDocument();
  });

  it("shows the valid JSON badge and enables Save for a fresh case (empty expected_output is valid)", () => {
    renderEditor();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it("shows invalid JSON badge and disables Save/Run case when the expected-output textarea has broken JSON", () => {
    renderEditor();
    const jsonBox = screen.getByLabelText("Expected output JSON");
    fireEvent.change(jsonBox, { target: { value: "{not valid" } });

    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /run case/i })).toBeDisabled();
  });

  it("re-enables Save once the JSON is fixed back to valid", () => {
    renderEditor();
    const jsonBox = screen.getByLabelText("Expected output JSON");

    fireEvent.change(jsonBox, { target: { value: "not json at all" } });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    fireEvent.change(jsonBox, { target: { value: "[]" } });
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("+ Finding skeleton appends a must_find entry to the expected-output JSON", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));

    const jsonBox = screen.getByLabelText("Expected output JSON") as HTMLTextAreaElement;
    const parsed = JSON.parse(jsonBox.value);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: "must_find", file: "", start_line: 1, end_line: 1 });
  });

  it("Save creates a new case via the agent hook when owner.kind is 'agent'", async () => {
    createMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-case" });
    renderEditor();

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "my-case" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });
    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({ name: "my-case", expected_output: [] });
    expect(createSkillMutateAsync).not.toHaveBeenCalled();
  });

  it("Save creates a new case via the skill hook when owner.kind is 'skill'", async () => {
    createSkillMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-skill-case", owner_kind: "skill", owner_id: "sk1" });
    renderEditor({ owner: SKILL_OWNER });

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "skill-case" } });
    // R10: a brand-new skill case's diff is empty (no Before/After typed yet),
    // which disables Save — type an After snippet so the generated diff is
    // non-empty and the button becomes clickable.
    fireEvent.change(screen.getByLabelText("After code"), { target: { value: "type X = {}" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });
    expect(createSkillMutateAsync.mock.calls[0]?.[0]).toMatchObject({ name: "skill-case", expected_output: [] });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("subtitle reflects the skill owner's name", () => {
    renderEditor({ owner: SKILL_OWNER });
    expect(
      screen.getByText("pr-quality-rubric · simulate a PR and assert the expected output"),
    ).toBeInTheDocument();
  });

  it("Save with Run on save enabled also triggers the run mutation with silent: false (R8)", async () => {
    createMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-case" });
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "new-case",
      case_name: "my-case",
      ran_at: "2026-07-15T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: null,
      precision: null,
      citation_accuracy: null,
      duration_ms: 1800,
      cost_usd: 0.02,
    });
    renderEditor();

    fireEvent.click(screen.getByRole("switch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    // R8: the save-triggered run is silent: false (the modal closes, so the
    // toast is the only surviving feedback) — supersedes the pre-T-07
    // `silent: true` expectation. `signal` is a real AbortController signal
    // (R7), so match with toMatchObject rather than an exact object.
    expect(runMutateAsync.mock.calls[0]?.[0]).toMatchObject({ caseId: "new-case", agentId: "ag1", silent: false });
    expect(runMutateAsync.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("Run case for a skill owner calls the run mutation without an agentId scope", async () => {
    updateMutateAsync.mockResolvedValue(SKILL_EXISTING_CASE);
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "skillcase1",
      case_name: "pr-quality-rubric-case",
      ran_at: "2026-07-15T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: null,
      precision: null,
      citation_accuracy: null,
      duration_ms: 1000,
      cost_usd: 0.01,
    });
    renderEditor({ owner: SKILL_OWNER, existingCase: SKILL_EXISTING_CASE });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));

    await screen.findByText(/Last run passed/);
    expect(runMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      caseId: "skillcase1",
      agentId: undefined,
      caseName: "pr-quality-rubric-case",
      silent: true,
    });
  });

  it("Run case shows the last-run result line inline without closing", async () => {
    const onClose = vi.fn();
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "case1",
      case_name: "stripe-key-leak",
      ran_at: "2026-07-15T00:00:00.000Z",
      actual_output: [{ file: "src/config.ts", start_line: 12, end_line: 12 }],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1800,
      cost_usd: 0.02,
    });
    renderEditor({ existingCase: EXISTING_CASE, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));

    await screen.findByText(/Last run passed/);
    expect(screen.getByText(/1\/1 passed/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8s/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.02/)).toBeInTheDocument();
    // Actual output panel reflects the run's produced findings (design/05).
    expect(screen.getByLabelText("Actual output")).toHaveTextContent('"file": "src/config.ts"');
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Run/Save on an existing case PATCHes only name + expected_output, never the immutable input snapshot", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "case1",
      case_name: "stripe-key-leak",
      ran_at: "2026-07-16T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1000,
      cost_usd: 0.01,
    });
    renderEditor({ existingCase: EXISTING_CASE });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await screen.findByText(/Last run passed/);

    const patch = updateMutateAsync.mock.calls[0]?.[0]?.patch;
    expect(patch).toMatchObject({ name: "stripe-key-leak" });
    expect(patch).toHaveProperty("expected_output");
    // A large PR's diff/files snapshot would blow past the server's 1 MiB body
    // limit if re-sent on every run — the fixture is immutable, so it must not be.
    expect(patch).not.toHaveProperty("input_diff");
    expect(patch).not.toHaveProperty("input_files");
    expect(patch).not.toHaveProperty("input_meta");
  });

  it("case-type sub-label names the primary expectation with title + location", () => {
    renderEditor({
      existingCase: {
        ...EXISTING_CASE,
        expected_output: [
          {
            type: "must_find",
            file: "client/src/lib/api.ts",
            start_line: 9,
            end_line: 12,
            title: "Missing authentication in API calls",
          },
        ],
      },
    });
    expect(
      screen.getByText(/MUST find .*Missing authentication in API calls.* at client\/src\/lib\/api\.ts:9/),
    ).toBeInTheDocument();
  });

  it("shows a display-only case-type badge derived from expected_output", () => {
    // No must_find entry → NEGATIVE case.
    renderEditor();
    expect(screen.getByText("Negative case")).toBeInTheDocument();
    expect(screen.getByText("must not flag")).toBeInTheDocument();

    // Adding a must_find skeleton flips it POSITIVE.
    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));
    expect(screen.getByText("Positive case")).toBeInTheDocument();
    expect(screen.getByText("must find")).toBeInTheDocument();
  });

  it("new-case mode uses the 'New eval case' title", () => {
    renderEditor();
    expect(screen.getByText("New eval case")).toBeInTheDocument();
  });

  it("seed (from-finding) mode shows the 'New eval case' title and seeded subtitle", () => {
    renderEditor({ seed: SEED, fromFinding: { findingId: "f1" } });
    expect(screen.getByText("New eval case")).toBeInTheDocument();
    // A must_find seed → positive case → "accepted" phrasing.
    expect(
      screen.getByText("Seeded from an accepted finding · assert the expected output"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("From finding: Missing auth")).toBeInTheDocument();
  });

  it("Run case in seed mode previews ephemerally — persists no case and no run", async () => {
    previewRunMutateAsync.mockResolvedValue({
      id: "preview",
      case_id: "preview",
      case_name: "From finding: Missing auth",
      ran_at: "2026-07-16T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 100,
      cost_usd: 0.01,
    });
    renderEditor({ seed: SEED, fromFinding: { findingId: "f1" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    });

    // R7: `signal` is a real AbortController signal, so match with toMatchObject
    // rather than an exact object (mirrors the persisted-run assertion above).
    expect(previewRunMutateAsync.mock.calls[0]?.[0]).toMatchObject({ expected_output: SEED.expected_output });
    expect(previewRunMutateAsync.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    // No persistence on Run: neither the finding-create nor the plain-create nor
    // the persisted-run hooks fire.
    expect(createFromFindingMutateAsync).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(runMutateAsync).not.toHaveBeenCalled();
    // The ephemeral result still surfaces in the modal.
    await screen.findByText(/Last run passed/);
  });

  it("Cancel during an in-flight seed-mode preview run aborts it and closes (R7/R8)", async () => {
    let capturedSignal: AbortSignal | undefined;
    previewRunMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const onClose = vi.fn();
    renderEditor({ seed: SEED, fromFinding: { findingId: "f1" }, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(previewRunMutateAsync).toHaveBeenCalled());
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Save in seed mode persists via the from-finding hook with name + expected_output", async () => {
    createFromFindingMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "from-finding-case" });
    renderEditor({ seed: SEED, fromFinding: { findingId: "f1" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    expect(createFromFindingMutateAsync).toHaveBeenCalledWith({
      finding_id: "f1",
      name: "From finding: Missing auth",
      expected_output: SEED.expected_output,
    });
    // Never falls through to the plain agent-create hook.
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // R1/R2 — skill vs agent tab sets
  // ==========================================================================

  it("skill owner renders Code + PR meta tabs, no Files tab (R1/R2)", () => {
    renderEditor({ owner: SKILL_OWNER });
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("PR meta")).toBeInTheDocument();
    expect(screen.queryByText("Files")).toBeNull();
  });

  it("agent owner still renders Diff/Files/PR meta tabs (R1)", () => {
    renderEditor({ owner: AGENT_OWNER });
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("PR meta")).toBeInTheDocument();
  });

  it("a new skill case defaults to the Modified file sub-tab (R15)", () => {
    renderEditor({ owner: SKILL_OWNER });
    expect(screen.getByLabelText("Before code")).toBeInTheDocument();
    expect(screen.getByLabelText("After code")).toBeInTheDocument();
  });

  // ==========================================================================
  // R2/R4/R5/R6 — skill Save payload shape
  // ==========================================================================

  it("skill Save sends a generated input_diff, input_files undefined, input_meta, and code_before/after/mode", async () => {
    createSkillMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-skill-case", owner_kind: "skill", owner_id: "sk1" });
    renderEditor({ owner: SKILL_OWNER });

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "skill-case" } });
    fireEvent.change(screen.getByLabelText("Before code"), { target: { value: SKILL_CODE_BEFORE } });
    fireEvent.change(screen.getByLabelText("After code"), { target: { value: SKILL_CODE_AFTER } });
    fireEvent.click(screen.getByText("PR meta"));
    fireEvent.change(screen.getByLabelText("PR title"), { target: { value: "Add Stripe integration" } });
    fireEvent.change(screen.getByLabelText("PR body"), { target: { value: "Wire up payments via Stripe SDK." } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    const payload = createSkillMutateAsync.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      name: "skill-case",
      input_files: undefined,
      input_meta: { title: "Add Stripe integration", body: "Wire up payments via Stripe SDK." },
      code_mode: "modified_file",
      code_before: SKILL_CODE_BEFORE,
      code_after: SKILL_CODE_AFTER,
    });
    expect(payload.input_diff).toBe(
      generateDiff({ mode: "modified_file", before: SKILL_CODE_BEFORE, after: SKILL_CODE_AFTER }),
    );
  });

  it("agent Save payload is unchanged — input_diff is the raw textarea value (R1)", async () => {
    createMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-case" });
    renderEditor({ owner: AGENT_OWNER });

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "my-case" } });
    fireEvent.change(screen.getByLabelText("Diff input"), { target: { value: "--- a/x\n+++ b/x" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      name: "my-case",
      input_diff: "--- a/x\n+++ b/x",
    });
  });

  it("editing an existing skill case still PATCHes only name + expected_output (C1)", async () => {
    updateMutateAsync.mockResolvedValue(SKILL_EXISTING_CASE);
    renderEditor({ owner: SKILL_OWNER, existingCase: SKILL_EXISTING_CASE });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    const patch = updateMutateAsync.mock.calls[0]?.[0]?.patch;
    expect(patch).toMatchObject({ name: "pr-quality-rubric-case" });
    expect(patch).toHaveProperty("expected_output");
    expect(patch).not.toHaveProperty("code_before");
    expect(patch).not.toHaveProperty("code_after");
    expect(patch).not.toHaveProperty("code_mode");
    expect(patch).not.toHaveProperty("input_diff");
    expect(patch).not.toHaveProperty("input_files");
    expect(patch).not.toHaveProperty("input_meta");
  });

  // ==========================================================================
  // R7 — Save pressable during a Run case run; disabled while saving
  // ==========================================================================

  it("Save is enabled while a Run case run is in flight (R7)", () => {
    runIsPending = true;
    renderEditor({ existingCase: EXISTING_CASE });
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("Save is disabled while the save mutation itself is pending", () => {
    updateIsPending = true;
    renderEditor({ existingCase: EXISTING_CASE });
    // The label swaps to "Saving…" while pending — query for that instead.
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  // ==========================================================================
  // R7/R8 — abort on Cancel/X/Save
  // ==========================================================================

  it("Cancel during an in-flight run aborts the signal and closes (R8)", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    let capturedSignal: AbortSignal | undefined;
    runMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const onClose = vi.fn();
    renderEditor({ existingCase: EXISTING_CASE, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalled());
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the Modal's X (Close) aborts an in-flight run and closes, same as Cancel (R8)", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    let capturedSignal: AbortSignal | undefined;
    runMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const onClose = vi.fn();
    renderEditor({ existingCase: EXISTING_CASE, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking Save during an in-flight run aborts that signal too (R7/R8)", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    let capturedSignal: AbortSignal | undefined;
    runMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    renderEditor({ existingCase: EXISTING_CASE });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("R8, Run-on-save OFF: Save during an in-flight run aborts it, saves, closes, and issues no second run", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    let capturedSignal: AbortSignal | undefined;
    runMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const onClose = vi.fn();
    renderEditor({ existingCase: EXISTING_CASE, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(capturedSignal?.aborted).toBe(true);
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(runMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("R8, Run-on-save ON: Save during an in-flight run aborts it, saves, starts a fresh run, and closes only after it resolves", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    let firstSignal: AbortSignal | undefined;
    let resolveSecond: ((v: unknown) => void) | undefined;
    runMutateAsync
      .mockImplementationOnce(({ signal }: { signal?: AbortSignal }) => {
        firstSignal = signal;
        return new Promise(() => {});
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const onClose = vi.fn();
    renderEditor({ existingCase: EXISTING_CASE, onClose });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("switch")); // Run on save ON
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalledTimes(2));
    expect(runMutateAsync.mock.calls[1]?.[0]).toMatchObject({ caseId: "case1", silent: false });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond?.({
        id: "run2",
        case_id: "case1",
        case_name: "stripe-key-leak",
        ran_at: "2026-07-16T00:00:00.000Z",
        actual_output: [],
        pass: true,
        recall: 1,
        precision: 1,
        citation_accuracy: 1,
        duration_ms: 500,
        cost_usd: 0.01,
      });
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("R8: the Run case button's own run passes silent: true", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "case1",
      case_name: "stripe-key-leak",
      ran_at: "2026-07-16T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 500,
      cost_usd: 0.01,
    });
    renderEditor({ existingCase: EXISTING_CASE });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    await screen.findByText(/Last run passed/);

    expect(runMutateAsync.mock.calls[0]?.[0]).toMatchObject({ silent: true });
  });

  it("a rejected run with name 'AbortError' produces no unhandled rejection and no crash", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    runMutateAsync.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    renderEditor({ existingCase: EXISTING_CASE });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    });

    // Swallowed silently — no "Last run" banner renders from an aborted request.
    expect(screen.queryByText(/Last run/)).toBeNull();
  });

  // ==========================================================================
  // R10 — empty generated diff blocks Run case + Save (skill-only)
  // ==========================================================================

  it("R10: identical/empty Before-After disables Run case and Save for a skill owner; typing After enables both", () => {
    renderEditor({ owner: SKILL_OWNER });
    expect(screen.getByRole("button", { name: /run case/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("After code"), { target: { value: "type X = {}" } });

    expect(screen.getByRole("button", { name: /run case/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("R10: an agent case with valid JSON and an empty diff textarea stays enabled (skill-only guard)", () => {
    renderEditor({ owner: AGENT_OWNER });
    expect(screen.getByRole("button", { name: /run case/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("R10: editing an existing skill case is unaffected by the gate (diff is non-empty by construction)", () => {
    renderEditor({ owner: SKILL_OWNER, existingCase: SKILL_EXISTING_CASE });
    expect(screen.getByRole("button", { name: /run case/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  // ==========================================================================
  // R11 — skill-only lenient Expected-output parsing/normalization
  // ==========================================================================

  it("R11: skill owner's short-shape Expected-output badges valid JSON, reads POSITIVE, and normalizes file/type on save", async () => {
    createSkillMutateAsync.mockResolvedValue({ ...EXISTING_CASE, id: "new-skill-case", owner_kind: "skill", owner_id: "sk1" });
    renderEditor({ owner: SKILL_OWNER });

    fireEvent.change(screen.getByLabelText("Expected output JSON"), { target: { value: DESIGN_EXPECTED_JSON } });
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByText("Positive case")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "skill-case" } });
    fireEvent.change(screen.getByLabelText("After code"), { target: { value: "type X = {}" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    const payload = createSkillMutateAsync.mock.calls[0]?.[0];
    expect(payload.expected_output[0]).toMatchObject({ file: "snippet.ts", type: "must_find" });
  });

  it("R11: the same short-shape JSON for an agent owner badges invalid JSON and leaves Save disabled", () => {
    renderEditor({ owner: AGENT_OWNER });
    fireEvent.change(screen.getByLabelText("Expected output JSON"), { target: { value: DESIGN_EXPECTED_JSON } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("R11: + Finding skeleton for a skill owner omits file/type; agent keeps file: '' + type: 'must_find'", () => {
    renderEditor({ owner: SKILL_OWNER });
    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));
    const skillJson = screen.getByLabelText("Expected output JSON") as HTMLTextAreaElement;
    const skillParsed = JSON.parse(skillJson.value);
    expect(skillParsed[0]).not.toHaveProperty("file");
    expect(skillParsed[0]).not.toHaveProperty("type");
    expect(skillParsed[0]).toMatchObject({ start_line: 1, end_line: 1 });
    cleanup();

    renderEditor({ owner: AGENT_OWNER });
    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));
    const agentJson = screen.getByLabelText("Expected output JSON") as HTMLTextAreaElement;
    const agentParsed = JSON.parse(agentJson.value);
    expect(agentParsed[0]).toMatchObject({ file: "", type: "must_find", start_line: 1, end_line: 1 });
  });
});
