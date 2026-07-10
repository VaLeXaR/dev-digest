/* EditDocModal — T-15 in-app markdown editor for an untracked document.
   Mirrors the CodeMirror + @codemirror/lang-markdown setup in
   `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/ConfigTab.tsx`
   (inline usage, no shared extraction). Loads content lazily via
   useDocContent (only while this modal is mounted, same lazy-fetch pattern
   as PreviewModal) and saves via useEditDoc. The caller (ProjectContextView)
   is responsible for only rendering this component for a row whose live
   `tracked` is false — the server also re-verifies at save time. */
"use client";

import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useDocContent, useEditDoc } from "../../../../../../../../lib/hooks/project-context";

export function EditDocModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useDocContent(repoId, path, true);
  const editDoc = useEditDoc();

  const [body, setBody] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (data && !loaded) {
      setBody(data.content);
      setLoaded(true);
    }
  }, [data, loaded]);

  function handleSave() {
    editDoc.mutate({ repoId, body: { path, content: body } }, { onSuccess: onClose });
  }

  return (
    <Modal
      width={860}
      title={t("edit.title")}
      subtitle={path}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={handleSave}
            disabled={editDoc.isPending || isLoading || !loaded}
          >
            {editDoc.isPending ? t("edit.saving") : t("edit.save")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px" }}>
        {isLoading && <p>{t("preview.loading")}</p>}
        {!isLoading && isError && <p>{t("preview.loadError")}</p>}
        {!isLoading && !isError && (
          <CodeMirror
            value={body}
            height="400px"
            extensions={[markdown()]}
            theme={oneDark}
            onChange={setBody}
          />
        )}
      </div>
    </Modal>
  );
}
