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
    expect(screen.getByText(/−33/)).toBeInTheDocument();
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

    // The patch has line 25 with WARNING finding — badge should show "warning"
    expect(screen.getByText("warning")).toBeInTheDocument();
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

    // summary button should be visible
    expect(screen.getByRole("button", { name: /summary/i })).toBeInTheDocument();

    cleanup();

    // Now render with null summary
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // summary button should NOT be visible (all files have null pseudocode_summary)
    expect(screen.queryByRole("button", { name: /summary/i })).not.toBeInTheDocument();
  });
});
