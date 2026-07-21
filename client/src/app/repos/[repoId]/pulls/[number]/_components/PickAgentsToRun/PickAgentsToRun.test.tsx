import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/multiAgentPicker.json";

const hoisted = vi.hoisted(() => ({
  useAgentsMock: vi.fn(),
  useMultiRunEstimateMock: vi.fn(),
  useCreateMultiRunMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: hoisted.pushMock, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: hoisted.useAgentsMock,
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRunEstimate: hoisted.useMultiRunEstimateMock,
  useCreateMultiRun: hoisted.useCreateMultiRunMock,
}));

import { PickAgentsToRun } from "./PickAgentsToRun";

const AGENTS = [
  { id: "agent-1", name: "Security Reviewer", enabled: true },
  { id: "agent-2", name: "Performance Reviewer", enabled: true },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentPicker: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

let estimateMutate: ReturnType<typeof vi.fn>;
let createMutateAsync: ReturnType<typeof vi.fn>;

beforeEach(() => {
  hoisted.pushMock.mockReset();
  hoisted.useAgentsMock.mockReset();
  hoisted.useMultiRunEstimateMock.mockReset();
  hoisted.useCreateMultiRunMock.mockReset();

  hoisted.useAgentsMock.mockReturnValue({ data: AGENTS });

  estimateMutate = vi.fn();
  hoisted.useMultiRunEstimateMock.mockReturnValue({
    mutate: estimateMutate,
    isPending: false,
    data: {
      perAgent: [
        { agentId: "agent-1", estCostUsd: 0.01, estDurationMs: 6000, basis: "history" },
        { agentId: "agent-2", estCostUsd: null, estDurationMs: null, basis: "diff-size" },
      ],
      summary: { estCostUsd: 0.01, estDurationMs: 6000 },
    },
  });

  createMutateAsync = vi.fn().mockResolvedValue({
    multiRunId: "multi-1",
    runs: [
      { agentId: "agent-1", runId: "run-1" },
      { agentId: "agent-2", runId: "run-2" },
    ],
  });
  hoisted.useCreateMultiRunMock.mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  });
});

afterEach(cleanup);

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /Run Review/i }));
}

describe("PickAgentsToRun", () => {
  it("keeps the run button disabled until an agent is checked, then enables it with the selected count", () => {
    renderWithIntl(<PickAgentsToRun prId="pr-1" />);
    openPanel();

    expect(screen.getByRole("button", { name: /Run multi-agent review \(0\)/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Security Reviewer/i }));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(1\)/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Performance Reviewer/i }));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(2\)/i })).toBeEnabled();
  });

  it("renders per-agent estimate hints, and a dash when the estimate is null (cold start)", () => {
    renderWithIntl(<PickAgentsToRun prId="pr-1" />);
    openPanel();

    expect(estimateMutate).toHaveBeenCalledWith({ prId: "pr-1", agentIds: ["agent-1", "agent-2"] });
    expect(screen.getByText("~6s")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("confirming calls useCreateMultiRun with exactly the checked agentIds and navigates to the results route", async () => {
    renderWithIntl(<PickAgentsToRun prId="pr-1" />);
    openPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: /Security Reviewer/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Performance Reviewer/i }));

    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(2\)/i }));

    await vi.waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      prId: "pr-1",
      agentIds: ["agent-1", "agent-2"],
    });
    await vi.waitFor(() => expect(hoisted.pushMock).toHaveBeenCalledWith("/multi-agent-review/multi-1"));
  });

  it("Clear resets the selection back to zero", () => {
    renderWithIntl(<PickAgentsToRun prId="pr-1" />);
    openPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: /Security Reviewer/i }));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(1\)/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(0\)/i })).toBeDisabled();
  });
});
