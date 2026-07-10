import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { TraceBody } from "../TraceBody/TraceBody";
import { AttachedSpecsModal } from "./AttachedSpecsModal";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: null,
    memory: null,
    specs: null,
    callers: null,
    repo_map: null,
    pr_description: null,
    specs_snapshot: null,
    user: "Review PR #482",
  },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

const SNAPSHOT = [
  { path: "specs/api.md", content: "API spec content mentions rate limiting rules." },
  { path: "docs/readme.md", content: "General readme content, no relevant mention here." },
];

describe("Attached Specs row (TraceBody)", () => {
  it("does not render when specs_snapshot is null", () => {
    renderWithIntl(<TraceBody trace={BASE_TRACE} findings={[]} />);
    expect(screen.queryByText("Attached Specs")).not.toBeInTheDocument();
  });

  it("does not render when specs_snapshot is an empty array", () => {
    const trace: RunTrace = {
      ...BASE_TRACE,
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs_snapshot: [] },
    };
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);
    expect(screen.queryByText("Attached Specs")).not.toBeInTheDocument();
  });

  it("renders and opens the modal with a heading per doc", () => {
    const trace: RunTrace = {
      ...BASE_TRACE,
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs_snapshot: SNAPSHOT },
    };
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);
    // "Prompt assembly" section is collapsed by default — open it first.
    fireEvent.click(screen.getByText("Prompt assembly"));
    const row = screen.getByText("Attached Specs");
    fireEvent.click(row);
    expect(screen.getByText("### specs/api.md")).toBeInTheDocument();
    expect(screen.getByText("### docs/readme.md")).toBeInTheDocument();
  });
});

describe("AttachedSpecsModal", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("filters the displayed blocks by search substring", () => {
    renderWithIntl(<AttachedSpecsModal specs={SNAPSHOT} onClose={() => {}} />);
    expect(screen.getByText("### specs/api.md")).toBeInTheDocument();
    expect(screen.getByText("### docs/readme.md")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search in this block…"), {
      target: { value: "rate limiting" },
    });

    expect(screen.getByText("### specs/api.md")).toBeInTheDocument();
    expect(screen.queryByText("### docs/readme.md")).not.toBeInTheDocument();
  });

  it("copies the full concatenated text, unaffected by the search filter", () => {
    renderWithIntl(<AttachedSpecsModal specs={SNAPSHOT} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Search in this block…"), {
      target: { value: "rate limiting" },
    });
    fireEvent.click(screen.getByText("Copy"));

    const expected = SNAPSHOT.map((d) => `### ${d.path}\n\n${d.content}`).join("\n\n");
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(expected);
  });
});
