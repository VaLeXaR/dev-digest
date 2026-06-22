"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button } from "@devdigest/ui";
import type { SkillPreview } from "@devdigest/shared";
import {
  useImportPreviewUrl,
  useImportPreviewFile,
  useImportConfirm,
} from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

type Mode = "file" | "url";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"source" | "preview">("source");
  const [mode, setMode] = useState<Mode>("file");
  const [url, setUrl] = useState("");
  const [previews, setPreviews] = useState<SkillPreview[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useImportPreviewUrl();
  const previewFile = useImportPreviewFile();
  const confirm = useImportConfirm();

  const isPending = previewUrl.isPending || previewFile.isPending;
  const fetchError = previewUrl.error ?? previewFile.error;

  async function handleFetch() {
    let result: SkillPreview[];
    if (mode === "url") {
      result = await previewUrl.mutateAsync(url);
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file) return;
      result = await previewFile.mutateAsync(file);
    }
    setPreviews(result);
    setStep("preview");
  }

  async function handleConfirm() {
    const created = await confirm.mutateAsync(previews);
    onClose();
    if (created[0]) router.push(`/skills/${created[0].id}`);
  }

  if (step === "source") {
    return (
      <Modal
        title="Import skill"
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button kind="primary" onClick={handleFetch} disabled={isPending}>
              {isPending ? "Fetching…" : "Preview"}
            </Button>
          </div>
        }
      >
        <div style={s.modeTabs}>
          {(["file", "url"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={s.modeBtn(mode === m)}>
              {m === "file" ? "Upload file" : "Paste URL"}
            </button>
          ))}
        </div>
        {mode === "file" && (
          <input ref={fileRef} type="file" accept=".md,.zip" style={s.input} />
        )}
        {mode === "url" && (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/…"
            style={s.input}
          />
        )}
        {fetchError && <div style={s.error}>{(fetchError as Error).message}</div>}
      </Modal>
    );
  }

  return (
    <Modal
      title={`Import ${previews.length} skill${previews.length !== 1 ? "s" : ""}`}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={() => setStep("source")}>
            Back
          </Button>
          <Button kind="primary" onClick={handleConfirm} disabled={confirm.isPending}>
            {confirm.isPending ? "Importing…" : "Confirm import"}
          </Button>
        </div>
      }
    >
      <div style={s.trustWarning}>
        ⚠ Importing a skill adds its instructions to your agent&apos;s prompt. Only import skills
        from sources you trust.
      </div>
      {previews.map((p, i) => (
        <div key={i} style={s.previewCard}>
          <div style={s.previewHeader}>
            <span style={s.previewName}>{p.name}</span>
            <span style={s.previewType}>{p.type}</span>
          </div>
          <div style={s.previewBody}>{p.body.slice(0, 400)}</div>
        </div>
      ))}
    </Modal>
  );
}
