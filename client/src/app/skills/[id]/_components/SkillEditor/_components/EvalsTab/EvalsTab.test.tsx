import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, EvalCase, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

const useSkillEvalCasesMock = vi.fn();
const useSkillEvalCaseLastRunsMock = vi.fn();
const runSetMutate = vi.fn();
const runCaseMutateAsync = vi.fn();
const deleteCaseMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/eval", () => ({
  useSkillEvalCases: (...args: unknown[]) => useSkillEvalCasesMock(...args),
  useSkillEvalCaseLastRuns: (...args: unknown[]) => useSkillEvalCaseLastRunsMock(...args),
  useRunSkillEvalSet: () => ({ mutate: runSetMutate, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runCaseMutateAsync, isPending: false, variables: undefined }),
  useDeleteEvalCase: () => ({ mutate: deleteCaseMutate, isPending: false }),
  // EvalCaseEditor (T-07) always instantiates both create hooks (Rules of
  // Hooks) — must be present in the mock factory once "+ New eval case"
  // transitively renders it, even though this tab only ever calls the skill
  // variant (client INSIGHTS 2026-07-16).
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSkillEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  useSkillEvalCasesMock.mockReset();
  useSkillEvalCaseLastRunsMock.mockReset();
  runSetMutate.mockReset();
  runCaseMutateAsync.mockReset();
  deleteCaseMutate.mockReset();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality",
  type: "rubric",
  source: "manual",
  body: "You are a rubric that scores overall PR quality.",
  enabled: true,
  version: 5,
  created_at: "2026-07-01T00:00:00.000Z",
};

function makeCase(over: Partial<EvalCase>): EvalCase {
  return {
    id: "case1",
    owner_kind: "skill",
    owner_id: "sk1",
    name: "stripe-key-leak",
    input_diff: "--- a/src/config.ts",
    input_files: null,
    input_meta: null,
    expected_output: [
      { type: "must_find", file: "src/config.ts", start_line: 12, end_line: 12, severity: "CRITICAL", category: "security" },
    ],
    notes: null,
    ...over,
  };
}

function makeRun(over: Partial<EvalRunRecord>): EvalRunRecord {
  return {
    id: "run1",
    case_id: "case1",
    case_name: "stripe-key-leak",
    ran_at: "2026-07-15T00:00:00.000Z",
    actual_output: [{ file: "src/config.ts", start_line: 12, end_line: 12 }],
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1200,
    cost_usd: 0.01,
    ...over,
  };
}

function mockData({ cases, lastRuns }: { cases: EvalCase[]; lastRuns: EvalRunRecord[] }) {
  useSkillEvalCasesMock.mockReturnValue({ data: cases, isLoading: false });
  useSkillEvalCaseLastRunsMock.mockReturnValue({ data: lastRuns, isLoading: false });
}

function renderTab() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalsTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("T-08 skill EvalsTab", () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });

  it("shows a distinct hollow 'never run' status (not a fail) for a case with no run record", () => {
    mockData({ cases: [makeCase({ id: "never", name: "service-role-in-client" })], lastRuns: [] });
    renderTab();

    expect(screen.getByText("service-role-in-client")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
  });

  it("shows a green pass icon + 'expected N, got M' subtitle for a passing case", () => {
    mockData({
      cases: [makeCase({ id: "case1" })],
      lastRuns: [makeRun({ case_id: "case1", pass: true })],
    });
    renderTab();

    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();
  });

  it("shows a red fail icon for a case whose latest run did not pass", () => {
    mockData({
      cases: [makeCase({ id: "case2", name: "missing-retry-after" })],
      lastRuns: [makeRun({ case_id: "case2", pass: false, actual_output: [] })],
    });
    renderTab();

    expect(screen.getByText("expected 1 finding, got 0")).toBeInTheDocument();
  });

  it("renders 'empty []' badge for a pure-precision case with no expected findings", () => {
    mockData({
      cases: [makeCase({ id: "case3", name: "clean-refactor-no-flags", expected_output: [] })],
      lastRuns: [makeRun({ case_id: "case3", pass: true, actual_output: [] })],
    });
    renderTab();

    expect(screen.getByText("empty []")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings, got 0")).toBeInTheDocument();
  });

  it("computes the 'N / M passing' pill from cases' latest run pass state", () => {
    mockData({
      cases: [makeCase({ id: "case1" }), makeCase({ id: "case2", name: "missing-retry-after" })],
      lastRuns: [
        makeRun({ case_id: "case1", pass: true }),
        makeRun({ case_id: "case2", pass: false }),
      ],
    });
    renderTab();

    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });

  it("shows the empty-cases message when there are no eval cases", () => {
    mockData({ cases: [], lastRuns: [] });
    renderTab();

    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
  });

  it("'Run all evals' calls useRunSkillEvalSet's mutate", () => {
    mockData({ cases: [], lastRuns: [] });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /run all evals/i }));
    expect(runSetMutate).toHaveBeenCalled();
  });

  it("'+ New eval case' opens the EvalCaseEditor modal, owner-scoped to this skill", () => {
    mockData({ cases: [], lastRuns: [] });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /new eval case/i }));
    expect(screen.getByText("Eval case · Untitled")).toBeInTheDocument();
    expect(screen.getByText(/pr-quality-rubric · simulate a PR/)).toBeInTheDocument();
  });

  it("clicking a case row's delete icon confirms then calls useDeleteEvalCase", () => {
    mockData({ cases: [makeCase({ id: "case1" })], lastRuns: [] });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteCaseMutate).toHaveBeenCalledWith({ id: "case1" }, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("clicking a case row's run icon calls runCase.mutateAsync with just the case id (no agent scope)", async () => {
    runCaseMutateAsync.mockResolvedValue(makeRun({ case_id: "case1", pass: true }));
    mockData({ cases: [makeCase({ id: "case1" })], lastRuns: [] });
    renderTab();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
    });
    expect(runCaseMutateAsync).toHaveBeenCalledWith({ caseId: "case1" });
  });
});
