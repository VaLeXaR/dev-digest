import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunDetail, PrDetail, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgentResults.json";
import prReviewMessages from "../../../../../../messages/en/prReview.json";
import runsMessages from "../../../../../../messages/en/runs.json";

// Fixtures referenced inside vi.mock factories must be created via vi.hoisted —
// mock factories are hoisted above regular const declarations.
const { DETAIL, PR, REVIEWS, HISTORY, mutateFinding, mutateCreate, mutateEstimate, mutateDelete, pushMock } =
  vi.hoisted(() => {
  const DETAIL: MultiAgentRunDetail = {
    id: "run1",
    prId: "pr1",
    status: "complete",
    ranAt: "2026-07-19T00:00:00.000Z",
    agents: [
      {
        agentId: "a1",
        runId: "r1",
        name: "Security",
        status: "done",
        costUsd: 0.06,
        durationMs: 8200,
        score: 38,
        findingsCount: 3,
      },
      {
        agentId: "a2",
        runId: "r2",
        name: "Performance",
        status: "failed",
        costUsd: 0.02,
        durationMs: 3000,
        score: null,
        findingsCount: 0,
      },
    ],
    groups: [
      {
        file: "src/middleware/ratelimit.ts",
        lineStart: 28,
        lineEnd: 28,
        title: "Magic number 3600",
        isConflict: true,
        verdicts: [
          { agentId: "a1", state: "flagged", severity: "SUGGESTION", findingId: "f1" },
          { agentId: "a2", state: "did_not_flag", severity: null, findingId: null },
        ],
      },
      {
        file: "src/config.ts",
        lineStart: 12,
        lineEnd: 20,
        title: "Hardcoded secret",
        isConflict: false,
        verdicts: [
          { agentId: "a1", state: "flagged", severity: "CRITICAL", findingId: "f2" },
          { agentId: "a2", state: "flagged", severity: "WARNING", findingId: "f3" },
        ],
      },
    ],
  };

  const PR: PrDetail = {
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "octocat",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "abc123",
    additions: 40,
    deletions: 5,
    files_count: 3,
    status: "open",
    body: null,
    files: [],
    commits: [],
  };

  const REVIEWS: ReviewRecord[] = [
    {
      id: "rev1",
      pr_id: "pr1",
      agent_id: "a1",
      run_id: "r1",
      agent_name: "Security",
      kind: "review",
      verdict: "request_changes",
      summary: "Two critical exposures: a committed live key and an SSRF-shaped webhook forwarder. Block.",
      score: 38,
      model: "gpt-5",
      grounding: null,
      created_at: "2026-07-19T00:00:00.000Z",
      findings: [
        {
          id: "f1",
          severity: "CRITICAL",
          category: "security",
          title: "Hardcoded Stripe secret key in commit",
          file: "src/config.ts",
          start_line: 12,
          end_line: 12,
          rationale: "Line 12 contains a literal Stripe secret key.",
          suggestion: "Move the key to an environment variable.",
          confidence: 0.98,
          kind: "finding",
          trifecta_components: null,
          evidence: null,
          review_id: "rev1",
          accepted_at: null,
          dismissed_at: null,
        },
      ],
    },
  ];

  // Two runs so the History dropdown renders (>1); the first IS the run being
  // viewed (id "run1") so deleting it exercises the redirect path.
  const HISTORY = [
    { id: "run1", ranAt: "2026-07-19T00:00:00.000Z", status: "complete", agentCount: 2, totalCostUsd: 0.05, totalDurationMs: 8200 },
    { id: "run0", ranAt: "2026-07-18T00:00:00.000Z", status: "complete", agentCount: 3, totalCostUsd: 0.09, totalDurationMs: 9100 },
  ];

  const mutateFinding = vi.fn();
  const mutateCreate = vi.fn();
  const mutateEstimate = vi.fn();
  // Invoke the passed callbacks so the component's onSuccess/onSettled run.
  const mutateDelete = vi.fn((_id: string, opts?: { onSuccess?: () => void; onSettled?: () => void }) => {
    opts?.onSuccess?.();
    opts?.onSettled?.();
  });
  const pushMock = vi.fn();

  return { DETAIL, PR, REVIEWS, HISTORY, mutateFinding, mutateCreate, mutateEstimate, mutateDelete, pushMock };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "run1" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRun: () => ({ data: DETAIL, isLoading: false, isError: false, refetch: vi.fn() }),
  // T-13/AC-20: spied so Tabs⇄Columns toggling can be asserted to never fire
  // either — toggling is pure client layout state over already-fetched data.
  useCreateMultiRun: () => ({ mutate: mutateCreate, isPending: false }),
  useMultiRunEstimate: () => ({ mutate: mutateEstimate, isPending: false }),
  useMultiRunHistoryForRepo: () => ({ data: HISTORY }),
  useDeleteMultiRun: () => ({ mutate: mutateDelete, isPending: false }),
}));

