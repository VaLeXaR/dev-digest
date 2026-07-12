import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";

vi.mock("../../../../../../../lib/hooks", () => ({
  useIntent: vi.fn(),
  useRecalculateIntent: vi.fn(),
  useRisks: vi.fn(),
  useSecretsStatus: vi.fn(),
  useSettings: vi.fn(),
  useBlast: vi.fn(),
  useGenerateBlastSummary: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useBrief: vi.fn(),
  useGenerateBrief: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  notify: { error: vi.fn() },
}));

vi.mock("../../../../../../../lib/feature-models", () => ({
  FEATURE_MODELS: [],
  PROVIDER_LABELS: {},
}));

import { useIntent, useRecalculateIntent, useRisks, useSecretsStatus, useSettings, useBlast, useGenerateBlastSummary, useBrief, useGenerateBrief } from "../../../../../../../lib/hooks";
import { OverviewTab } from "./OverviewTab";
import blastMessages from "../../../../../../../../messages/en/blast.json";

afterEach(cleanup);

const BASE_BRIEF = {
  pr_id: "pr1",
  what: "",
  why: "",
  risk_level: "low" as const,
  risks: [],
  review_focus: [],
};

beforeEach(() => {
  vi.mocked(useSettings).mockReturnValue({ data: undefined } as ReturnType<typeof useSettings>);
  vi.mocked(useBlast).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useBlast>);
  // Default to "already generated" so most tests exercise the populated layout;
  // the empty-state tests override this explicitly.
  vi.mocked(useBrief).mockReturnValue({ data: BASE_BRIEF, isLoading: false } as unknown as ReturnType<typeof useBrief>);
  vi.mocked(useGenerateBrief).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as unknown as ReturnType<typeof useGenerateBrief>);
  vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
  vi.mocked(useSecretsStatus).mockReturnValue({ data: undefined } as ReturnType<typeof useSecretsStatus>);
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, blast: blastMessages, brief: briefMessages }}>
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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    expect(screen.getByText('"Adds rate limiting"')).toBeInTheDocument();
    expect(screen.getByText("rate limiting")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    // Recalculate/Generate are gone — generation only happens via the unified
    // empty-state "Generate brief" action (product decision).
    expect(screen.queryByText("Recalculate")).not.toBeInTheDocument();
  });

  it("shows the unified empty state when no brief has been generated yet, hiding Intent/Blast Radius/PrBriefCard", () => {
    vi.mocked(useIntent).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBrief).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useBrief>);

    const { container } = renderWithIntl(
      <OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("Generate a Why+Risk brief for this PR.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="overview-grid"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Why & Risk Brief")).not.toBeInTheDocument();
  });

  it("still shows the unified empty state (not IntentCard's own dead empty text) when intent exists but the brief doesn't yet", () => {
    // Common real-world case: Intent shipped weeks before Why & Risk Brief, so
    // most existing PRs already have intent data with no brief yet.
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBrief).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useBrief>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.queryByText("No intent yet")).not.toBeInTheDocument();
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

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Possible secret leak")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("clicking Generate brief calls recalcMutation then generateBrief with prId, in order", async () => {
    const recalcMutateAsync = vi.fn().mockResolvedValue(undefined);
    const generateBriefMutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useIntent).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBrief).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useBrief>);
    vi.mocked(useRecalculateIntent).mockReturnValue({ mutate: vi.fn(), mutateAsync: recalcMutateAsync, isPending: false } as unknown as ReturnType<typeof useRecalculateIntent>);
    vi.mocked(useGenerateBrief).mockReturnValue({ mutate: vi.fn(), mutateAsync: generateBriefMutateAsync, isPending: false } as unknown as ReturnType<typeof useGenerateBrief>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));

    await waitFor(() => expect(generateBriefMutateAsync).toHaveBeenCalledWith("pr1"));
    expect(recalcMutateAsync).toHaveBeenCalledWith("pr1");
    const recalcOrder = recalcMutateAsync.mock.invocationCallOrder[0] ?? -1;
    const briefOrder = generateBriefMutateAsync.mock.invocationCallOrder[0] ?? -1;
    expect(recalcOrder).toBeLessThan(briefOrder);
  });

  it("renders Intent and Blast Radius cards side by side in a two-column grid", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBlast).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useBlast>);

    const { container } = renderWithIntl(
      <OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="overview-grid"]')).toBeInTheDocument();
  });

  it("Explain button calls explainMutation.mutate with prId", () => {
    const explainMutate = vi.fn();
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useGenerateBlastSummary).mockReturnValue({ mutate: explainMutate, isPending: false } as unknown as ReturnType<typeof useGenerateBlastSummary>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    fireEvent.click(screen.getByText("Explain"));

    expect(explainMutate).toHaveBeenCalledWith("pr1");
  });

  it("passes onGoToDiff through to the Blast Radius card's caller navigation", () => {
    const onGoToDiff = vi.fn();
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
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

    renderWithIntl(
      <OverviewTab
        prBody={null}
        prId="pr1"
        onGoToDiff={onGoToDiff}
        changedFiles={["src/routes/checkout.ts"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /src\/routes\/checkout\.ts.*42/ }));
    expect(onGoToDiff).toHaveBeenCalledWith("src/routes/checkout.ts", 42);
  });

  it("renders PrBriefCard's review-focus list below the Intent/Blast Radius grid and leaves IntentCard's RISK AREAS unchanged (AC-16/AC-17)", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({
      data: {
        risks: [
          { kind: "security", title: "Possible secret leak", severity: "high", explanation: "", file_refs: [] },
        ],
        pr_id: "pr1",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBrief).mockReturnValue({
      data: {
        ...BASE_BRIEF,
        review_focus: [{ file: "src/config.ts", line: 12, reason: "test reason" }],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBrief>);

    const { container } = renderWithIntl(
      <OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    const grid = container.querySelector('[data-testid="overview-grid"]');
    expect(grid).toBeInTheDocument();

    // AC-17: IntentCard's RISK AREAS section still renders unchanged, unaffected by PrBriefCard.
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Possible secret leak")).toBeInTheDocument();

    // AC-16: PrBriefCard's review-focus list renders as a sibling AFTER the grid, not inside it.
    const reviewFocusTitle = screen.getByText("Review focus — read these first");
    expect(grid?.contains(reviewFocusTitle)).toBe(false);
    const position = grid!.compareDocumentPosition(reviewFocusTitle);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("removed the separate Why & Risk Brief card — risk_level/what/why render only in the top PR Brief banner", () => {
    vi.mocked(useIntent).mockReturnValue({ data: BASE_INTENT, isLoading: false } as ReturnType<typeof useIntent>);
    vi.mocked(useRisks).mockReturnValue({ data: { risks: [], pr_id: "pr1" }, isLoading: false } as unknown as ReturnType<typeof useRisks>);
    vi.mocked(useBrief).mockReturnValue({
      data: { ...BASE_BRIEF, what: "Adds a widget.", why: "Users asked for it.", risk_level: "high" },
      isLoading: false,
    } as unknown as ReturnType<typeof useBrief>);

    renderWithIntl(<OverviewTab prBody={null} prId="pr1" onGoToDiff={vi.fn()} changedFiles={[]} />);

    expect(screen.queryByText("Why & Risk Brief")).not.toBeInTheDocument();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Adds a widget.")).toBeInTheDocument();
    expect(screen.getByText("Users asked for it.")).toBeInTheDocument();
  });
});
