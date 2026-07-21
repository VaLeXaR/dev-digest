import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/multiAgentPicker.json";

const hoisted = vi.hoisted(() => ({
  useMultiRunHistoryMock: vi.fn(),
  useDeleteMultiRunMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: hoisted.pushMock, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRunHistory: hoisted.useMultiRunHistoryMock,
  useDeleteMultiRun: hoisted.useDeleteMultiRunMock,
}));

import { PastReviews } from "./PastReviews";

const RUNS = [
  { id: "run-a", ranAt: "2026-07-20T14:32:00Z", status: "complete", agentCount: 4, totalCostUsd: 0.004, totalDurationMs: 46600 },
  { id: "run-b", ranAt: "2026-07-19T09:10:00Z", status: "failed", agentCount: 2, totalCostUsd: null, totalDurationMs: null },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentPicker: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  hoisted.pushMock.mockReset();
  hoisted.useMultiRunHistoryMock.mockReset();
  hoisted.deleteMutateMock.mockReset();
  hoisted.useDeleteMultiRunMock.mockReset();
  hoisted.useDeleteMultiRunMock.mockReturnValue({ mutate: hoisted.deleteMutateMock, isPending: false });
});

afterEach(cleanup);

describe("PastReviews", () => {
  it("renders nothing when the PR has no multi-agent runs", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: [] });
    const { container } = renderWithIntl(<PastReviews prId="pr-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a trigger with the run count and navigates to a past run on click", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<PastReviews prId="pr-1" />);

    // Trigger shows the count.
    expect(screen.getByText("Past reviews (2)")).toBeInTheDocument();

    // Open the dropdown and click the first past run.
    fireEvent.click(screen.getByText("Past reviews (2)"));
    const firstItem = screen.getByText(/4 agents · \$0\.004/);
    fireEvent.click(firstItem);
    expect(hoisted.pushMock).toHaveBeenCalledWith("/multi-agent-review/run-a");
  });

  it("renders a nullable cost as an em dash in the hint", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<PastReviews prId="pr-1" />);
    fireEvent.click(screen.getByText("Past reviews (2)"));
    expect(screen.getByText(/2 agents · —/)).toBeInTheDocument();
  });

  it("clicking the trash icon opens a confirm dialog and does NOT delete yet", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<PastReviews prId="pr-1" />);
    fireEvent.click(screen.getByText("Past reviews (2)"));

    // Trash icons carry the removeLabel aria-label; click the first run's.
    fireEvent.click(screen.getAllByRole("button", { name: "Delete review" })[0]!);

    expect(screen.getByText("Delete this multi-agent review?")).toBeInTheDocument();
    // Nothing deleted until the user confirms.
    expect(hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });

  it("confirming the dialog deletes the correct run id", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<PastReviews prId="pr-1" />);
    fireEvent.click(screen.getByText("Past reviews (2)"));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete review" })[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(hoisted.deleteMutateMock).toHaveBeenCalledWith("run-a", expect.anything());
  });

  it("cancelling the dialog closes it without deleting", () => {
    hoisted.useMultiRunHistoryMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<PastReviews prId="pr-1" />);
    fireEvent.click(screen.getByText("Past reviews (2)"));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete review" })[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete this multi-agent review?")).not.toBeInTheDocument();
    expect(hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });
});
