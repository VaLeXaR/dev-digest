import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";

const createMutateAsync = vi.fn();
const createSkillMutateAsync = vi.fn();
const createFromFindingMutateAsync = vi.fn();
const previewRunMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const runMutateAsync = vi.fn();

vi.mock("../../../lib/hooks/eval", () => ({
  useCreateEvalCase: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useCreateSkillEvalCase: () => ({ mutateAsync: createSkillMutateAsync, isPending: false }),
  useCreateEvalCaseFromFinding: () => ({ mutateAsync: createFromFindingMutateAsync, isPending: false }),
  usePreviewEvalRunFromFinding: () => ({ mutateAsync: previewRunMutateAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runMutateAsync, isPending: false }),
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

  it("Save with Run on save enabled also triggers the run mutation", async () => {
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

    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "new-case", agentId: "ag1", silent: true });
  });

  it("Run case for a skill owner calls the run mutation without an agentId scope", async () => {
    updateMutateAsync.mockResolvedValue(EXISTING_CASE);
    runMutateAsync.mockResolvedValue({
      id: "run1",
      case_id: "case1",
      case_name: "stripe-key-leak",
      ran_at: "2026-07-15T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: null,
      precision: null,
      citation_accuracy: null,
      duration_ms: 1000,
      cost_usd: 0.01,
    });
    renderEditor({ owner: SKILL_OWNER, existingCase: EXISTING_CASE });

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));

    await screen.findByText(/Last run passed/);
    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "case1", agentId: undefined, caseName: "stripe-key-leak", silent: true });
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

    expect(previewRunMutateAsync).toHaveBeenCalledWith({ expected_output: SEED.expected_output });
    // No persistence on Run: neither the finding-create nor the plain-create nor
    // the persisted-run hooks fire.
    expect(createFromFindingMutateAsync).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(runMutateAsync).not.toHaveBeenCalled();
    // The ephemeral result still surfaces in the modal.
    await screen.findByText(/Last run passed/);
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
});
