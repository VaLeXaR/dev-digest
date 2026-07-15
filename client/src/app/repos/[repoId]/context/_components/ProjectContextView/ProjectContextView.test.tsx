import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import type { DiscoveredDoc, DiscoveryResponse, DocContentResponse } from "@devdigest/shared";

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

// CodeMirror relies on browser layout internals not worth exercising here —
// stub it as a plain textarea so the inline-editor tests can assert on
// presence/value without mounting a real editor (no prior test in this
// codebase mounts @uiw/react-codemirror for real; see client/INSIGHTS.md).
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      aria-label="markdown editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
vi.mock("@codemirror/lang-markdown", () => ({ markdown: () => ({}) }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: {} }));

import { useDiscovery, useDocContent } from "../../../../../../lib/hooks/project-context";
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
    used_by_agents: 0,
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
    coverage_pct: null,
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

function mockDocContent(data: DocContentResponse | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useDocContent).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useDocContent>);
}

describe("ProjectContextView", () => {
  it("renders filename-only rows (no metadata sub-line) with a selection state", () => {
    const documents = [
      doc({ path: "specs/a.md", root_folder: "specs", filename: "a.md", tracked: true, token_estimate: 120 }),
      doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", tracked: false, token_estimate: 80 }),
    ];
    mockDiscovery(discovery({ documents, file_count: 2, token_total: 200 }));

    renderWithIntl(<ProjectContextView />);

    const rowA = screen.getByRole("button", { name: "a.md" });
    const rowB = screen.getByRole("button", { name: "b.md" });
    expect(rowA).toBeInTheDocument();
    expect(rowB).toBeInTheDocument();
    expect(screen.queryByText("tracked")).not.toBeInTheDocument();
    expect(screen.queryByText("~120 tokens")).not.toBeInTheDocument();

    expect(rowA.style.background).toBe("transparent");
    fireEvent.click(rowA);
    expect(rowA.style.background).toBe("var(--accent-bg)");
  });

  it("exposes root folder, tracked status, and token estimate via the detail title's tooltip", () => {
    const documents = [
      doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", tracked: false, token_estimate: 80 }),
    ];
    mockDiscovery(discovery({ documents, file_count: 1, token_total: 80 }));

    renderWithIntl(<ProjectContextView />);
    fireEvent.click(screen.getByRole("button", { name: "b.md" }));

    expect(screen.getByRole("heading", { name: "b.md" })).toHaveAttribute(
      "title",
      "docs/b.md — untracked · ~80 tokens",
    );
  });

  it("filter box is hidden until the search icon is toggled, then narrows rows", () => {
    const documents = [
      doc({ path: "specs/alpha.md", root_folder: "specs", filename: "alpha.md" }),
      doc({ path: "docs/beta.md", root_folder: "docs", filename: "beta.md" }),
    ];
    mockDiscovery(discovery({ documents, file_count: 2, token_total: 240 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.queryByPlaceholderText("Filter documents…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter documents…" }));

    expect(screen.getByRole("button", { name: /alpha\.md/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /beta\.md/ })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), {
      target: { value: "alpha" },
    });

    expect(screen.getByRole("button", { name: /alpha\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /beta\.md/ })).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no discovered documents", () => {
    mockDiscovery(discovery({ documents: [], file_count: 0, token_total: 0 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("No documents found")).toBeInTheDocument();
  });

  it("shows the empty-detail prompt until a row is selected, then shows the doc in the right pane", () => {
    const documents = [doc({ path: "specs/a.md", filename: "a.md", tracked: true, used_by_agents: 3 })];
    mockDiscovery(discovery({ documents, file_count: 1, token_total: 120, coverage_pct: 50 }));

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("Select a document")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /a\.md/ }));

    expect(screen.getByRole("heading", { name: "a.md" })).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
  });

  it("shows no Edit toggle for a tracked document", () => {
    const documents = [doc({ path: "specs/a.md", filename: "a.md", tracked: true })];
    mockDiscovery(discovery({ documents, file_count: 1 }));

    renderWithIntl(<ProjectContextView />);
    fireEvent.click(screen.getByRole("button", { name: /a\.md/ }));

    expect(screen.getByRole("button", { name: "preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
  });

  it("reveals the inline markdown editor for an untracked document", () => {
    const documents = [doc({ path: "docs/b.md", filename: "b.md", tracked: false })];
    mockDiscovery(discovery({ documents, file_count: 1 }));
    mockDocContent({ path: "docs/b.md", content: "# Hello" });

    renderWithIntl(<ProjectContextView />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));

    const editToggle = screen.getByRole("button", { name: "edit" });
    fireEvent.click(editToggle);

    expect(screen.getByLabelText("markdown editor")).toHaveValue("# Hello");
  });

  it("renders the coverage ring value and a null-safe placeholder when unset", () => {
    const documents = [doc({ path: "specs/a.md", filename: "a.md" })];
    mockDiscovery(discovery({ documents, file_count: 1, coverage_pct: 42 }));

    renderWithIntl(<ProjectContextView />);
    fireEvent.click(screen.getByRole("button", { name: /a\.md/ }));

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Coverage")).toBeInTheDocument();
  });

  it("footer shows count, summed tokens, and last scan time — no 'chunks' wording", () => {
    const documents = [doc({ path: "specs/a.md", filename: "a.md" }), doc({ path: "specs/c.md", filename: "c.md" })];
    mockDiscovery(
      discovery({
        documents,
        file_count: 2,
        token_total: 240,
        scanned_at: "2026-07-09T10:00:00.000Z",
      }),
    );

    renderWithIntl(<ProjectContextView />);

    expect(screen.getByText("Indexed: 2 files · ~240 tokens")).toBeInTheDocument();
    expect(screen.getByText(/last scanned/)).toBeInTheDocument();
    expect(screen.queryByText(/chunks/i)).not.toBeInTheDocument();
  });
});
