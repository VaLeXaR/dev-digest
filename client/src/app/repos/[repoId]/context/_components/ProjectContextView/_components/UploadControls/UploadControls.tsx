/* UploadControls — T-15 upload-single-.md / upload-.zip affordances. A
   self-contained widget: renders its own two trigger buttons and manages its
   own modal + file-picker state, so ProjectContextView only needs to mount
   `<UploadControls repoId={repoId} />` once. Client-side pre-checks
   (extension, 10 MB size) short-circuit with a toast before any network
   call; server-side conflict/zip-slip/oversize failures surface via the
   `useUploadFile`/`useUploadArchive` hooks' own `onError` toast
   (`lib/hooks/project-context.ts`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Select } from "@devdigest/ui";
import { useUploadArchive, useUploadFile } from "../../../../../../../../lib/hooks/project-context";
import { notify } from "../../../../../../../../lib/toast";
import { ROOT_FOLDERS } from "../rootFolders";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

export function UploadControls({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const uploadFile = useUploadFile();
  const uploadArchive = useUploadArchive();

  const [mode, setMode] = React.useState<"file" | "archive" | null>(null);
  const [rootFolder, setRootFolder] = React.useState<string>(ROOT_FOLDERS[0]);
  const [path, setPath] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  function openModal(next: "file" | "archive") {
    setMode(next);
    setRootFolder(ROOT_FOLDERS[0]);
    setPath("");
    setFile(null);
  }

  function closeModal() {
    setMode(null);
    setPath("");
    setFile(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    const expectedExt = mode === "archive" ? ".zip" : ".md";
    if (!picked.name.toLowerCase().endsWith(expectedExt)) {
      notify.error(mode === "archive" ? t("upload.typeErrorArchive") : t("upload.typeErrorFile"));
      e.target.value = "";
      setFile(null);
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      notify.error(t("upload.sizeError"));
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(picked);
    if (mode === "file" && !path) setPath(picked.name);
  }

  const pending = mode === "file" ? uploadFile.isPending : uploadArchive.isPending;
  const canSubmit =
    !!file && rootFolder.length > 0 && (mode === "archive" || path.trim().length > 0) && !pending;

  function handleSubmit() {
    if (!file || !canSubmit) return;
    if (mode === "file") {
      uploadFile.mutate({ repoId, rootFolder, path: path.trim(), file }, { onSuccess: closeModal });
    } else if (mode === "archive") {
      uploadArchive.mutate({ repoId, rootFolder, file }, { onSuccess: closeModal });
    }
  }

  return (
    <>
      <Button kind="secondary" size="sm" icon="Upload" onClick={() => openModal("file")}>
        {t("upload.file")}
      </Button>
      <Button kind="secondary" size="sm" icon="Upload" onClick={() => openModal("archive")}>
        {t("upload.archive")}
      </Button>

      {mode && (
        <Modal
          title={mode === "file" ? t("upload.fileTitle") : t("upload.archiveTitle")}
          onClose={closeModal}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button kind="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button kind="primary" onClick={handleSubmit} disabled={!canSubmit}>
                {pending ? t("upload.uploading") : t("upload.submit")}
              </Button>
            </div>
          }
        >
          <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                {t("create.rootFolder")}
              </label>
              <Select value={rootFolder} onChange={setRootFolder} options={[...ROOT_FOLDERS]} />
            </div>
            {mode === "file" && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {t("create.path")}
                </label>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t("create.pathPlaceholder")}
                  aria-label={t("create.path")}
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                {t("upload.chooseFile")}
              </label>
              <input
                type="file"
                accept={mode === "archive" ? ".zip" : ".md"}
                onChange={handleFileChange}
                aria-label={t("upload.chooseFile")}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
