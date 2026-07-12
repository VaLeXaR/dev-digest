import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { PrBriefBanner } from "./PrBriefBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, brief: briefMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrBriefBanner", () => {
  it("renders risk_level's label/icon and the what/why text, with no findings/score when neither is provided", () => {
    renderWithIntl(
      <PrBriefBanner riskLevel="high" what="Adds rate limiting." why="Prevents abuse." />,
    );

    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("Prevents abuse.")).toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("renders the findings/blockers badge and score+cost/tokens only when review aggregates are provided", () => {
    renderWithIntl(
      <PrBriefBanner
        riskLevel="medium"
        what="Adds a widget."
        why="Users asked for it."
        findingsCount={6}
        blockers={2}
        score={40}
        costUsd={0.0187}
        tokensIn={125100}
        tokensOut={4200}
      />,
    );

    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByText(/6 findings/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText("$0.0187")).toBeInTheDocument();
    expect(screen.getByText("125.1K→4.2K")).toBeInTheDocument();
  });

  it("uses the low-risk neutral color/icon", () => {
    renderWithIntl(<PrBriefBanner riskLevel="low" what="Docs only." why="No behavior change." />);

    expect(screen.getByText("Low risk")).toBeInTheDocument();
  });
});
