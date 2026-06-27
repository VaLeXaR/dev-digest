import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks", () => ({
  useSmartDiff: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(),
}));

import { useSmartDiff } from "@/lib/hooks";
import { useParams, useRouter } from "next/navigation";
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
          path: "src/core/auth.ts",
          additions: 10,
          deletions: 2,
          finding_lines: [] as number[],
          pseudocode_summary: null,
        },
      ],
    },
    {
      role: "wiring" as const,
      files: [
        {
          path: "src/routes/auth.ts",
          additions: 5,
          deletions: 0,
          finding_lines: [] as number[],
          pseudocode_summary: null,
        },
      ],
    },
    {
      role: "boilerplate" as const,
      files: [
        {
          path: "src/generated/types.ts",
          additions: 30,
          deletions: 30,
          finding_lines: [] as number[],
          pseudocode_summary: null,
        },
      ],
    },
  ],
  split_suggestion: {
    too_big: false,
    total_lines: 77,
    proposed_splits: [] as { name: string; files: string[] }[],
  },
};

describe("SmartDiffViewer", () => {
  it("renders three role section labels when data is present", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);
    vi.mocked(useParams).mockReturnValue({ repoId: "42", number: "7" });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);

    renderWithIntl(<SmartDiffViewer prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
  });

  it("boilerplate section body is hidden until header is clicked (collapsed by default)", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: BASE_DATA,
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);
    vi.mocked(useParams).mockReturnValue({ repoId: "42", number: "7" });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);

    renderWithIntl(<SmartDiffViewer prId="pr1" repoFullName="acme/repo" />);

    // Core and wiring files should be visible (expanded by default)
    expect(screen.getByTitle("src/core/auth.ts")).toBeInTheDocument();
    expect(screen.getByTitle("src/routes/auth.ts")).toBeInTheDocument();

    // Boilerplate file should NOT be visible (collapsed by default)
    expect(screen.queryByTitle("src/generated/types.ts")).not.toBeInTheDocument();

    // Click the Boilerplate header to expand
    fireEvent.click(screen.getByText("Boilerplate").closest("[role=button]")!);

    // Now the boilerplate file should be visible
    expect(screen.getByTitle("src/generated/types.ts")).toBeInTheDocument();
  });

  it("shows findings badge for files with finding_lines; clicking it calls router.push", () => {
    const pushMock = vi.fn();
    vi.mocked(useSmartDiff).mockReturnValue({
      data: {
        ...BASE_DATA,
        groups: [
          {
            role: "core" as const,
            files: [
              {
                path: "src/core/auth.ts",
                additions: 10,
                deletions: 2,
                finding_lines: [42, 99],
                pseudocode_summary: null,
              },
            ],
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);
    vi.mocked(useParams).mockReturnValue({ repoId: "42", number: "7" });
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    renderWithIntl(<SmartDiffViewer prId="pr1" repoFullName="acme/repo" />);

    const badge = screen.getByRole("button", {
      name: /findings in src\/core\/auth\.ts/,
    });
    expect(badge).toBeInTheDocument();

    fireEvent.click(badge);

    expect(pushMock).toHaveBeenCalledWith(
      "/repos/acme/repo/pulls/7?tab=findings",
    );
  });

  it("renders split banner when too_big is true", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: {
        ...BASE_DATA,
        split_suggestion: {
          too_big: true,
          total_lines: 1200,
          proposed_splits: [
            { name: "auth-core", files: ["src/core/auth.ts"] },
            { name: "auth-wiring", files: ["src/routes/auth.ts"] },
          ],
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);
    vi.mocked(useParams).mockReturnValue({ repoId: "42", number: "7" });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);

    renderWithIntl(<SmartDiffViewer prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByText(/This PR is large/)).toBeInTheDocument();
    expect(screen.getByText("auth-core")).toBeInTheDocument();
    expect(screen.getByText("auth-wiring")).toBeInTheDocument();
  });

  it("loading state renders without crashing; empty state (no groups) renders without crashing", () => {
    // Loading state
    vi.mocked(useSmartDiff).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useSmartDiff>);
    vi.mocked(useParams).mockReturnValue({ repoId: "42", number: "7" });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);

    const { unmount } = renderWithIntl(
      <SmartDiffViewer prId="pr1" repoFullName="acme/repo" />,
    );
    // Should render skeleton without crashing — no role labels visible
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    unmount();

    // Empty state: data with no groups
    vi.mocked(useSmartDiff).mockReturnValue({
      data: {
        groups: [],
        split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useSmartDiff>);

    renderWithIntl(<SmartDiffViewer prId="pr1" repoFullName={null} />);
    // Shows the groupedByRole label as empty state text
    expect(screen.getByText("Smart Diff · grouped by role")).toBeInTheDocument();
  });
});
