import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import type { DiscoveredDoc, DiscoveryResponse } from "@devdigest/shared";

vi.mock("../../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", name: "my-repo", full_name: "org/my-repo" },
  }),
}));

vi.mock("../../../../../../lib/hooks/project-context", () => ({
  useDiscovery: vi.fn(),
  useRefreshDiscovery: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDocContent: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useCreateFolder: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateFile: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUploadFile: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUploadArchive: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useEditDoc: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useDiscovery } from "../../../../../../lib/hooks/project-context";
import { ProjectContextView } from "./ProjectContextView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function doc(overrides: Partial<DiscoveredDoc>): DiscoveredDoc {
  return {
    path: "specs/a.md",
    root_folder: "specs",
    filename: "a.md",
    tracked: true,
    token_estimate: 120,
    ...overrides,
  };
}

function discovery(overrides: Partial<DiscoveryResponse>): DiscoveryResponse {
  return {
    documents: [],
    file_count: 0,
    token_total: 0,
    token_budget: 4000,
    scanned_at: null,
    ...overrides,
  };
}

function mockDiscovery(data: DiscoveryResponse | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useDiscovery).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as ReturnType<typeof useDiscovery>);
}

describe("ProjectContextView", () => {
  it("renders rows with root-folder and tracked badges", () => {
    const documents = [
      doc({ path: "specs/a.md", root_folder: "specs", tracked: true, token_estimate: 120 }),
      doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", tracked: false, token_estimate: 80 }),
    ];
    mockDiscovery(discovery({ documents, file_count: 2, token_total: 200 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("docs/b.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("tracked")).toBeInTheDocument();
    expect(screen.getByText("untracked")).toBeInTheDocument();
    expect(screen.getByText("~120 tokens")).toBeInTheDocument();
    expect(screen.getByText("~80 tokens")).toBeInTheDocument();
  });

  it("narrows rows via the filter box", () => {
    const documents = [
      doc({ path: "specs/alpha.md", root_folder: "specs" }),
      doc({ path: "docs/beta.md", root_folder: "docs", filename: "beta.md" }),
    ];
    mockDiscovery(discovery({ documents, file_count: 2, token_total: 240 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("specs/alpha.md")).toBeInTheDocument();
    expect(screen.getByText("docs/beta.md")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), {
      target: { value: "alpha" },
    });

    expect(screen.getByText("specs/alpha.md")).toBeInTheDocument();
    expect(screen.queryByText("docs/beta.md")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no discovered documents", () => {
    mockDiscovery(discovery({ documents: [], file_count: 0, token_total: 0 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("No documents found")).toBeInTheDocument();
  });

  it("shows no Edit action for a tracked document", () => {
    mockDiscovery(discovery({ documents: [doc({ path: "specs/a.md", tracked: true })], file_count: 1 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("shows an Edit action for an untracked document", () => {
    mockDiscovery(discovery({ documents: [doc({ path: "docs/b.md", tracked: false })], file_count: 1 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("footer shows count, summed tokens, and last scan time", () => {
    const documents = [doc({ path: "specs/a.md" }), doc({ path: "specs/c.md", filename: "c.md" })];
    mockDiscovery(
      discovery({
        documents,
        file_count: 2,
        token_total: 240,
        scanned_at: "2026-07-09T10:00:00.000Z",
      }),
    );

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("2 documents · ~240 tokens")).toBeInTheDocument();
    expect(screen.getByText(/Last scanned/)).toBeInTheDocument();
  });
});
