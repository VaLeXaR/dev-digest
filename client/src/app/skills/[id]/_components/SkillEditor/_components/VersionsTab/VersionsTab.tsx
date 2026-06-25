"use client";

import React, { useState } from "react";
import { Icon, Modal, Button } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.replace(/^#+\s*/, "").slice(0, 80) || "Snapshot";
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const { data: versions = [], isLoading } = useSkillVersions(skill.id);
  const { mutate: update, isPending } = useUpdateSkill();
  const [viewing, setViewing] = useState<SkillVersion | null>(null);

  if (isLoading) return <div style={s.empty}>Loading…</div>;
  if (versions.length === 0) return <div style={s.empty}>No versions saved yet.</div>;

  const currentVersion = versions[0]?.version ?? skill.version;

  function handleRestore(body: string) {
    update({ id: skill.id, patch: { body } }, { onSuccess: () => setViewing(null) });
  }

  return (
    <>
      <div>
        <div style={s.header}>
          <div style={s.headerRow}>
            <span style={s.title}>Version history</span>
            <span style={s.countBadge}>{versions.length} versions</span>
          </div>
          <p style={s.subtitle}>
            Every save snapshots the body so eval runs stay reproducible against the exact text they scored.
          </p>
        </div>

        <div style={s.list}>
          {versions.map((v, i) => {
            const isCurrent = v.version === currentVersion;
            const isLast = i === versions.length - 1;
            return (
              <div key={v.version} style={isLast ? s.rowLast : s.row}>
                <span style={s.vBadge(isCurrent)}>v{v.version}</span>

                <div style={s.meta}>
                  <span style={s.preview}>{firstLine(v.body)}</span>
                  <span style={s.date}>
                    {new Date(v.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div style={s.actions}>
                  {isCurrent ? (
                    <span style={s.currentBadge}>Current</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        style={s.actionBtn}
                        onClick={() => setViewing(v)}
                      >
                        <Icon.Eye size={12} />
                        View
                      </button>
                      <button
                        type="button"
                        style={s.actionBtn}
                        onClick={() => handleRestore(v.body)}
                        disabled={isPending}
                      >
                        <Icon.RefreshCw size={12} />
                        Restore
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewing && (
        <Modal
          title={`v${viewing.version} — ${new Date(viewing.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`}
          onClose={() => setViewing(null)}
          footer={
            <div style={s.modalFooter}>
              <Button kind="ghost" onClick={() => setViewing(null)}>Close</Button>
              <Button
                kind="primary"
                onClick={() => handleRestore(viewing.body)}
                disabled={isPending}
              >
                <Icon.RefreshCw size={13} />
                Restore this version
              </Button>
            </div>
          }
        >
          <pre style={s.modalBody}>{viewing.body}</pre>
        </Modal>
      )}
    </>
  );
}
