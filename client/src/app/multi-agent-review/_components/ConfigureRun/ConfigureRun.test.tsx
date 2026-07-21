import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgentConfigure.json";
import type {
  Agent,
  PrMeta,
  MultiAgentEstimateResponse,
  MultiAgentRunListItem,
} from "@devdigest/shared";
import { formatSeconds } from "@/components/RunTraceDrawer/helpers";
import { formatCost } from "@/app/repos/[repoId]/pulls/helpers";

const pushMock = vi.fn();
const replaceMock = vi.fn();
// `?configure=1` forces the form; flipped per-test.
const nav = { configureParam: false };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({
    get: (k: string) => (k === "configure" && nav.configureParam ? "1" : null),
  }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { id: "r1", name: "my-repo" } }),
}));

const mockUsePulls = vi.fn();
const mockUseAgents = vi.fn();
vi.mock("@/lib/hooks", () => ({
  usePulls: (...args: unknown[]) => mockUsePulls(...args),
  useAgents: (...args: unknown[]) => mockUseAgents(...args),
}));

const mutateEstimate = vi.fn();
let estimateData: MultiAgentEstimateResponse | undefined;
const mutateCreate = vi.fn();
// The repo-scoped recent-runs history driving the landing behavior.
let repoHistory: MultiAgentRunListItem[] = [];
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRunEstimate: () => ({ mutate: mutateEstimate, data: estimateData, isPending: false }),
  useCreateMultiRun: () => ({ mutate: mutateCreate, isPending: false }),
  useMultiRunHistoryForRepo: () => ({ data: repoHistory, isLoading: false }),
}));

import { ConfigureRun } from "./ConfigureRun";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estimateData = undefined;
  repoHistory = [];
  nav.configureParam = false;
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentConfigure: messages }}>
      <ConfigureRun />
    </NextIntlClientProvider>,
  );
}

/** Render the actual configure form (steps 1 & 2) — reached via `?configure=1`. */
function renderForm() {
  nav.configureParam = true;
  return renderWithIntl();
}

const AGENT_BASE = {
  provider: "openai" as const,
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass" as const,
  ci_fail_on: "critical" as const,
  repo_intel: true,
  version: 1,
};

const AGENTS: Agent[] = [
  { ...AGENT_BASE, id: "a1", name: "Security", description: "Flags secrets", enabled: true },
  { ...AGENT_BASE, id: "a2", name: "Architecture", description: "Checks layering", enabled: false },
];

const PULLS: PrMeta[] = [
  {
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "octo",
    branch: "feat",
    base: "main",
    head_sha: "sha1",
    additions: 10,
    deletions: 2,
    files_count: 2,
    status: "open",
  },
];

function selectPr() {
  fireEvent.click(screen.getByText("Select a pull request…"));
  fireEvent.click(screen.getByText("#482 · Add rate limiting to public API endpoints"));
}

describe("ConfigureRun — landing behavior", () => {
  it("shows the Configure/empty state only when the repo has never had a run", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    repoHistory = []; // no past runs
    renderWithIntl();

    expect(screen.getByText("No agents selected")).toBeInTheDocument();
    expect(screen.queryByText("Select a pull request…")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects to the latest run's results when the repo has past runs (no empty state)", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    repoHistory = [
      { id: "run-latest", ranAt: "2026-07-19T00:00:00Z", status: "complete", agentCount: 2, totalCostUsd: 0.1, totalDurationMs: 8000 },
      { id: "run-older", ranAt: "2026-07-18T00:00:00Z", status: "complete", agentCount: 1, totalCostUsd: 0.05, totalDurationMs: 4000 },
    ];
    renderWithIntl();

    expect(replaceMock).toHaveBeenCalledWith("/multi-agent-review/run-latest");
    expect(screen.queryByText("No agents selected")).not.toBeInTheDocument();
  });

  it("the empty-state CTA navigates to the configure form", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    repoHistory = [];
    renderWithIntl();

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(pushMock).toHaveBeenCalledWith("/multi-agent-review?configure=1");
  });
});

describe("ConfigureRun form (?configure=1)", () => {
  it("disables Run and shows the empty state when no PR is selected (AC-3)", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    renderForm();

    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    const runButton = screen.getByRole("button", { name: /Run multi-agent review/ });
    expect(runButton).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows per-agent hints and the summary once a PR is selected", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    estimateData = {
      perAgent: [
        { agentId: "a1", estCostUsd: 0.06, estDurationMs: 8200, basis: "history" },
        { agentId: "a2", estCostUsd: 0.07, estDurationMs: 9100, basis: "history" },
      ],
      summary: { estCostUsd: 0.06, estDurationMs: 8200 },
    };
    renderForm();
    selectPr();

    expect(screen.getByRole("checkbox", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Architecture" })).toBeInTheDocument();
    expect(screen.getByText(`${formatSeconds(8200)} · ${formatCost(0.06)}`)).toBeInTheDocument();
    expect(screen.getByText(`${formatSeconds(9100)} · ${formatCost(0.07)}`)).toBeInTheDocument();
    expect(
      screen.getByText(`≈ ${formatSeconds(8200)} · ${formatCost(0.06)} · parallel fan-out`),
    ).toBeInTheDocument();

    const runButton = screen.getByRole("button", { name: /Run multi-agent review/ });
    expect(runButton).not.toBeDisabled();
  });

  it("renders — for null (cold-start) estimate values", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: [AGENTS[0]!] });
    estimateData = {
      perAgent: [{ agentId: "a1", estCostUsd: null, estDurationMs: null, basis: "diff-size" }],
      summary: { estCostUsd: null, estDurationMs: null },
    };
    renderForm();
    selectPr();

    expect(screen.getByText("— · —")).toBeInTheDocument();
    expect(screen.getByText("≈ — · — · parallel fan-out")).toBeInTheDocument();
  });

  it("calls useCreateMultiRun with the selected agent ids and navigates on success", () => {
    mockUsePulls.mockReturnValue({ data: PULLS });
    mockUseAgents.mockReturnValue({ data: AGENTS });
    renderForm();
    selectPr();

    const runButton = screen.getByRole("button", { name: /Run multi-agent review/ });
    fireEvent.click(runButton);

    expect(mutateCreate).toHaveBeenCalledTimes(1);
    const [input, opts] = mutateCreate.mock.calls[0]!;
    expect(input).toEqual({ prId: "pr1", agentIds: ["a1"] });

    opts.onSuccess({ multiRunId: "run1", runs: [] });
    expect(pushMock).toHaveBeenCalledWith("/multi-agent-review/run1");
  });
});
