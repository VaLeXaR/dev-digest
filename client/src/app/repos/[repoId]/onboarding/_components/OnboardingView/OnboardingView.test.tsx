import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import type { OnboardingGetResponse, OnboardingTour } from "@devdigest/shared";

vi.mock("../../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main" },
  }),
}));

const mutate = vi.fn();
vi.mock("../../../../../../lib/hooks", () => ({
  useOnboarding: vi.fn(),
  useRegenerateOnboarding: vi.fn(() => ({ mutate, isPending: false })),
}));

import { useOnboarding, useRegenerateOnboarding } from "../../../../../../lib/hooks";
import { OnboardingView } from "./OnboardingView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function mockOnboarding(data: OnboardingGetResponse | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useOnboarding).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as ReturnType<typeof useOnboarding>);
}

function tour(overrides: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    architecture: { summary: "**payments-api** is a Node service.", diagram: "not a real mermaid diagram" },
    criticalPaths: [
      { path: "src/server.ts", rankPercentile: 0.98, fanIn: 14, why: "App bootstrap + middleware chain" },
    ],
    runLocally: {
      aiGenerated: true,
      commands: [{ command: "pnpm install", comment: undefined }, { command: "pnpm dev", comment: "http://localhost:3000" }],
    },
    readingPath: [
      { path: "src/router.ts", reason: "See the whole request lifecycle in one file" },
      { path: "src/api/public/index.ts", reason: "Understand the public contract before touching it" },
    ],
    firstTasks: [
      {
        title: "Add rate limiting",
        rationale: "No rate limiting exists yet.",
        relatedFiles: ["src/middleware/auth.ts"],
        complexity: "medium",
      },
    ],
    meta: { filesIndexed: 12450, generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), indexedAtSha: "abc123" },
    ...overrides,
  };
}

describe("OnboardingView", () => {
  it("index_required: shows the empty state with no CTA and no header actions", () => {
    mockOnboarding({ state: "index_required" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("Index required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate onboarding tour/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("not_generated: shows the generate CTA and triggers regeneration on click", () => {
    mockOnboarding({ state: "not_generated" });
    renderWithIntl(<OnboardingView />);

    // Title and CTA share the same copy ("Generate onboarding tour") per the
    // mockup — assert both render rather than a single ambiguous getByText.
    expect(screen.getAllByText("Generate onboarding tour").length).toBe(2);
    const cta = screen.getByRole("button", { name: /generate onboarding tour/i });
    fireEvent.click(cta);
    expect(mutate).toHaveBeenCalledWith("r1");
  });

  it("ready: renders header with repo name, file count, relative refresh time, and no stale hint when SHAs match", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Generated from index of 12450 files · last refreshed 2h ago/)).toBeInTheDocument();
    expect(screen.queryByText(/index has changed since/)).not.toBeInTheDocument();
  });

  it("ready: appends the stale hint on the same subtitle line when the index has advanced", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "def456" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText(/index has changed since/)).toBeInTheDocument();
  });

  it("ready: Regenerate is disabled while a generate request is in flight", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    vi.mocked(useRegenerateOnboarding).mockReturnValue({ mutate, isPending: true } as unknown as ReturnType<
      typeof useRegenerateOnboarding
    >);
    renderWithIntl(<OnboardingView />);

    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
    vi.mocked(useRegenerateOnboarding).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
      typeof useRegenerateOnboarding
    >);
  });

  it("ready: renders critical-paths rows with an Open action", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
    expect(screen.getByText(/App bootstrap \+ middleware chain/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open" }).length).toBeGreaterThan(0);
  });

  it("ready: renders numbered run-locally commands with the AI-generated caption", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("AI-generated · review before running")).toBeInTheDocument();
  });

  it("ready: renders numbered reading-path entries in server order (never re-sorted)", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    const paths = screen.getAllByText(/src\/(router\.ts|api\/public\/index\.ts)/);
    expect(paths[0]).toHaveTextContent("src/router.ts");
  });

  it("ready: renders first-tasks with title, primary related file, and a complexity badge", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/auth.ts")).toBeInTheDocument();
    expect(screen.getByText("Medium complexity")).toBeInTheDocument();
  });

  it("ready: an invalid Mermaid string renders no diagram", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    const { container } = renderWithIntl(<OnboardingView />);

    // MermaidDiagram only injects an <svg id="dd-mermaid-N"> once mermaid.render
    // succeeds ("ok" state); invalid input short-circuits to "invalid" and the
    // component returns null. Scope to that id — icon svgs (chevrons, etc.)
    // are unrelated <svg> elements rendered elsewhere on the page.
    expect(container.querySelector('svg[id^="dd-mermaid-"]')).toBeNull();
  });

  it("ready: collapsing a card's chevron hides its content and re-clicking restores it", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
    const criticalPathsHeader = screen.getByRole("button", { name: "Critical paths section" });
    fireEvent.click(criticalPathsHeader);
    expect(screen.queryByText("src/server.ts")).not.toBeInTheDocument();

    fireEvent.click(criticalPathsHeader);
    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
  });

  it("ready: shows the ON-THIS-PAGE nav listing all five sections", () => {
    mockOnboarding({ state: "ready", tour: tour(), currentIndexedSha: "abc123" });
    renderWithIntl(<OnboardingView />);

    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Architecture overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Critical paths" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How to run locally" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guided reading path" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First tasks" })).toBeInTheDocument();
  });
});
