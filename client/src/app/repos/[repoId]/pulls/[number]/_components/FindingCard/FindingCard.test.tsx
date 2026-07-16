import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("does not render the Turn into eval case button when no handler is passed", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByText("Turn into eval case")).not.toBeInTheDocument();
  });

  it("fires onTurnIntoEvalCase when the button is clicked", () => {
    const onTurnIntoEvalCase = vi.fn();
    renderWithIntl(
      <FindingCard f={FINDING} defaultExpanded onAction={() => {}} onTurnIntoEvalCase={onTurnIntoEvalCase} />,
    );
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(onTurnIntoEvalCase).toHaveBeenCalledTimes(1);
  });

  it("disables the button with a tooltip when the finding has no resolvable agent", () => {
    const onTurnIntoEvalCase = vi.fn();
    renderWithIntl(
      <FindingCard
        f={FINDING}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={onTurnIntoEvalCase}
        evalCaseDisabled
        evalCaseDisabledReason="No agent for this finding"
      />,
    );
    const button = screen.getByText("Turn into eval case").closest("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "No agent for this finding");
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(onTurnIntoEvalCase).not.toHaveBeenCalled();
  });

  it("shows the already-has-an-eval-case hint when hasEvalCase is true", () => {
    renderWithIntl(
      <FindingCard f={FINDING} defaultExpanded onAction={() => {}} onTurnIntoEvalCase={() => {}} hasEvalCase />,
    );
    expect(screen.getByText("Already has an eval case")).toBeInTheDocument();
  });
});
