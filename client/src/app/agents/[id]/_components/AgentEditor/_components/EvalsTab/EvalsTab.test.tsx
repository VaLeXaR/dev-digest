import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalCase, EvalRunBatchRecord, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

const useEvalCasesMock = vi.fn();
const useEvalCaseLastRunsMock = vi.fn();
const useEvalBatchesMock = vi.fn();
const runSetMutate = vi.fn();
const runCaseMutateAsync = vi.fn();
const deleteCaseMutate = vi.fn();
const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock("../../../../../../../lib/hooks/eval", () => ({
  useEvalCases: (...args: unknown[]) => useEvalCasesMock(...args),
  useEvalCaseLastRuns: (...args: unknown[]) => useEvalCaseLastRunsMock(...args),
  useEvalBatches: (...args: unknown[]) => useEvalBatchesMock(...args),
  useRunEvalSet: () => ({ mutate: runSetMutate, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runCaseMutateAsync, isPending: false, variables: undefined }),
  useDeleteEvalCase: () => ({ mutate: deleteCaseMutate, isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  useEvalCasesMock.mockReset();
  useEvalCaseLastRunsMock.mockReset();
  useEvalBatchesMock.mockReset();
  runSetMutate.mockReset();
  runCaseMutateAsync.mockReset();
  deleteCaseMutate.mockReset();
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function makeCase(over: Partial<EvalCase>): EvalCase {
  return {
    id: "case1",
    owner_kind: "agent",
    owner_id: "ag1",
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

function makeBatch(over: Partial<EvalRunBatchRecord>): EvalRunBatchRecord {
  return {
    id: "batch1",
    agent_id: "ag1",
    agent_version: 3,
    ran_at: "2026-07-15T00:00:00.000Z",
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    pass_count: 17,
    total_count: 20,
    cost_usd: 0.4,
    ...over,
  };
}

function mockData({
  cases,
  lastRuns,
  batches,
}: {
  cases: EvalCase[];
  lastRuns: EvalRunRecord[];
  batches: EvalRunBatchRecord[];
}) {
  useEvalCasesMock.mockReturnValue({ data: cases, isLoading: false });
  useEvalCaseLastRunsMock.mockReturnValue({ data: lastRuns, isLoading: false });
  useEvalBatchesMock.mockReturnValue({ data: batches, isLoading: false });
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("T-10 EvalsTab", () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });

  it("renders the four EVAL METRICS tiles with values + signed pt deltas from the latest two batches", () => {
    mockData({
      cases: [],
      lastRuns: [],
      batches: [makeBatch({ recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }), makeBatch({ id: "batch0", recall: 0.78, precision: 0.93, citation_accuracy: 0.94 })],
    });
    renderTab();

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    // recall improved 82 vs 78 -> +4pt; precision dropped 91 vs 93 -> -2pt (arrow+sign, not color alone)
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument();
  });

  it("renders '—' (never 0/NaN) for every tile when the agent has no batches yet", () => {
    mockData({ cases: [], lastRuns: [], batches: [] });
    renderTab();

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(4);
  });

  it("shows a distinct hollow 'never run' status (not a fail) for a case with no run record", () => {
    mockData({
      cases: [makeCase({ id: "never", name: "service-role-in-client" })],
      lastRuns: [],
      batches: [],
    });
    renderTab();

    expect(screen.getByText("service-role-in-client")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
  });

  it("shows pass/fail for a case whose ONLY run is a scratch run (batch_id=NULL, G7) — not 'never run' (R2/AC-4)", () => {
    // `useEvalCaseLastRuns` is the direct bulk-per-case-latest-run read, so a
    // scratch run (from the editor's "Run case"/"Run on save" or this tab's own
    // ▷) surfaces here exactly like a batch run would — unlike the superseded
    // `useAgentEvalDashboard(...).recent_runs` source, which was scoped to the
    // latest BATCH only and would have shown "never run" for this case.
    mockData({
      cases: [makeCase({ id: "case1", name: "scratch-only-case" })],
      lastRuns: [makeRun({ case_id: "case1", pass: true })],
      batches: [],
    });
    renderTab();

    expect(screen.getByText("scratch-only-case")).toBeInTheDocument();
    expect(screen.queryByText("never run")).not.toBeInTheDocument();
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
  });

  it("shows a green pass icon + 'expected N, got M' subtitle for a passing case", () => {
    mockData({
      cases: [makeCase({ id: "case1" })],
      lastRuns: [makeRun({ case_id: "case1", pass: true })],
      batches: [],
    });
    renderTab();

    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();
  });

  it("shows a red fail icon for a case whose latest run did not pass", () => {
    mockData({
      cases: [makeCase({ id: "case2", name: "missing-retry-after" })],
      lastRuns: [makeRun({ case_id: "case2", pass: false, actual_output: [] })],
      batches: [],
    });
    renderTab();

    expect(screen.getByText("expected 1 finding, got 0")).toBeInTheDocument();
  });

  it("renders 'empty []' badge for a pure-precision case with no expected findings (R10)", () => {
    mockData({
      cases: [makeCase({ id: "case3", name: "clean-refactor-no-flags", expected_output: [] })],
      lastRuns: [makeRun({ case_id: "case3", pass: true, actual_output: [] })],
      batches: [],
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
      batches: [],
    });
    renderTab();

    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });

  it("'View full dashboard →' is a plain link to /eval (R20/AC-28 — no backend call)", () => {
    mockData({ cases: [], lastRuns: [], batches: [] });
    renderTab();

    const link = screen.getByRole("link", { name: /view full dashboard/i });
    expect(link).toHaveAttribute("href", "/eval");
  });

  it("clicking a case row's delete icon confirms then calls useDeleteEvalCase", () => {
    mockData({
      cases: [makeCase({ id: "case1" })],
      lastRuns: [],
      batches: [],
    });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteCaseMutate).toHaveBeenCalledWith({ id: "case1", agentId: "ag1" });
  });

  it("clicking a case row's run icon calls runCase.mutateAsync with the case + agent id", async () => {
    runCaseMutateAsync.mockResolvedValue(makeRun({ case_id: "case1", pass: true }));
    mockData({
      cases: [makeCase({ id: "case1" })],
      lastRuns: [],
      batches: [],
    });
    renderTab();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
    });
    expect(runCaseMutateAsync).toHaveBeenCalledWith({ caseId: "case1", agentId: "ag1" });
  });

  it("'+ New eval case' opens the EvalCaseEditor modal", () => {
    mockData({ cases: [], lastRuns: [], batches: [] });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /new eval case/i }));
    expect(screen.getByText("Eval case · Untitled")).toBeInTheDocument();
  });

  it("shows the empty-cases message when there are no eval cases", () => {
    mockData({ cases: [], lastRuns: [], batches: [] });
    renderTab();

    expect(
      screen.getByText("No eval cases yet. Create one to assert this agent's expected findings on a sample diff."),
    ).toBeInTheDocument();
  });
});
