"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Textarea, Icon } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s } from "../styles";

// The embedded runner bundle (`.devdigest/runner/index.js`) is a ~1.5 MB / 35k-line
// prebuilt ncc bundle. Dumping the full string into a `<pre>` with `pre-wrap` +
// `break-all` freezes the browser laying out ~1.6M characters, so non-editable
// previews are capped — the real file is regenerated server-side on install, the
// preview is only informational.
const PREVIEW_MAX_LINES = 500;
const PREVIEW_MAX_CHARS = 60_000;

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Cap an oversized preview to the first N lines / chars, whichever hits first. */
function clampPreview(contents: string): { text: string; truncated: boolean; shownLines: number; totalLines: number } {
  const totalLines = contents.split("\n").length;
  let text = contents;
  let truncated = false;
  if (text.length > PREVIEW_MAX_CHARS) {
    text = text.slice(0, PREVIEW_MAX_CHARS);
    truncated = true;
  }
  const lines = text.split("\n");
  if (lines.length > PREVIEW_MAX_LINES) {
    text = lines.slice(0, PREVIEW_MAX_LINES).join("\n");
    truncated = true;
  }
  return { text, truncated, shownLines: text.split("\n").length, totalLines };
}

/** Step 2 — Preview (design/03-wizard-2-preview.png). Renders whatever the
    server (T-02) returns as `CiFile[]` — the mockup's own YAML
    (`OPENAI_API_KEY`/`review-action@v1`) is a known placeholder error, not
    something to reproduce (spec Assumptions). Only the file marked
    `editable` (the generated workflow) is locally editable (AC-6); edits are
    preview-local — Install always regenerates from the wizard's own inputs
    (AC-47). */
export function PreviewStep({
  files,
  loading,
  selectedPath,
  onSelectPath,
  editedWorkflow,
  onEditWorkflow,
  onBack,
  onContinue,
}: {
  files: CiFile[];
  loading: boolean;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  editedWorkflow: string | null;
  onEditWorkflow: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");
  const selected = files.find((f) => f.path === selectedPath) ?? files[0] ?? null;
  // Only the read-only `<pre>` path needs clamping; the editable file is the small
  // generated workflow YAML rendered in a Textarea.
  const preview = selected && !selected.editable ? clampPreview(selected.contents) : null;

  return (
    <div style={s.body}>
      {loading && !files.length ? (
        <div style={s.generating}>{t("exportWizard.generating")}</div>
      ) : (
        <div style={s.previewLayout}>
          <div style={s.filesPanel}>
            <span style={s.filesHeading}>{t("exportWizard.filesToCreate")}</span>
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                style={s.fileRow(f.path === selected?.path)}
                onClick={() => onSelectPath(f.path)}
              >
                <Icon.FileText size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {f.path}
              </button>
            ))}
          </div>
          <div style={s.contentPanel}>
            {selected && (
              <>
                <div style={s.contentHeader}>
                  <span className="mono" style={s.contentPath}>{selected.path}</span>
                  {selected.editable && <Badge icon="Edit">{t("exportWizard.editable")}</Badge>}
                </div>
                {selected.editable ? (
                  <Textarea
                    value={editedWorkflow ?? selected.contents}
                    onChange={onEditWorkflow}
                    rows={16}
                    mono
                  />
                ) : preview ? (
                  <>
                    {preview.truncated && (
                      <div style={s.previewNotice}>
                        {t("exportWizard.previewTruncated", {
                          shown: preview.shownLines,
                          total: preview.totalLines,
                          size: formatBytes(selected.contents.length),
                        })}
                      </div>
                    )}
                    <pre className="mono" style={s.contentBody}>{preview.text}</pre>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
      <div style={{ ...s.footer, marginTop: 20 }}>
        <Button kind="secondary" icon="ChevronLeft" onClick={onBack}>
          {t("exportWizard.back")}
        </Button>
        <div style={s.footerRight}>
          <Button kind="primary" iconRight="ArrowRight" onClick={onContinue} disabled={loading}>
            {t("exportWizard.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
