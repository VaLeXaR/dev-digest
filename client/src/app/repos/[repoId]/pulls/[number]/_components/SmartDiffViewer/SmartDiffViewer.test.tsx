import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks", () => ({
  useSmartDiff: vi.fn(),
  useLineContext: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGenerateFileSummary: vi.fn(() => ({ mutate: vi.fn(), isPending: false, variables: undefined })),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "42" }),
}));

import { useSmartDiff, useLineContext, useGenerateFileSummary } from "@/lib/hooks";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_DATA = {
  groups: [
    {
      role: "core" as const,
      files: [
        {
          path: "src/middleware/rateLimit.ts",
          additions: 84,
          deletions: 8,
          patch: "@@ -24,3 +24,5 @@\n context\n+const key = bucketKey(req);\n+const count = await redis.incr(key);",
          findings: [{ line: 25, severity: "WARNING" }],
          pseudocode_summary: null,
        },
      ],
    },
    {
      role: "wiring" as const,
      files: [
        {
          path: "src/server.ts",
          additions: 8,
          deletions: 1,
          patch: "@@ -1,1 +1,1 @@\n ctx",
          findings: [] as { line: number; severity: string }[],
          pseudocode_summary: null,
        },
      ],
    },
    {
      role: "boilerplate" as const,
      files: [
        {
          path: "package-lock.json",
          additions: 92,
          deletions: 24,
          patch: null,
          findings: [] as { line: number; severity: string }[],
          pseudocode_summary: null,
        },
      ],
    },
  ],
  split_suggestion: {
    too_big: false,
    total_lines: 209,
    proposed_splits: [] as { name: string; files: string[] }[],
  },
};

