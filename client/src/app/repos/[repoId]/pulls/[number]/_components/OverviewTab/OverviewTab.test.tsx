import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks", () => ({
  useIntent: vi.fn(),
  useRecalculateIntent: vi.fn(),
  useRisks: vi.fn(),
  useSecretsStatus: vi.fn(),
  useSettings: vi.fn(),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  notify: { error: vi.fn() },
}));

vi.mock("../../../../../../../lib/feature-models", () => ({
  FEATURE_MODELS: [],
  PROVIDER_LABELS: {},
}));

import { useIntent, useRecalculateIntent, useRisks, useSecretsStatus, useSettings } from "../../../../../../../lib/hooks";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(useSettings).mockReturnValue({ data: undefined } as ReturnType<typeof useSettings>);
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_INTENT = {
  intent: "Adds rate limiting",
  in_scope: ["rate limiting"],
  out_of_scope: ["auth"],
  pr_id: "pr1",
};

describe("OverviewTab", () => {
  it("renders intent summary with quotes and scope chips", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" />);

    expect(screen.getByText('"Adds rate limiting"')).toBeInTheDocument();
    expect(screen.getByText("rate limiting")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("Recalculate")).toBeInTheDocument();
  });

  it("shows empty state when no intent data", () => {
    vi.mocked(useIntent).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" />);

    expect(screen.getByText("No intent yet — click Recalculate to analyze this PR")).toBeInTheDocument();
  });

  it("renders risk chips by severity", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({
      data: {
        risks: [
          { kind: "security", title: "Possible secret leak", severity: "high", explanation: "", file_refs: [] },
          { kind: "perf", title: "N+1 query", severity: "medium", explanation: "", file_refs: [] },
        ],
        pr_id: "pr1",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" />);

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Possible secret leak")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("Recalculate button calls recalcMutation.mutate with prId", () => {
    const recalcMutate = vi.fn();
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: recalcMutate, isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" />);

    fireEvent.click(screen.getByText("Recalculate"));

    expect(recalcMutate).toHaveBeenCalledWith("pr1");
  });
});
