import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentVersion, EvalRunBatchRecord } from "@devdigest/shared";

const apiGet = vi.fn();
vi.mock("../../../../../lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

const promoteMutate = vi.fn();
vi.mock("../../../../../lib/hooks/eval", () => ({
  usePromoteAgentVersion: vi.fn(),
}));

import { usePromoteAgentVersion } from "../../../../../lib/hooks/eval";
import { CompareRunsModal } from "./CompareRunsModal";

beforeEach(() => {
  vi.mocked(usePromoteAgentVersion).mockReturnValue({
    mutate: promoteMutate,
    isPending: false,
  } as unknown as ReturnType<typeof usePromoteAgentVersion>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OLDER: EvalRunBatchRecord = {
  id: "b6",
  agent_id: "ag1",
  agent_version: 6,
  ran_at: "2026-05-27T16:40:00.000Z",
  recall: 0.78,
  precision: 0.93,
  citation_accuracy: 0.94,
  pass_count: 16,
  total_count: 20,
  cost_usd: 0.21,
};

const NEWER: EvalRunBatchRecord = {
  id: "b7",
  agent_id: "ag1",
  agent_version: 7,
  ran_at: "2026-05-29T09:14:00.000Z",
  recall: 0.82,
  precision: 0.91,
  citation_accuracy: 0.95,
  pass_count: 17,
  total_count: 20,
  cost_usd: 0.23,
};

const BASE_CONFIG = {
  provider: "openai" as const,
  model: "gpt-4.1",
  output_schema: null,
  strategy: "single-pass" as const,
  ci_fail_on: "critical" as const,
  repo_intel: true,
  skills: [],
};

function versionFixture(version: number, systemPrompt: string): AgentVersion {
  return {
    agent_id: "ag1",
    version,
    config: { ...BASE_CONFIG, system_prompt: systemPrompt },
    created_at: "2026-05-27T00:00:00.000Z",
  };
}

function mockVersions(oldPrompt: string, newPrompt: string) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/agents/ag1/versions/6") return Promise.resolve(versionFixture(6, oldPrompt));
    if (path === "/agents/ag1/versions/7") return Promise.resolve(versionFixture(7, newPrompt));
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient();
  const utils = render(
    <QueryClientProvider client={qc}>
      <CompareRunsModal agentId="ag1" older={OLDER} newer={NEWER} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

describe("CompareRunsModal", () => {
  it("renders the title and subtitle", () => {
    mockVersions("line one\nline two", "line one\nline two");
    renderModal();
    expect(screen.getByText("Compare runs · v6 → v7")).toBeInTheDocument();
    expect(screen.getByText(/Old prompt vs new/)).toBeInTheDocument();
  });

  it("renders 4 delta tiles (Recall/Precision/Citation/Cost) as old → new with a signed pt/dollar delta (C3)", () => {
    mockVersions("a", "a");
    renderModal();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument();

    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("93%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument();

    expect(screen.getByText("CITATION")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("▲ 1pt")).toBeInTheDocument();

    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.21")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
    expect(screen.getByText("▲ $0.02")).toBeInTheDocument();
  });

  it("fetches both versions' system prompts and renders an added line in the diff", async () => {
    mockVersions("keep this\nold only line", "keep this\nnew only line");
    renderModal();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/agents/ag1/versions/6"));
    expect(apiGet).toHaveBeenCalledWith("/agents/ag1/versions/7");
    expect(await screen.findByText("new only line")).toBeInTheDocument();
    expect(screen.getByText("keep this")).toBeInTheDocument();
  });

  it("Close calls onClose without promoting", () => {
    mockVersions("a", "a");
    const { onClose } = renderModal();
    // The Modal's own header "X" icon button also has accessible name "Close"
    // (aria-label) — the footer's own text button is the LAST "Close" button.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalled();
    expect(promoteMutate).not.toHaveBeenCalled();
  });

  it("'Promote vY' calls the promote mutation with the NEWER version", () => {
    mockVersions("a", "a");
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /promote v7/i }));
    expect(promoteMutate).toHaveBeenCalledWith(7, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });
});
