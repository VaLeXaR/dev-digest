import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalDashboardOverview } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const post = vi.fn();
vi.mock("../../../../lib/api", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock("../../../../lib/hooks/eval", () => ({
  useEvalDashboard: vi.fn(),
}));

import { useEvalDashboard } from "../../../../lib/hooks/eval";
import { EvalDashboardView } from "./EvalDashboardView";

afterEach(cleanup);

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalDashboardView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockDashboard(data: EvalDashboardOverview | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useEvalDashboard).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as ReturnType<typeof useEvalDashboard>);
}

const OVERVIEW: EvalDashboardOverview = {
  agents: [
    {
      agent_id: "ag1",
      agent_name: "Security Reviewer",
      model: "gpt-4.1",
      latest_batch: {
        id: "b1",
        owner_kind: "agent",
        owner_id: "ag1",
        owner_version: 7,
        ran_at: "2026-05-29T09:14:00.000Z",
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        pass_count: 17,
        total_count: 20,
        cost_usd: 0.12,
      },
      sparkline: [0.7, 0.75, 0.82],
    },
    {
      agent_id: "ag2",
      agent_name: "Custom Mentor",
      model: "gpt-4o-mini",
      latest_batch: null,
      sparkline: [],
    },
  ],
  recent_runs: [
    {
      id: "b1",
      owner_kind: "agent",
      owner_id: "ag1",
      agent_name: "Security Reviewer",
      owner_version: 7,
      ran_at: "2026-05-29T09:14:00.000Z",
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      pass_count: 17,
      total_count: 20,
      cost_usd: 0.12,
    },
  ],
};

describe("EvalDashboardView", () => {
  it("renders the header, subtitle, and Run all agents button", () => {
    mockDashboard(OVERVIEW);
    renderView();
    expect(screen.getByText("Eval Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run all agents/i })).toBeInTheDocument();
  });

  it("renders each agent row with name, model badge, last-run line, and metric columns", () => {
    mockDashboard(OVERVIEW);
    renderView();
    // "Security Reviewer" appears both in the AGENTS row and the RECENT RUNS
    // table (fixture reuses the same agent) — assert presence, not uniqueness.
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Last run v7 · 2026-05-29 09:14 · 17/20 pass")).toBeInTheDocument();
    // Fixture reuses the same batch metrics for the AGENTS row and the
    // RECENT RUNS table, so each percentage renders twice — assert presence,
    // not a single unique match.
    expect(screen.getAllByText("82%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("91%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("95%").length).toBeGreaterThan(0);
  });

  it("shows 'Never run' and dash metrics for an agent with no latest batch, never 0 or NaN", () => {
    mockDashboard(OVERVIEW);
    renderView();
    expect(screen.getByText("Never run")).toBeInTheDocument();
    // Custom Mentor's three metric columns should all render the null placeholder.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });

  it("agent row chevron links to /eval/:agentId", () => {
    mockDashboard(OVERVIEW);
    renderView();
    const link = screen.getByRole("link", { name: /security reviewer/i });
    expect(link).toHaveAttribute("href", "/eval/ag1");
  });

  it("renders the recent eval runs table with agent, timestamp, version link, bars, and pass count", () => {
    mockDashboard(OVERVIEW);
    renderView();
    expect(screen.getByText("RECENT EVAL RUNS · ALL AGENTS")).toBeInTheDocument();
    expect(screen.getByText("2026-05-29 09:14")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "v7" })).toHaveAttribute("href", "/eval/ag1");
    expect(screen.getByText("17/20")).toBeInTheDocument();
  });

  it("shows the error state with retry when the dashboard query fails", () => {
    const refetch = vi.fn();
    mockDashboard(undefined, { isError: true, refetch });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("'Run all agents' calls the eval-runs endpoint SEQUENTIALLY, never in parallel (AC-27)", async () => {
    mockDashboard(OVERVIEW);
    let resolveFirst!: () => void;
    post
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => Promise.resolve({}));

    renderView();
    fireEvent.click(screen.getByRole("button", { name: /run all agents/i }));

    // Only the FIRST agent's run should have been kicked off — the second
    // must wait for the first `await` to resolve, proving this is a
    // for...of + await loop and not Promise.all.
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/agents/ag1/eval-runs");

    resolveFirst();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenNthCalledWith(2, "/agents/ag2/eval-runs");
  });
});
