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
  useBlast: vi.fn(),
  useGenerateBlastSummary: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  notify: { error: vi.fn() },
}));

vi.mock("../../../../../../../lib/feature-models", () => ({
  FEATURE_MODELS: [],
  PROVIDER_LABELS: {},
}));

import { useIntent, useRecalculateIntent, useRisks, useSecretsStatus, useSettings, useBlast, useGenerateBlastSummary } from "../../../../../../../lib/hooks";
import { OverviewTab } from "./OverviewTab";
import blastMessages from "../../../../../../../../messages/en/blast.json";

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(useSettings).mockReturnValue({ data: undefined } as ReturnType<typeof useSettings>);
  vi.mocked(useBlast).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useBlast>);
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, blast: blastMessages }}>
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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />);

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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />);

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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />);

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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />);

    fireEvent.click(screen.getByText("Recalculate"));

    expect(recalcMutate).toHaveBeenCalledWith("pr1");
  });

  it("renders Intent and Blast Radius cards side by side in a two-column grid", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);
    vi.mocked(useBlast).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useBlast>);

    const { container } = renderWithIntl(
      <OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />,
    );

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="overview-grid"]')).toBeInTheDocument();
  });

  it("Explain button calls explainMutation.mutate with prId", () => {
    const explainMutate = vi.fn();
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);
    vi.mocked(useGenerateBlastSummary).mockReturnValue({ mutate: explainMutate, isPending: false } as unknown as ReturnType<typeof useGenerateBlastSummary>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} />);

    fireEvent.click(screen.getByText("Explain"));

    expect(explainMutate).toHaveBeenCalledWith("pr1");
  });

  it("passes onGoToDiff through to the Blast Radius card's caller navigation", () => {
    const onGoToDiff = vi.fn();
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);
    vi.mocked(useBlast).mockReturnValue({
      data: {
        pr_id: "pr1",
        summary: "",
        changed_symbols: [{ name: "chargeCard", file: "src/billing.ts", kind: "function" }],
        downstream: [
          {
            symbol: "chargeCard",
            callers: [{ name: "handleCheckout", file: "src/routes/checkout.ts", line: 42 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBlast>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={onGoToDiff} />);

    fireEvent.click(screen.getByRole("button", { name: /src\/routes\/checkout\.ts.*42/ }));
    expect(onGoToDiff).toHaveBeenCalledWith("src/routes/checkout.ts", 42);
  });
});
