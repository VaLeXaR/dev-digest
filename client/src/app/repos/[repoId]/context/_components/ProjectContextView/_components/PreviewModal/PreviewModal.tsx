/* PreviewModal — lazily fetches + markdown-renders a single doc's content via
   useDocContent, only while mounted (i.e. only while the row's Preview
   affordance is open). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Markdown, Modal } from "@devdigest/ui";
import { useDocContent } from "../../../../../../../../lib/hooks/project-context";

export function PreviewModal({
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

  return (
    <Modal
      title={t("preview.title")}
      subtitle={path}
      onClose={onClose}
      footer={
        <Button kind="secondary" size="sm" onClick={onClose}>
          {t("preview.close")}
        </Button>
      }
    >
      <div style={{ padding: "18px 24px" }}>
        {isLoading && <p>{t("preview.loading")}</p>}
        {!isLoading && isError && <p>{t("preview.loadError")}</p>}
        {!isLoading && !isError && <Markdown>{data?.content}</Markdown>}
      </div>
    </Modal>
  );
}
