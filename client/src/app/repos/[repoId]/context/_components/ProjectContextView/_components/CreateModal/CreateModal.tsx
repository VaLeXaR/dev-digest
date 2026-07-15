/* CreateModal — T-15 create-folder / create-file form. One component, two
   modes: "folder" (root-folder + path → useCreateFolder) and "file"
   (root-folder + path + inline markdown content → useCreateFile). Server
   conflict/validation failures surface as a toast via the hooks'
   module-level `onError` (see `lib/hooks/project-context.ts`) — this
   component only needs to close itself on success. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Select } from "@devdigest/ui";
import { useCreateFile, useCreateFolder } from "../../../../../../../../lib/hooks/project-context";
import { ROOT_FOLDERS } from "../rootFolders";

export function CreateModal({
  repoId,
  mode,
  onClose,
}: {
  repoId: string;
  mode: "folder" | "file";
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const createFolder = useCreateFolder();
  const createFile = useCreateFile();

  const [rootFolder, setRootFolder] = React.useState<string>(ROOT_FOLDERS[0]);
  const [path, setPath] = React.useState("");
  const [content, setContent] = React.useState("");

  const pending = mode === "folder" ? createFolder.isPending : createFile.isPending;
  const canSubmit = rootFolder.length > 0 && path.trim().length > 0 && !pending;

  function handleSubmit() {
    if (!canSubmit) return;
    if (mode === "folder") {
      createFolder.mutate(
        { repoId, body: { root_folder: rootFolder, path: path.trim() } },
        { onSuccess: onClose },
      );
    } else {
      createFile.mutate(
        { repoId, body: { root_folder: rootFolder, path: path.trim(), content } },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Modal
      title={mode === "folder" ? t("create.folderTitle") : t("create.fileTitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? t("create.creating") : t("create.submit")}
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
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            {t("create.path")}
          </label>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t("create.pathPlaceholder")}
            aria-label={t("create.path")}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 7,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        {mode === "file" && (
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {t("create.content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              aria-label={t("create.content")}
              rows={10}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 7,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "var(--font-mono, monospace)",
                outline: "none",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