vi.mock("@/lib/hooks", () => ({
  usePullDetail: () => ({ data: PR }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/payments-api" } }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
  usePrReviews: () => ({ data: REVIEWS, isLoading: false }),
  useFindingAction: () => ({ mutate: mutateFinding, isPending: false }),
}));

vi.mock("@/lib/hooks/eval", () => ({
  useEvalCaseSeed: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock("@/components/eval/EvalCaseEditor/EvalCaseEditor", () => ({
  EvalCaseEditor: () => <div data-testid="eval-case-editor" />,
}));

vi.mock("@/components/RunTraceDrawer", () => ({
  default: (props: { runId: string; agentName?: string | null }) => (
    <div data-testid="run-trace-drawer" data-run-id={props.runId} data-agent-name={props.agentName ?? ""} />
  ),
}));

import { ResultsView } from "./ResultsView";

afterEach(() => {
  cleanup();
  mutateDelete.mockClear();
  pushMock.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ multiAgentResults: messages, runs: runsMessages, prReview: prReviewMessages }}
    >
      <div data-theme="dark">
        <ResultsView />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("T-12 Multi-Agent Review results — Columns + Where agents disagree", () => {
  it("renders a column per agent that ran with status, cost and score (AC-19)", () => {
    renderView();
    const securityCol = within(screen.getByTestId("agent-column-a1"));
    expect(securityCol.getByText("Security")).toBeInTheDocument();
    // Security (status='done') settles as "Finished"; cost/duration/score visible.
    expect(securityCol.getByText("Finished")).toBeInTheDocument();
    expect(securityCol.getByText(/8\.2s/)).toBeInTheDocument();
    expect(securityCol.getByText(/\$0\.06/)).toBeInTheDocument();
    expect(securityCol.getByText("38")).toBeInTheDocument();

    const perfCol = within(screen.getByTestId("agent-column-a2"));
    expect(perfCol.getByText("Performance")).toBeInTheDocument();
  });

  it("renders a failed agent as Failed while the other agent's column stays intact (AC-18)", () => {
    renderView();
    const perfCol = within(screen.getByTestId("agent-column-a2"));
    expect(perfCol.getByText("Failed")).toBeInTheDocument();
    expect(perfCol.getByText(/\$0\.02/)).toBeInTheDocument();

    // Security's own status/cost are unaffected by Performance's failure.
    const securityCol = within(screen.getByTestId("agent-column-a1"));
    expect(securityCol.getByText("Finished")).toBeInTheDocument();
    expect(securityCol.getByText(/\$0\.06/)).toBeInTheDocument();
  });

  it("'Show only conflicts' OFF shows all groups, ON shows only conflict groups (AC-16)", () => {
    renderView();
    const disagree = screen.getByTestId("where-agents-disagree");
    expect(within(disagree).getByText("Magic number 3600")).toBeInTheDocument();
    expect(within(disagree).getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(within(disagree).getByText("Magic number 3600")).toBeInTheDocument();
    expect(within(disagree).queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("group header shows a line RANGE when lineEnd > lineStart, a single line otherwise", () => {
    renderView();
    const disagree = within(screen.getByTestId("where-agents-disagree"));
    // Multi-line group (config.ts 12→20) renders the en-dash range …
    expect(disagree.getByText("src/config.ts:12–20")).toBeInTheDocument();
    // … single-line group (ratelimit.ts 28→28) renders just the line, no dash.
    expect(disagree.getByText("src/middleware/ratelimit.ts:28")).toBeInTheDocument();
  });

  it("the 'Show only conflicts' switch is not wrapped in a <label> (double-fire guard)", () => {
    // A <label> around the Toggle's own <button> re-dispatches the click to it,
    // firing onChange twice so the switch flips back to its start — the toggle
    // then appears dead in a real browser. jsdom's fireEvent never reproduces
    // the label forwarding, so this asserts the structure directly instead.
    renderView();
    expect(screen.getByRole("switch").closest("label")).toBeNull();
  });

  it("'did not flag' cells render bare, with no reason text (E9)", () => {
    renderView();
    const cell = screen.getByTestId("verdict-src/middleware/ratelimit.ts-28-a2");
    expect(cell).toHaveTextContent("Performance");
    expect(cell).toHaveTextContent("did not flag");
    // Normalize whitespace and assert nothing else is rendered in this cell
    // (i.e. no explanation text alongside the agent name + bare "did not flag").
    const normalized = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(normalized).toBe("Performancedid not flag");
  });

  it("'View trace' mounts RunTraceDrawer with that agent's runId (AC-21)", () => {
    renderView();
    const viewTraceButtons = screen.getAllByText("View trace");
    expect(screen.queryByTestId("run-trace-drawer")).not.toBeInTheDocument();

    // First column is Security (agent a1, runId r1).
    fireEvent.click(viewTraceButtons[0]!);

    const drawer = screen.getByTestId("run-trace-drawer");
    expect(drawer).toHaveAttribute("data-run-id", "r1");
    expect(drawer).toHaveAttribute("data-agent-name", "Security");
  });

  it("deleting the currently-viewed run from History confirms, deletes, and redirects to the landing", () => {
    renderView();

    // Open the History dropdown (renders because there are 2 runs).
    fireEvent.click(screen.getByText("History"));
    // Delete the run being viewed (id "run1" — the first history row's trash).
    fireEvent.click(screen.getAllByRole("button", { name: "Delete review" })[0]!);

    // Confirm dialog appears; nothing deleted before confirming.
    expect(screen.getByText("Delete this multi-agent review?")).toBeInTheDocument();
    expect(mutateDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mutateDelete).toHaveBeenCalledWith("run1", expect.anything());
    // Deleting the current run navigates away so its detail page can't 404.
    expect(pushMock).toHaveBeenCalledWith("/multi-agent-review");
  });
});

describe("T-13 Multi-Agent Review results — Tabs mode", () => {
  it("switching Columns⇄Tabs renders per-agent tabs without any create/estimate call (AC-20)", () => {
    renderView();
    // Columns mode is the default — no Tabs content mounted yet.
    expect(screen.queryByTestId("tabs-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Tabs"));

    const tabsView = screen.getByTestId("tabs-view");
    expect(within(tabsView).getByRole("tab", { name: /Security/ })).toBeInTheDocument();
    expect(within(tabsView).getByRole("tab", { name: /Performance/ })).toBeInTheDocument();
    // Columns content is unmounted once Tabs is active.
    expect(screen.queryByTestId("agent-column-a1")).not.toBeInTheDocument();

    // Toggle back and forth once more — pure client layout state, never a
    // create/estimate network call.
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getByText("Tabs"));

    expect(mutateCreate).not.toHaveBeenCalled();
    expect(mutateEstimate).not.toHaveBeenCalled();
  });

  it("the selected agent's finding renders via FindingCard with Accept/Dismiss/Turn-into-eval-case functional and Learn/Reply visible+disabled (AC-22, AC-24)", () => {
    renderView();
    fireEvent.click(screen.getByText("Tabs"));

    // Security (a1, runId r1) is selected by default (first agent) — its
    // review (rev1) findings come from `usePrReviews`, matched by run_id.
    const findingTitle = screen.getByText("Hardcoded Stripe secret key in commit");
    expect(findingTitle).toBeInTheDocument();
    fireEvent.click(findingTitle);

    expect(screen.getByText("Learn").closest("button")).toBeDisabled();
    expect(screen.getByText("Reply to author").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByText("Accept"));
    expect(mutateFinding).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    fireEvent.click(screen.getByText("Dismiss"));
    expect(mutateFinding).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });

    // Present (Turn into eval case only renders when the handler prop is
    // passed) — TabsView always passes it, matching FindingsPanel's reuse.
    expect(screen.getByText("Turn into eval case")).toBeInTheDocument();
  });

  it("'View trace' in the summary card opens RunTraceDrawer with the selected agent's runId (AC-21)", () => {
    renderView();
    fireEvent.click(screen.getByText("Tabs"));
    expect(screen.queryByTestId("run-trace-drawer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("View trace"));

    const drawer = screen.getByTestId("run-trace-drawer");
    expect(drawer).toHaveAttribute("data-run-id", "r1");
  });
});
