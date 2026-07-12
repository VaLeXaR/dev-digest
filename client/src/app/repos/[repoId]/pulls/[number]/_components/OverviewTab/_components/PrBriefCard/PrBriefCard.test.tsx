import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrWhyRiskBriefRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const REGENERATE_BUTTON = <button>Regenerate</button>;

const BASE_BRIEF: PrWhyRiskBriefRecord = {
  pr_id: "pr1",
  what: "Adds rate limiting to public API endpoints.",
  why: "Prevents abuse from unauthenticated clients.",
  risk_level: "high",
  risks: [
    {
      kind: "security",
      title: "Live Stripe key committed",
      explanation: "A live secret key is present in plaintext in config.",
      severity: "high",
      file_refs: ["src/config.ts"],
    },
    {
      kind: "reliability",
      title: "Untracked dependency risk",
      explanation: "A risk that could not be tied to any file in this PR's diff.",
      severity: "medium",
      file_refs: [],
    },
  ],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "live Stripe key committed in plaintext" },
    { file: "src/api/users.ts", line: 46, reason: "N+1 query under the new limiter" },
  ],
};

describe("PrBriefCard", () => {
  it("shows an empty state with the generate action, not an error, when no brief exists (AC-2)", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={undefined}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    expect(
      screen.getByText(/no brief yet — generate one to see the reasoning/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Regenerate")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("renders the risk_level chip with a text label alongside color, positioned left of what/why (AC-9)", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText(BASE_BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText(BASE_BRIEF.why)).toBeInTheDocument();

    // Chip precedes the what/why text in DOM order (rendered left of it).
    const chip = screen.getByText("High risk");
    const what = screen.getByText(BASE_BRIEF.what);
    expect(
      chip.compareDocumentPosition(what) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders blocks in order: header -> risks[] -> review_focus[]", () => {
    const { container } = renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    const text = container.textContent ?? "";
    const whatIdx = text.indexOf(BASE_BRIEF.what);
    const riskIdx = text.indexOf("Live Stripe key committed");
    const reviewFocusIdx = text.indexOf("Review focus");

    expect(whatIdx).toBeGreaterThanOrEqual(0);
    expect(riskIdx).toBeGreaterThan(whatIdx);
    expect(reviewFocusIdx).toBeGreaterThan(riskIdx);
  });

  it("an in-diff review-focus item calls onGoToDiff, an out-of-diff one renders a GitHub link (AC-10/AC-11)", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={onGoToDiff}
        changedFiles={["src/config.ts"]}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );

    // In-diff row (src/config.ts) renders as a button and navigates in-app.
    const inDiffButton = screen.getByRole("button", { name: /src\/config\.ts.*12.*in diff/i });
    fireEvent.click(inDiffButton);
    expect(onGoToDiff).toHaveBeenCalledWith("src/config.ts", 12);

    // Out-of-diff row (src/api/users.ts) renders as an external GitHub link.
    const externalLink = screen.getByRole("link", { name: /src\/api\/users\.ts.*46/i });
    expect(externalLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L46",
    );
    expect(externalLink).toHaveAttribute("target", "_blank");
  });

  it("a risk file_ref in the diff renders a clickable element calling onGoToDiff (R11/AC-11)", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={onGoToDiff}
        changedFiles={["src/config.ts"]}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );

    const refButton = screen.getByRole("button", { name: "Go to src/config.ts in diff" });
    fireEvent.click(refButton);
    expect(onGoToDiff).toHaveBeenCalledWith("src/config.ts", 0);
  });

  it("a risk file_ref not in the diff renders a GitHub link with no line anchor (R11/AC-11)", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );

    const refLink = screen.getByRole("link", { name: "Open src/config.ts on GitHub" });
    expect(refLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/config.ts",
    );
    expect(refLink).toHaveAttribute("target", "_blank");
  });

  it("renders a risk with empty file_refs without a chevron/file-link, showing the unlinked label; title/severity stay visible (AC-18)", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    expect(screen.getByText("Untracked dependency risk")).toBeInTheDocument();
    expect(screen.getByText("not linked to a file")).toBeInTheDocument();
    // No chevron/toggle button for the unlinked risk.
    expect(
      screen.queryByRole("button", { name: /toggle explanation for untracked dependency risk/i }),
    ).not.toBeInTheDocument();
    // Explanation is shown directly (not gated behind an expand toggle).
    expect(
      screen.getByText("A risk that could not be tied to any file in this PR's diff."),
    ).toBeInTheDocument();
  });

  it("risks[] chip markup matches IntentCard's RISK AREAS chip style (icon + title, chevron-expandable to explanation)", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    // Linked risk shows title + file_refs + a chevron toggle; explanation is
    // collapsed until the chevron is clicked.
    expect(screen.getByText("Live Stripe key committed")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(
      screen.queryByText("A live secret key is present in plaintext in config."),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", {
      name: /toggle explanation for live stripe key committed/i,
    });
    fireEvent.click(toggle);
    expect(
      screen.getByText("A live secret key is present in plaintext in config."),
    ).toBeInTheDocument();
  });

  it("does not render risk/review-focus sections while loading", () => {
    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={true}
        regenerateButton={REGENERATE_BUTTON}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    expect(screen.queryByText(BASE_BRIEF.what)).not.toBeInTheDocument();
    expect(screen.queryByText(/no brief yet/i)).not.toBeInTheDocument();
  });
});
