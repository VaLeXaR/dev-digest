import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, DiscoveredDoc } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutateMock = vi.fn();

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

const useDiscoveryMock = vi.fn();
const useAgentContextDocsMock = vi.fn();

vi.mock("../../../../../../../lib/hooks/project-context", () => ({
  useDiscovery: (...args: unknown[]) => useDiscoveryMock(...args),
  useAgentContextDocs: (...args: unknown[]) => useAgentContextDocsMock(...args),
  useSetAgentContextDocs: () => ({ mutate: mutateMock, isPending: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
  useDiscoveryMock.mockReset();
  useAgentContextDocsMock.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function doc(overrides: Partial<DiscoveredDoc>): DiscoveredDoc {
  return {
    path: "specs/a.md",
    root_folder: "specs",
    filename: "a.md",
    tracked: true,
    token_estimate: 100,
    ...overrides,
  };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("T-12 Agent editor Context tab", () => {
  it("attaching a doc appends its path via useSetAgentContextDocs", () => {
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [doc({ path: "specs/a.md", filename: "a.md", token_estimate: 100 })],
        file_count: 1,
        token_total: 100,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    useAgentContextDocsMock.mockReturnValue({ data: { paths: [] } });

    renderTab();

    const checkbox = screen.getByLabelText("Attach specs/a.md");
    fireEvent.click(checkbox);

    expect(mutateMock).toHaveBeenCalledWith(["specs/a.md"]);
  });

  it("sums attached docs' token_estimate in the footer", () => {
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [
          doc({ path: "specs/a.md", filename: "a.md", token_estimate: 100 }),
          doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", token_estimate: 250 }),
        ],
        file_count: 2,
        token_total: 350,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    useAgentContextDocsMock.mockReturnValue({ data: { paths: ["specs/a.md", "docs/b.md"] } });

    renderTab();

    expect(screen.getByText("2 attached · ~350 tokens")).toBeInTheDocument();
  });

  it("shows a non-blocking budget warning without disabling attach when the sum exceeds the budget", () => {
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [
          doc({ path: "specs/a.md", filename: "a.md", token_estimate: 3000 }),
          doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", token_estimate: 2000 }),
          doc({ path: "docs/c.md", root_folder: "docs", filename: "c.md", token_estimate: 50 }),
        ],
        file_count: 3,
        token_total: 5050,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    useAgentContextDocsMock.mockReturnValue({ data: { paths: ["specs/a.md", "docs/b.md"] } });

    renderTab();

    expect(
      screen.getByText("Attached docs exceed the 4000-token budget — consider detaching some."),
    ).toBeInTheDocument();

    const checkbox = screen.getByLabelText("Attach docs/c.md");
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(mutateMock).toHaveBeenCalledWith(["specs/a.md", "docs/b.md", "docs/c.md"]);
  });

  it("shows a stale/missing badge for an attached path absent from discovery", () => {
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [doc({ path: "specs/a.md", filename: "a.md", token_estimate: 100 })],
        file_count: 1,
        token_total: 100,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    useAgentContextDocsMock.mockReturnValue({
      data: { paths: ["specs/a.md", "specs/deleted.md"] },
    });

    renderTab();

    expect(screen.getByText("stale/missing")).toBeInTheDocument();
    // The stale row is still toggleable (detachable).
    const staleCheckbox = screen.getByLabelText("Detach specs/deleted.md");
    expect(staleCheckbox).toBeChecked();
  });

  it("does not show a stale/missing badge when every attached path exists in discovery", () => {
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [
          doc({ path: "specs/a.md", filename: "a.md", token_estimate: 100 }),
          doc({ path: "docs/b.md", root_folder: "docs", filename: "b.md", token_estimate: 250 }),
        ],
        file_count: 2,
        token_total: 350,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    // Both attached paths resolve to a current discovery entry — neither is stale.
    useAgentContextDocsMock.mockReturnValue({ data: { paths: ["specs/a.md", "docs/b.md"] } });

    renderTab();

    expect(screen.queryByText("stale/missing")).not.toBeInTheDocument();
  });
});
