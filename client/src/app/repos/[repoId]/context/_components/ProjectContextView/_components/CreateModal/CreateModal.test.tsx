import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/context.json";

const createFolderMutate = vi.fn();
const createFileMutate = vi.fn();

vi.mock("../../../../../../../../lib/hooks/project-context", () => ({
  useCreateFolder: () => ({ mutate: createFolderMutate, isPending: false }),
  useCreateFile: () => ({ mutate: createFileMutate, isPending: false }),
}));

import { CreateModal } from "./CreateModal";

afterEach(() => {
  cleanup();
  createFolderMutate.mockClear();
  createFileMutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CreateModal", () => {
  it("a create-folder submit calls the mutation", () => {
    const onClose = vi.fn();
    renderWithIntl(<CreateModal repoId="r1" mode="folder" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Path"), {
      target: { value: "onboarding/architecture.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createFolderMutate).toHaveBeenCalledWith(
      { repoId: "r1", body: { root_folder: "specs", path: "onboarding/architecture.md" } },
      expect.objectContaining({ onSuccess: onClose }),
    );
    expect(createFileMutate).not.toHaveBeenCalled();
  });

  it("does not submit with an empty path", () => {
    renderWithIntl(<CreateModal repoId="r1" mode="folder" onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(createFolderMutate).not.toHaveBeenCalled();
  });

  it("create-file mode includes the inline content field", () => {
    renderWithIntl(<CreateModal repoId="r1" mode="file" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Path"), { target: { value: "docs/new.md" } });
    fireEvent.change(screen.getByLabelText("Content (Markdown)"), {
      target: { value: "# Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createFileMutate).toHaveBeenCalledWith(
      { repoId: "r1", body: { root_folder: "specs", path: "docs/new.md", content: "# Hello" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
