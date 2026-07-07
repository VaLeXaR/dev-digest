import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBlastRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const EXPLAIN_BUTTON = <button>Explain</button>;

const BASE_BLAST: PrBlastRecord = {
  pr_id: "pr1",
  summary: "",
  changed_symbols: [
    { name: "chargeCard", file: "src/billing.ts", kind: "function" },
    { name: "refundCard", file: "src/billing.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "chargeCard",
      callers: [
        { name: "handleCheckout", file: "src/routes/checkout.ts", line: 42 },
        { name: "retryJob", file: "src/jobs/retry.ts", line: 10 },
      ],
      endpoints_affected: ["POST /checkout"],
      crons_affected: ["nightly-retry"],
    },
    {
      symbol: "refundCard",
      callers: [{ name: "handleRefund", file: "src/routes/refund.ts", line: 5 }],
      endpoints_affected: ["POST /refund"],
      crons_affected: [],
    },
  ],
};

describe("BlastRadiusCard", () => {
  it("renders stat counters and the first symbol expanded with caller rows; clicking a caller navigates", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={onGoToDiff}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={["src/routes/checkout.ts", "src/jobs/retry.ts", "src/routes/refund.ts"]}
      />,
    );

    // Stat counters: 2 symbols, 3 callers, 2 endpoints, 1 cron. The count is
    // in its own <span> (styled white/bold, distinct from the muted label),
    // so match on the stat item's full textContent rather than a single text node.
    const byStatText = (text: string) =>
      screen.getByText(
        (_, el) => el?.textContent?.replace(/\s+/g, " ").trim() === text,
      );
    expect(byStatText("2 symbols")).toBeInTheDocument();
    expect(byStatText("3 callers")).toBeInTheDocument();

    // First symbol (chargeCard) expanded by default — its callers are visible.
    expect(screen.getByText(/src\/routes\/checkout\.ts:42/)).toBeInTheDocument();
    expect(screen.getByText(/src\/jobs\/retry\.ts:10/)).toBeInTheDocument();

    // Second symbol (refundCard) collapsed by default — its caller is not visible yet.
    expect(screen.queryByText(/src\/routes\/refund\.ts:5/)).not.toBeInTheDocument();

    // Expand the second symbol row.
    fireEvent.click(screen.getByRole("button", { name: /refundCard/ }));
    expect(screen.getByText(/src\/routes\/refund\.ts:5/)).toBeInTheDocument();

    // Clicking a caller row navigates to file:line.
    fireEvent.click(
      screen.getByRole("button", { name: /src\/routes\/checkout\.ts.*42/ }),
    );
    expect(onGoToDiff).toHaveBeenCalledWith("src/routes/checkout.ts", 42);

    // Pill row: endpoints + crons.
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();
    expect(screen.getByText("nightly-retry")).toBeInTheDocument();
  });

  it("shows a degraded badge with explanation instead of a blank body", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={{ ...BASE_BLAST, degraded: true, reason: "Index incomplete" }}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText("Partial data")).toBeInTheDocument();
    expect(
      screen.getByText(/repo index is incomplete/i),
    ).toBeInTheDocument();
  });

  it("shows the no-downstream state when symbols changed but nothing calls them", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={{
          pr_id: "pr1",
          summary: "",
          changed_symbols: [{ name: "helper", file: "src/x.ts", kind: "function" }],
          downstream: [],
        }}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText(/no downstream callers found/i)).toBeInTheDocument();
  });

  it("shows an empty state when there is no blast data at all", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={undefined}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText("No blast radius data yet for this PR.")).toBeInTheDocument();
  });

  it("switches to the graph view via the toggle and renders a placeholder", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });

  it("renders a pre-existing summary as an italic paragraph with zero clicks", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={{ ...BASE_BLAST, summary: "This change affects billing checkout flow." }}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(
      screen.getByText("This change affects billing checkout flow."),
    ).toBeInTheDocument();
  });

  it("does not render a summary paragraph when summary is empty", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(screen.queryByText(/affects/)).not.toBeInTheDocument();
  });

  it("renders the explainButton passed by OverviewTab (mirrors IntentCard's recalcButton composition)", () => {
    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={vi.fn()}
        explainButton={<button>Custom Explain Label</button>}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText("Custom Explain Label")).toBeInTheDocument();
  });

  it("caller NOT in this PR's diff opens on GitHub in a new tab instead of jumping in the Diff tab", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={onGoToDiff}
        explainButton={EXPLAIN_BUTTON}
        // Deliberately empty — none of BASE_BLAST's callers are part of the diff.
        changedFiles={[]}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );

    const link = screen.getByRole("link", { name: /src\/routes\/checkout\.ts.*42/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/routes/checkout.ts#L42",
    );
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(link);
    expect(onGoToDiff).not.toHaveBeenCalled();
  });

  it("caller not in the diff and no repoFullName/headSha yet renders as plain text, not a dead button", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <BlastRadiusCard
        blastData={BASE_BLAST}
        blastLoading={false}
        onGoToDiff={onGoToDiff}
        explainButton={EXPLAIN_BUTTON}
        changedFiles={[]}
      />,
    );

    expect(screen.queryByRole("link", { name: /checkout\.ts/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /checkout\.ts/ })).not.toBeInTheDocument();
    expect(screen.getByText(/src\/routes\/checkout\.ts:42/)).toBeInTheDocument();
  });
});
