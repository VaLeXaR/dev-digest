import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The seed query is the panel's only eval hook now — the create happens inside
// the editor, which we stub below so this stays a wiring test.
let seedResult: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("../../../../../../../lib/hooks/eval", () => ({
  useEvalCaseSeed: () => seedResult,
}));

vi.mock("../../../../../../../components/eval/EvalCaseEditor/EvalCaseEditor", () => ({
  EvalCaseEditor: (props: {
    fromFinding?: { findingId: string };
    existingCase?: { id: string };
  }) => (
    <div data-testid="eval-editor">
      {props.existingCase ? `existing:${props.existingCase.id}` : `seed:${props.fromFinding?.findingId}`}
    </div>
  ),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  seedResult = { data: undefined, isLoading: false, isError: false };
});

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

const OWNER = { kind: "agent" as const, id: "agent1", name: "Security Reviewer" };

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[finding()]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("disables Turn into eval case until the finding is accepted or dismissed", () => {
    renderWithIntl(<FindingsPanel findings={[finding()]} prId="pr1" agentId="agent1" />);
    const button = screen.getByText("Turn into eval case").closest("button");
    expect(button).toBeDisabled();
  });

  it("enables the button once the finding is decided", () => {
    renderWithIntl(
      <FindingsPanel findings={[finding({ accepted_at: "2026-01-01T00:00:00Z" })]} prId="pr1" agentId="agent1" />,
    );
    const button = screen.getByText("Turn into eval case").closest("button");
    expect(button).not.toBeDisabled();
  });

  it("opens the seed editor when a decided finding's button is clicked", () => {
    seedResult = { data: { owner: OWNER, existing_case: null, seed: {} }, isLoading: false, isError: false };
    renderWithIntl(
      <FindingsPanel findings={[finding({ dismissed_at: "2026-01-01T00:00:00Z" })]} prId="pr1" agentId="agent1" />,
    );
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(screen.getByTestId("eval-editor")).toHaveTextContent("seed:f1");
  });

  it("reopens the existing case in edit mode when the finding already backs one", () => {
    seedResult = {
      data: { owner: OWNER, existing_case: { id: "case9" }, seed: {} },
      isLoading: false,
      isError: false,
    };
    renderWithIntl(
      <FindingsPanel findings={[finding({ accepted_at: "2026-01-01T00:00:00Z" })]} prId="pr1" agentId="agent1" />,
    );
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(screen.getByTestId("eval-editor")).toHaveTextContent("existing:case9");
  });

  it("disables Turn into eval case when the review has no resolvable agent", () => {
    renderWithIntl(
      <FindingsPanel findings={[finding({ accepted_at: "2026-01-01T00:00:00Z" })]} prId="pr1" agentId={null} />,
    );
    const button = screen.getByText("Turn into eval case").closest("button");
    expect(button).toBeDisabled();
  });
});
