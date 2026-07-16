import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

const createEvalCaseMutate = vi.fn();
let evalCasesBackedSet = new Set<string>();

vi.mock("../../../../../../../lib/hooks/eval", () => ({
  useCreateEvalCaseFromFinding: () => ({
    mutate: createEvalCaseMutate,
    isPending: false,
    variables: undefined,
  }),
  useFindingsWithEvalCases: () => ({ data: evalCasesBackedSet }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  createEvalCaseMutate.mockClear();
  evalCasesBackedSet = new Set<string>();
});

const FINDINGS: FindingRecord[] = [
  {
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
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("calls the create-from-finding mutation when Turn into eval case is clicked", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="agent1" />);
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(createEvalCaseMutate).toHaveBeenCalledWith({ finding_id: "f1" });
  });

  it("disables Turn into eval case when the review has no resolvable agent", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId={null} />);
    const button = screen.getByText("Turn into eval case").closest("button");
    expect(button).toBeDisabled();
  });

  it("shows the already-has-an-eval-case hint when the finding id is in the backed set", () => {
    evalCasesBackedSet = new Set(["f1"]);
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="agent1" />);
    expect(screen.getByText("Already has an eval case")).toBeInTheDocument();
  });
});