describe("SmartDiffViewer", () => {
  it("renders REVIEWER-ORDERED DIFF header", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText("REVIEWER-ORDERED DIFF")).toBeInTheDocument();
  });

  it("renders total stats line with file count and additions/deletions", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // 3 total files across all groups
    expect(screen.getByText(/3 files/)).toBeInTheDocument();
    // +184 additions (84+8+92)
    expect(screen.getByText(/\+184/)).toBeInTheDocument();
    // -33 deletions (8+1+24)
    expect(screen.getByText(/-33/)).toBeInTheDocument();
  });

  it("renders Core logic, Wiring, Boilerplate section headers", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
  });

  it("boilerplate is collapsed by default; clicking its header reveals it", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // Boilerplate file should NOT be visible (collapsed by default)
    expect(screen.queryByTitle("package-lock.json")).not.toBeInTheDocument();

    // Core and wiring files should be visible (expanded by default)
    expect(screen.getByTitle("src/middleware/rateLimit.ts")).toBeInTheDocument();
    expect(screen.getByTitle("src/server.ts")).toBeInTheDocument();

    // Click Boilerplate header to expand
    fireEvent.click(screen.getByText("Boilerplate").closest("[role=button]")!);

    // Now boilerplate file should be visible
    expect(screen.getByTitle("package-lock.json")).toBeInTheDocument();
  });

  it("shows severity badge for lines matching findings", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // The patch has line 25 with WARNING finding — badge shows "⚠ warning" in one span
    expect(screen.getByText(/warning/)).toBeInTheDocument();
  });

  it("shows summary button when pseudocode_summary is non-null, hidden when null", () => {
    const dataWithSummary = {
      ...BASE_DATA,
      groups: [
        {
          role: "core" as const,
          files: [
            {
              path: "src/middleware/rateLimit.ts",
              additions: 84,
              deletions: 8,
              patch: null,
              findings: [] as { line: number; severity: string }[],
              pseudocode_summary: "This function rate-limits by bucket key",
            },
          ],
        },
      ],
    };

    vi.mocked(useSmartDiff).mockReturnValue({
      data: dataWithSummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // summary button should be visible (aria-label starts with "summary for")
    expect(screen.getByRole("button", { name: /^summary for/i })).toBeInTheDocument();

    cleanup();

    // Now render with null summary
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // summary button should NOT be visible (all files have null pseudocode_summary)
    expect(screen.queryByRole("button", { name: /^summary for/i })).not.toBeInTheDocument();
  });

  it("hides the 'What this does' text while the file is collapsed, and reveals it on expand", () => {
    const dataWithSummary = {
      ...BASE_DATA,
      groups: [
        {
          role: "core" as const,
          files: [
            {
              path: "src/middleware/rateLimit.ts",
              additions: 84,
              deletions: 8,
              patch: "@@ -24,3 +24,5 @@\n context\n+const key = bucketKey(req);",
              // No findings -> collapsed by default.
              findings: [] as { line: number; severity: string }[],
              pseudocode_summary: "This function rate-limits by bucket key",
            },
          ],
        },
      ],
    };
    vi.mocked(useSmartDiff).mockReturnValue({
      data: dataWithSummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // Collapsed by default (no findings) -> the summary button shows, but
    // the "What this does" text itself must not render yet.
    expect(screen.getByRole("button", { name: "summary for src/middleware/rateLimit.ts" })).toBeInTheDocument();
    expect(screen.queryByText("This function rate-limits by bucket key")).not.toBeInTheDocument();

    // Expand the file card (click the header, not the summary button).
    fireEvent.click(screen.getByTitle("src/middleware/rateLimit.ts"));

    expect(screen.getByText("This function rate-limits by bucket key")).toBeInTheDocument();
  });

  it("shows a 'generate summary' button for a file with a patch but no pseudocode_summary yet, and clicking it triggers generation", () => {
    const mutate = vi.fn();
    vi.mocked(useGenerateFileSummary).mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useGenerateFileSummary>);
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    const generateButton = screen.getByRole("button", {
      name: "generate summary for src/middleware/rateLimit.ts",
    });
    fireEvent.click(generateButton);
    expect(mutate).toHaveBeenCalledWith(
      "src/middleware/rateLimit.ts",
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("does not show a summary/generate button for a file with no patch and no existing summary", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(
      screen.queryByRole("button", { name: /summary for package-lock\.json/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the 'generating…' label and disables the button while THIS file's summary is being generated, without affecting other files in the same group", () => {
    // mutate() intentionally never calls its onSettled callback here, so the
    // per-file pending state (tracked locally, not via the shared mutation's
    // own isPending/variables) stays "true" for this assertion.
    vi.mocked(useGenerateFileSummary).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useGenerateFileSummary>);
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    const generateButton = screen.getByRole("button", {
      name: "generate summary for src/middleware/rateLimit.ts",
    });
    fireEvent.click(generateButton);

    expect(generateButton).toBeDisabled();
    expect(generateButton).toHaveTextContent(/generating/i);
  });

  it("generating one file's summary does not disable or affect a SIBLING file's generate button in the same role group (regression: shared-mutation pending state)", () => {
    // Both files live in the same "core" group, so both are rendered by the
    // SAME GroupSection instance sharing ONE useGenerateFileSummary() call —
    // this is exactly the scenario where the old isPending/variables-based
    // tracking broke (triggering file B reassigned the shared "which file"
    // state away from file A).
    const twoFilesSameGroup = {
      ...BASE_DATA,
      groups: [
        {
          role: "core" as const,
          files: [
            {
              path: "src/middleware/rateLimit.ts",
              additions: 84,
              deletions: 8,
              patch: "@@ -24,3 +24,5 @@\n context\n+const key = bucketKey(req);",
              findings: [] as { line: number; severity: string }[],
              pseudocode_summary: null,
            },
            {
              path: "src/other.ts",
              additions: 10,
              deletions: 1,
              patch: "@@ -1,1 +1,2 @@\n context\n+other change",
              findings: [] as { line: number; severity: string }[],
              pseudocode_summary: null,
            },
          ],
        },
      ],
    };
    vi.mocked(useGenerateFileSummary).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useGenerateFileSummary>);
    vi.mocked(useSmartDiff).mockReturnValue({
      data: twoFilesSameGroup,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    const rateLimitButton = screen.getByRole("button", {
      name: "generate summary for src/middleware/rateLimit.ts",
    });
    const otherButton = screen.getByRole("button", {
      name: "generate summary for src/other.ts",
    });

    fireEvent.click(rateLimitButton);

    expect(rateLimitButton).toBeDisabled();
    // The sibling file's own button, in the SAME group/SAME mutation hook
    // instance, must stay enabled/idle — it must not be driven by the shared
    // mutation's single isPending/variables.
    expect(otherButton).not.toBeDisabled();
    expect(otherButton).toHaveTextContent(/generate summary/i);

    // Now trigger the second file too, then confirm the first STAYS disabled
    // (didn't get silently re-enabled when the shared mutation's tracked
    // "variables" moved to the second file under the old implementation).
    fireEvent.click(otherButton);
    expect(rateLimitButton).toBeDisabled();
    expect(otherButton).toBeDisabled();
  });

  it("scrolls to the exact target line, not just the file, even when the file starts collapsed", async () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    const scrolled: string[] = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.getAttribute("data-line-no") ?? `file:${this.getAttribute("data-file-path")}`);
    });

    // "src/server.ts" (wiring) has findings: [] → collapsed by default. Its
    // one patch line resolves to lineNo 1 (see parsePatch: hunk "+1,1" then
    // one context line). This is exactly the race the fix addresses: the
    // line element does not exist in the DOM until GroupSection's own effect
    // expands the file.
    renderWithIntl(
      <SmartDiffViewer prId="pr1" targetFile="src/server.ts" targetLine={1} targetNonce={1} />,
    );

    // Wait for the MutationObserver-driven retry to find the now-mounted line.
    await vi.waitFor(() => {
      expect(scrolled).toContain("1");
    });

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("falls back to scrolling the file when the target line is outside every rendered diff hunk", async () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    const scrolled: string[] = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.getAttribute("data-line-no") ?? `file:${this.getAttribute("data-file-path")}`);
    });

    // "src/middleware/rateLimit.ts" (core) is expanded by default and its
    // patch only ever produces lineNo values around 25-27 — a blast-radius
    // caller line far outside the shown hunk (e.g. 9999) can never mount a
    // [data-line-no="9999"] element. Before this fix, the effect waited
    // forever for a line that structurally cannot appear and never scrolled
    // at all — the accordion opened with no movement. It must still land on
    // the file itself instead of silently doing nothing.
    renderWithIntl(
      <SmartDiffViewer
        prId="pr1"
        targetFile="src/middleware/rateLimit.ts"
        targetLine={9999}
        targetNonce={1}
      />,
    );

    await vi.waitFor(() => {
      expect(scrolled).toContain("file:src/middleware/rateLimit.ts");
    });
    expect(scrolled).not.toContain("9999");

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("renders the fetched out-of-diff context window and highlights the target line", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    // Simulate useLineContext having already resolved for line 9999 in
    // src/middleware/rateLimit.ts (the line the "falls back" test above
    // proved is outside every rendered hunk).
    vi.mocked(useLineContext).mockReturnValue({
      data: {
        file: "src/middleware/rateLimit.ts",
        target_line: 9999,
        lines: [
          { line: 9998, content: "const before = 1;" },
          { line: 9999, content: "const target = redis.incr(key);" },
          { line: 10000, content: "const after = 2;" },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useLineContext>);

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();

    renderWithIntl(
      <SmartDiffViewer
        prId="pr1"
        targetFile="src/middleware/rateLimit.ts"
        targetLine={9999}
        targetNonce={1}
      />,
    );

    expect(screen.getByText(/outside this diff, shown for context/)).toBeInTheDocument();
    const targetLineEl = document.querySelector('[data-line-no="9999"]');
    expect(targetLineEl).not.toBeNull();
    expect(targetLineEl?.textContent).toContain("const target = redis.incr(key);");
    // Neighbor lines from the fetched window render too, without their own highlight.
    expect(screen.getByText("const before = 1;")).toBeInTheDocument();

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
});
