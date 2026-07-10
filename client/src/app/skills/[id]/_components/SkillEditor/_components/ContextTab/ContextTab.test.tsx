import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { DiscoveredDoc, Skill } from "@devdigest/shared";

const mockMutate = vi.fn();
const useDiscoveryMock = vi.fn();
const useSkillContextDocsMock = vi.fn();

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

vi.mock("../../../../../../../lib/hooks/project-context", () => ({
  useDiscovery: (...args: unknown[]) => useDiscoveryMock(...args),
  useSkillContextDocs: (...args: unknown[]) => useSkillContextDocsMock(...args),
  useSetSkillContextDocs: () => ({ mutate: mockMutate, isPending: false }),
  useDocContent: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { ContextTab } from "./ContextTab";

const DOCS: DiscoveredDoc[] = [
  { path: "specs/a.md", root_folder: "specs", filename: "a.md", tracked: true, token_estimate: 40, used_by_agents: 0 },
  { path: "docs/b.md", root_folder: "docs", filename: "b.md", tracked: false, token_estimate: 60, used_by_agents: 0 },
];

// Default fixture used by every test unless a test overrides one of the two
// mocks for its own scenario (e.g. the stale-badge cases below).
function mockDefaults() {
  useDiscoveryMock.mockReturnValue({
    data: {
      documents: DOCS,
      file_count: 2,
      token_total: 100,
      token_budget: 4000,
      scanned_at: "2026-07-09T00:00:00.000Z",
    },
  });
  useSkillContextDocsMock.mockReturnValue({ data: { paths: ["specs/a.md"] } });
}

beforeEach(mockDefaults);

afterEach(() => {
  cleanup();
  mockMutate.mockClear();
  useDiscoveryMock.mockReset();
  useSkillContextDocsMock.mockReset();
});

const SKILL: Skill = {
  id: "sk1",
  name: "Security checklist",
  description: "Flags secrets",
  type: "security",
  body: "# Rule",
  source: "manual",
  enabled: true,
  version: 1,
  created_at: "2026-07-01T00:00:00.000Z",
};

describe("ContextTab (skill editor)", () => {
  it("renders the SERIALIZES AS block with heading + one bullet per attached path in order", () => {
    render(<ContextTab skill={SKILL} />);

    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    const block = document.querySelector("pre");
    expect(block?.textContent).toBe("## Project specifications\n- specs/a.md");
  });

  it("sums attached docs' token_estimate in the footer", () => {
    render(<ContextTab skill={SKILL} />);

    expect(screen.getByText("1 attached · ~40 tokens")).toBeInTheDocument();
  });

  it("attaching a document appends its path and calls the mutation", () => {
    render(<ContextTab skill={SKILL} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach b.md" }));

    expect(mockMutate).toHaveBeenCalledWith(["specs/a.md", "docs/b.md"]);
  });

  it("detaching a document removes its path and calls the mutation", () => {
    render(<ContextTab skill={SKILL} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Detach a.md" }));

    expect(mockMutate).toHaveBeenCalledWith([]);
  });

  it("shows a stale/missing badge only for an attached path absent from current discovery", () => {
    // discovery only re-confirms specs/a.md; specs/missing.md is attached but
    // no longer discovered under the repo's root folders.
    useDiscoveryMock.mockReturnValue({
      data: {
        documents: [DOCS[0]],
        file_count: 1,
        token_total: 40,
        token_budget: 4000,
        scanned_at: "2026-07-09T00:00:00.000Z",
      },
    });
    useSkillContextDocsMock.mockReturnValue({ data: { paths: ["specs/a.md", "specs/missing.md"] } });

    render(<ContextTab skill={SKILL} />);

    // Exactly one stale badge — for the missing path only, not the still-present one.
    expect(screen.getByText("stale/missing")).toBeInTheDocument();
    expect(screen.getByLabelText("Detach specs/missing.md")).toBeInTheDocument();
    expect(screen.getByLabelText("Detach a.md")).toBeInTheDocument();
  });

  it("does not show a stale/missing badge when every attached path exists in discovery", () => {
    // Default fixture: paths=["specs/a.md"], which IS present in DOCS.
    render(<ContextTab skill={SKILL} />);

    expect(screen.queryByText("stale/missing")).not.toBeInTheDocument();
  });
});
