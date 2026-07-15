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

const BASE_BRIEF: PrWhyRiskBriefRecord = {
  pr_id: "pr1",
  what: "Adds rate limiting to public API endpoints.",
  why: "Prevents abuse from unauthenticated clients.",
  risk_level: "high",
  risks: [],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "live Stripe key committed in plaintext" },
    { file: "src/api/users.ts", line: 46, reason: "N+1 query under the new limiter" },
  ],
};

describe("PrBriefCard", () => {
  it("renders nothing when there is no brief yet (AC-2 — no error, no card)", () => {
    const { container } = renderWithIntl(
      <PrBriefCard briefData={undefined} briefLoading={false} onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    const { container } = renderWithIntl(
      <PrBriefCard briefData={BASE_BRIEF} briefLoading={true} onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when review_focus is empty", () => {
    const { container } = renderWithIntl(
      <PrBriefCard
        briefData={{ ...BASE_BRIEF, review_focus: [] }}
        briefLoading={false}
        onGoToDiff={vi.fn()}
        changedFiles={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("an in-diff review-focus item calls onGoToDiff, an out-of-diff one renders a GitHub link (AC-10/AC-11)", () => {
    const onGoToDiff = vi.fn();

    renderWithIntl(
      <PrBriefCard
        briefData={BASE_BRIEF}
        briefLoading={false}
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

  it("renders a plain non-interactive row when repoFullName/headSha are missing for an out-of-diff item", () => {
    renderWithIntl(
      <PrBriefCard briefData={BASE_BRIEF} briefLoading={false} onGoToDiff={vi.fn()} changedFiles={[]} />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:46")).toBeInTheDocument();
  });
});
