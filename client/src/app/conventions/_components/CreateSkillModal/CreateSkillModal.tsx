"use client";

import React, { useState } from "react";
import { Modal, Button, Select } from "@devdigest/ui";
import type { Skill, ConventionCandidate } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { s } from "./styles";

const SKILL_TYPES: Skill["type"][] = ["rubric", "convention", "security", "custom"];

interface CreateSkillModalProps {
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}

function assembleSkillBody(repoName: string, candidates: ConventionCandidate[]): string {
  const lines: string[] = [
    `# ${repoName}-conventions`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
  ];

  for (const c of candidates) {
    const slug = c.rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    lines.push(`## ${slug}`);
    lines.push(c.rule);
    lines.push('');
    if (c.evidence_path) {
      lines.push(`Detected in \`${c.evidence_path}\`:`);
      if (c.evidence_snippet) {
        lines.push('```');
        lines.push(c.evidence_snippet);
        lines.push('```');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function CreateSkillModal({ repoName, accepted, onClose }: CreateSkillModalProps) {
  const createSkill = useCreateSkill();

  const defaultBody = assembleSkillBody(repoName, accepted);

  const [name, setName] = useState(`${repoName}-conventions`);
  const [description, setDescription] = useState(
    `${accepted.length} house convention${accepted.length !== 1 ? "s" : ""} extracted from ${repoName}`
  );
  const [type, setType] = useState<Skill["type"]>("convention");
  const [enabled, setEnabled] = useState(true);
  const [body, setBody] = useState(defaultBody);
  const [success, setSuccess] = useState(false);

  const tokenCount = Math.ceil(body.length / 4);

  async function handleSubmit() {
    await createSkill.mutateAsync({ name, description, type, enabled, body, source: "manual" });
    setSuccess(true);
    setTimeout(() => onClose(), 1500);
  }

  return (
    <Modal
      width={760}
      title="Create skill from conventions"
      subtitle={`${repoName}-conventions`}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {success && (
            <span style={s.successMsg}>Saved as v1 · added to Skills Lab</span>
          )}
          <Button kind="ghost" onClick={onClose} disabled={createSkill.isPending}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || createSkill.isPending || success}
          >
            {createSkill.isPending ? "Creating…" : "Create ✦"}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {/* Info box */}
        <div style={s.infoBox}>
          <span style={s.infoIcon}>ℹ️</span>
          <span>
            Merged from {accepted.length} accepted convention{accepted.length !== 1 ? "s" : ""} in{" "}
            <strong>{repoName}</strong>.{" "}
            Everything below is editable before you save.
          </span>
        </div>

        {/* Name */}
        <div style={s.field}>
          <label htmlFor="csm-name" style={s.label}>Name *</label>
          <input
            id="csm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={s.input}
          />
        </div>

        {/* Description */}
        <div style={s.field}>
          <label htmlFor="csm-desc" style={s.label}>Description</label>
          <input
            id="csm-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={s.input}
          />
        </div>

        {/* Type + Enabled */}
        <div style={s.fieldRow}>
          <div>
            <span style={s.label}>Type</span>
            <Select
              value={type}
              onChange={(v) => setType(v as Skill["type"])}
              options={SKILL_TYPES}
            />
          </div>
          <div>
            <span style={s.label}>Enabled</span>
            <div style={s.toggleRow}>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                style={s.toggleTrack(enabled)}
                onClick={() => setEnabled((v) => !v)}
              >
                <span style={s.toggleThumb(enabled)} />
              </button>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {enabled ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>

        {/* Skill body */}
        <div style={s.fieldLast}>
          <div style={s.labelRow}>
            <label htmlFor="csm-body" style={{ ...s.label, marginBottom: 0 }}>
              Skill body *
            </label>
            <span style={s.tokenCount}>{tokenCount} tokens</span>
          </div>
          <textarea
            id="csm-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={s.textarea}
          />
        </div>
      </div>
    </Modal>
  );
}
