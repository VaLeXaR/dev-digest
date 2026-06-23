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
  const [fileName, setFileName] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useImportPreviewUrl();
  const previewFile = useImportPreviewFile();
  const confirm = useImportConfirm();

  const isPending = previewUrl.isPending || previewFile.isPending;
  const fetchError = previewUrl.error ?? previewFile.error;

  function handleFileChange(file: File | null | undefined) {
    if (!file) return;
    setFileName(file.name);
  }

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
    try {
      const created = await confirm.mutateAsync(previews);
      router.replace(created[0] ? `/skills/${created[0].id}` : "/skills");
    } catch {
      // confirm.error is set by TanStack Query — displayed below
    }
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
        <div style={s.body}>
          <div style={s.modeTabs}>
            {(["file", "url"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={s.modeBtn(mode === m)}>
                {m === "file" ? "Upload file" : "Paste URL"}
              </button>
            ))}
          </div>

          {mode === "file" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.zip"
                aria-label="Upload skill file"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              <div
                style={s.dropZone(drag)}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const file = e.dataTransfer.files[0];
                  if (file && fileRef.current) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileRef.current.files = dt.files;
                    handleFileChange(file);
                  }
                }}
              >
                {fileName ? (
                  <div style={s.fileName}>📄 {fileName}</div>
                ) : (
                  <>
                    <div>Drop a file here or click to browse</div>
                    <div style={s.dropZoneHint}>.md or .zip</div>
                  </>
                )}
              </div>
            </>
          )}

          {mode === "url" && (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo  or  raw URL"
              style={s.urlInput}
            />
          )}

          {fetchError && <div style={s.error}>{(fetchError as Error).message}</div>}
        </div>
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
      <div style={s.previewBody2}>
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
        {confirm.error && <div style={s.error}>{(confirm.error as Error).message}</div>}
      </div>
    </Modal>
  );
}
