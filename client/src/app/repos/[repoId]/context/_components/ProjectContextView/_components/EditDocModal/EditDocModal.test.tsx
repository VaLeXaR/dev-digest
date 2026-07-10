import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/context.json";

const editDocMutate = vi.fn();

vi.mock("../../../../../../../../lib/hooks/project-context", () => ({
  useDocContent: () => ({
    data: { path: "docs/untracked.md", content: "# Draft" },
    isLoading: false,
    isError: false,
  }),
  useEditDoc: () => ({ mutate: editDocMutate, isPending: false }),
}));

import { EditDocModal } from "./EditDocModal";

afterEach(() => {
  cleanup();
  editDocMutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EditDocModal", () => {
  it("an untracked row opens the editor and saves", () => {
    const onClose = vi.fn();
    renderWithIntl(<EditDocModal repoId="r1" path="docs/untracked.md" onClose={onClose} />);

    // Content loaded lazily via useDocContent renders the editor (not a loading/error state).
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load this document")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(editDocMutate).toHaveBeenCalledWith(
      { repoId: "r1", body: { path: "docs/untracked.md", content: "# Draft" } },
      expect.objectContaining({ onSuccess: onClose }),
    );
  });
});
