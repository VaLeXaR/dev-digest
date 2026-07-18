import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalDashboard, EvalDashboardOverview, EvalRunBatchRecord, EvalTrendPoint } from "@devdigest/shared";

vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const runSetMutate = vi.fn();
vi.mock("../../../../../lib/hooks/agents", () => ({
  useAgent: vi.fn(),
}));
vi.mock("../../../../../lib/hooks/eval", () => ({
  useAgentEvalDashboard: vi.fn(),
  useEvalBatches: vi.fn(),
  useEvalDashboard: vi.fn(),
  useRunEvalSet: vi.fn(),
}));

const compareModalSpy = vi.fn();
vi.mock("../CompareRunsModal/CompareRunsModal", () => ({
  CompareRunsModal: (props: { older: EvalRunBatchRecord; newer: EvalRunBatchRecord; onClose: () => void }) => {
    compareModalSpy(props);
    return (
      <div role="dialog" aria-label="compare-modal-stub">
        {`compare v${props.older.owner_version} -> v${props.newer.owner_version}`}
        <button onClick={props.onClose}>close-stub</button>
      </div>
    );
  },
}));

import { useAgent } from "../../../../../lib/hooks/agents";
import { useAgentEvalDashboard, useEvalBatches, useEvalDashboard, useRunEvalSet } from "../../../../../lib/hooks/eval";
import { AgentEvalDetail } from "./AgentEvalDetail";
import { TrendTooltip } from "./TrendTooltip";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDetail() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AgentEvalDetail agentId="ag1" />
    </QueryClientProvider>,
  );
}

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  enabled: true,
  version: 7,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 20,
  current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.23 },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
  trend: [
    { ran_at: "2020-01-01T10:08:00.000Z", owner_version: 6, recall: 0.78, precision: 0.92, citation_accuracy: 0.89, pass_rate: 0.75, cost_usd: 0.2 },
    { ran_at: new Date().toISOString(), owner_version: 7, recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.23 },
  ],
  recent_runs: [],
  alert: "Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up.",
};

const BATCHES: EvalRunBatchRecord[] = [
  {
    id: "b7",
    owner_kind: "agent",
    owner_id: "ag1",
    owner_version: 7,
    ran_at: new Date().toISOString(),
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    pass_count: 17,
    total_count: 20,
    cost_usd: 0.23,
  },
  {
    id: "b6",
    owner_kind: "agent",
    owner_id: "ag1",
    owner_version: 6,
    ran_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    recall: 0.78,
    precision: 0.93,
    citation_accuracy: 0.94,
    pass_count: 16,
    total_count: 20,
    cost_usd: 0.21,
  },
  {
    id: "b5",
    owner_kind: "agent",
    owner_id: "ag1",
    owner_version: 5,
    // Within the default "30 days" range but OUTSIDE "7 days", so the
    // date-range test below can flip the filter and observe it disappear.
    ran_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    recall: 0.8,
    precision: 0.92,
    citation_accuracy: 0.94,
    pass_count: 16,
    total_count: 20,
    cost_usd: 0.24,
  },
];

const OVERVIEW: EvalDashboardOverview = {
  agents: [
    { agent_id: "ag1", agent_name: "Security Reviewer", model: "gpt-4.1", latest_batch: BATCHES[0]!, sparkline: [0.7, 0.82] },
    { agent_id: "ag2", agent_name: "Custom Mentor", model: "gpt-4o-mini", latest_batch: null, sparkline: [] },
  ],
  recent_runs: [],
};

