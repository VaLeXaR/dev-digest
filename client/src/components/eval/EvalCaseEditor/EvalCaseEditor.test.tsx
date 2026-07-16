import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";

const createMutateAsync = vi.fn();
const createSkillMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const runMutateAsync = vi.fn();

vi.mock("../../../lib/hooks/eval", () => ({
  useCreateEvalCase: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useCreateSkillEvalCase: () => ({ mutateAsync: createSkillMutateAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runMutateAsync, isPending: false }),
}));

import { EvalCaseEditor, type EvalCaseEditorOwner } from "./EvalCaseEditor";

afterEach(() => {
  cleanup();
  createMutateAsync.mockReset();
  createSkillMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  runMutateAsync.mockReset();
});

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

    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "new-case", agentId: "ag1" });
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
    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "case1", agentId: undefined, caseName: "stripe-key-leak" });
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
});
