import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/context.json";
import { ToastProvider, notify } from "../../../../../../../../lib/toast";

const uploadFileMutate = vi.fn();
const uploadArchiveMutate = vi.fn((_vars: unknown, _opts?: unknown) => {
  notify.error("Failed to upload archive");
});

vi.mock("../../../../../../../../lib/hooks/project-context", () => ({
  useUploadFile: () => ({ mutate: uploadFileMutate, isPending: false }),
  useUploadArchive: () => ({ mutate: uploadArchiveMutate, isPending: false }),
}));

import { UploadControls } from "./UploadControls";

afterEach(() => {
  cleanup();
  uploadFileMutate.mockClear();
  uploadArchiveMutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

function zipFile(name = "bundle.zip") {
  return new File(["PK"], name, { type: "application/zip" });
}

describe("UploadControls", () => {
  it("an upload error renders a toast without closing the modal or clearing the picked file", () => {
    renderWithIntl(<UploadControls repoId="r1" />);

    fireEvent.click(screen.getByRole("button", { name: "Upload archive" }));
    fireEvent.change(screen.getByLabelText("Choose file…"), {
      target: { files: [zipFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(uploadArchiveMutate).toHaveBeenCalled();
    expect(screen.getByText("Failed to upload archive")).toBeInTheDocument();
    // A failed mutation must not silently look like success: the mocked mutate
    // above never invokes its `onSuccess` callback (unlike the real hook on a
    // 2xx), so the modal — gated by local `mode` state — must still be open.
    expect(screen.getByText("Upload a .zip archive")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("rejects a non-.zip file client-side without calling the mutation", () => {
    renderWithIntl(<UploadControls repoId="r1" />);

    fireEvent.click(screen.getByRole("button", { name: "Upload archive" }));
    fireEvent.change(screen.getByLabelText("Choose file…"), {
      target: { files: [new File(["hi"], "notes.txt", { type: "text/plain" })] },
    });

    expect(screen.getByText("Only .zip archives can be uploaded here")).toBeInTheDocument();
    expect(uploadArchiveMutate).not.toHaveBeenCalled();
  });
});