function mockAll(overrides: { batches?: EvalRunBatchRecord[]; runPending?: boolean } = {}) {
  vi.mocked(useAgent).mockReturnValue({ data: AGENT } as unknown as ReturnType<typeof useAgent>);
  vi.mocked(useAgentEvalDashboard).mockReturnValue({
    data: DASHBOARD,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAgentEvalDashboard>);
  vi.mocked(useEvalBatches).mockReturnValue({
    data: overrides.batches ?? BATCHES,
  } as unknown as ReturnType<typeof useEvalBatches>);
  vi.mocked(useEvalDashboard).mockReturnValue({ data: OVERVIEW } as unknown as ReturnType<typeof useEvalDashboard>);
  vi.mocked(useRunEvalSet).mockReturnValue({
    mutate: runSetMutate,
    isPending: overrides.runPending ?? false,
  } as unknown as ReturnType<typeof useRunEvalSet>);
}

describe("AgentEvalDetail", () => {
  it("renders the back link, agent header, model badge, and subtitle", () => {
    mockAll();
    renderDetail();
    expect(screen.getByRole("link", { name: /all agents/i })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText(/Regression harness · 3 runs on the 20-trace gold set/)).toBeInTheDocument();
  });

  it("renders the warning banner from the dashboard alert, bolding the lead-in", () => {
    mockAll();
    renderDetail();
    expect(screen.getByText("Precision dipped 2pts on v7")).toBeInTheDocument();
    expect(screen.getByText(/a new false positive slipped in/)).toBeInTheDocument();
  });

  it("does not render a warning banner when alert is null", () => {
    mockAll();
    vi.mocked(useAgentEvalDashboard).mockReturnValue({
      data: { ...DASHBOARD, alert: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAgentEvalDashboard>);
    renderDetail();
    expect(screen.queryByText(/Precision dipped/)).not.toBeInTheDocument();
  });

  it("formats metric deltas as signed integer percentage-points with an arrow (C3), never a raw fraction", () => {
    mockAll();
    renderDetail();
    // delta.recall = 0.04 -> "▲ 4pt"; delta.precision = -0.02 -> "▼ 2pt"; delta.citation_accuracy = 0.01 -> "▲ 1pt".
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument();
    expect(screen.getByText("▲ 1pt")).toBeInTheDocument();
    expect(screen.queryByText(/^↑/)).not.toBeInTheDocument();
    expect(screen.queryByText("0.04")).not.toBeInTheDocument();
  });

  it("renders the METRIC TREND legend", () => {
    mockAll();
    renderDetail();
    expect(screen.getByText("METRIC TREND")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation")).toBeInTheDocument();
  });

  it("Compare is disabled until exactly two runs are selected, and ignores a third selection", () => {
    mockAll();
    renderDetail();
    const compareBtn = screen.getByRole("button", { name: /^compare$/i });
    expect(compareBtn).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(compareBtn).toBeDisabled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(checkboxes[1]!);
    expect(compareBtn).not.toBeDisabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // A third check is ignored — still exactly two selected, Compare stays enabled.
    fireEvent.click(checkboxes[2]!);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compareBtn).not.toBeDisabled();
  });

  it("clicking Compare after selecting two runs opens CompareRunsModal with older/newer sorted by version", () => {
    mockAll();
    renderDetail();
    const checkboxes = screen.getAllByRole("checkbox");
    // Rows are sorted by ran_at desc: b7 (v7, newest), b6 (v6), b5 (v5, oldest).
    fireEvent.click(checkboxes[0]!); // b7 (v7)
    fireEvent.click(checkboxes[1]!); // b6 (v6)
    fireEvent.click(screen.getByRole("button", { name: /^compare$/i }));

    expect(compareModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        older: expect.objectContaining({ owner_version: 6 }),
        newer: expect.objectContaining({ owner_version: 7 }),
      }),
    );
  });

  it("'Run eval' calls the run-set mutation for this agent", () => {
    mockAll();
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /run eval/i }));
    expect(runSetMutate).toHaveBeenCalled();
  });

  it("the agent-picker switches routes to /eval/:agentId (client-side, G9)", async () => {
    mockAll();
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Security Reviewer" }));
    fireEvent.click(await screen.findByText("Custom Mentor"));
    expect(push).toHaveBeenCalledWith("/eval/ag2");
  });

  it("date-range filters recent runs client-side, no backend call (G9)", async () => {
    mockAll();
    renderDetail();
    // "30 days" default shows all three batches, including b5 (10 days ago).
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("v6")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();

    // Switching to "7 days" filters b5 (10 days ago) out client-side.
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    fireEvent.click(await screen.findByText("7 days"));

    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("v6")).toBeInTheDocument();
    expect(screen.queryByText("v5")).not.toBeInTheDocument();
  });
});

// R1/R9: extracted so it's testable directly with props, without rendering
// recharts — `ResponsiveContainer` measures offsetWidth=0 under jsdom, so no
// chart (and no tooltip) ever mounts there (see the existing "METRIC TREND
// legend" test above, which only asserts label/legend text for this reason).
describe("TrendTooltip", () => {
  const TREND_POINT: EvalTrendPoint = {
    ran_at: "2026-05-29T09:14:00.000Z",
    owner_version: 7,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    pass_rate: 0.85,
    cost_usd: 0.23,
  };

  afterEach(() => {
    cleanup();
  });

  it("renders the version, cost, and all three metric rows (R9)", () => {
    render(<TrendTooltip point={TREND_POINT} />);
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Citation")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("renders '—' for a null metric, never '0%' (G2/G3 n/a invariant)", () => {
    render(<TrendTooltip point={{ ...TREND_POINT, recall: null }} />);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    // Recall's row is the "—" one; Precision/Citation stay numeric.
    const recallRow = screen.getByText("Recall").closest("div");
    expect(recallRow).toHaveTextContent("—");
  });

  it("renders '—' for a null cost, never '$0.00' (unknown != free)", () => {
    render(<TrendTooltip point={{ ...TREND_POINT, cost_usd: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
