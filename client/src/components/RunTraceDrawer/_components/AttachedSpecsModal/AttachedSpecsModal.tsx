/* AttachedSpecsModal — audit view for a run's injected project-context docs
   (trace.prompt_assembly.specs_snapshot). Renders a "### path" heading + full
   content per doc, a client-side substring filter over the rendered blocks,
   and a Copy control that copies the full concatenated (unfiltered) text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput } from "@devdigest/ui";
import type { PromptAssembly } from "@devdigest/shared";

export type SpecSnapshotDoc = NonNullable<PromptAssembly["specs_snapshot"]>[number];

function blockText(doc: SpecSnapshotDoc): string {
  return `### ${doc.path}\n\n${doc.content}`;
}

export function AttachedSpecsModal({
  specs,
  onClose,
}: {
  specs: SpecSnapshotDoc[];
  onClose: () => void;
}) {
  const t = useTranslations("prReview");
  const [q, setQ] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const ql = q.trim().toLowerCase();
  const shown = ql
    ? specs.filter((d) => d.path.toLowerCase().includes(ql) || d.content.toLowerCase().includes(ql))
    : specs;

  const copy = () => {
    const full = specs.map(blockText).join("\n\n");
    void navigator.clipboard?.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Modal
      width={960}
      title={t("context.modalTitle")}
      onClose={onClose}
      footer={
        <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy}>
          {copied ? t("context.copied") : t("context.copy")}
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <TextInput value={q} onChange={setQ} placeholder={t("context.searchPlaceholder")} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 24px" }}>
          {specs.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "32px 0" }}>
              {t("context.empty")}
            </div>
          ) : (
            shown.map((d) => (
              <div key={d.path} style={{ marginBottom: 24 }}>
                <div
                  className="mono"
                  style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)", marginBottom: 8 }}
                >
                  {`### ${d.path}`}
                </div>
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: "12px 14px",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    background: "var(--code-bg)",
                    borderRadius: 6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {d.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
