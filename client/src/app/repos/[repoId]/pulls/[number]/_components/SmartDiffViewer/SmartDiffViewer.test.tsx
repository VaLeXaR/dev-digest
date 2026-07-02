import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks", () => ({
  useSmartDiff: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "42" }),
}));

import { useSmartDiff } from "@/lib/hooks";
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
});
