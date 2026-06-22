"use client";

import React, { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

const SKILL_TYPES = [
  { value: "rubric", color: "var(--accent)" },
  { value: "convention", color: "#22c55e" },
  { value: "security", color: "#ef4444" },
  { value: "custom", color: "var(--text-secondary)" },
] as const;

type SkillTypeValue = (typeof SKILL_TYPES)[number]["value"];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const update = useUpdateSkill();
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [type, setType] = useState<SkillTypeValue>(skill.type);
  const [body, setBody] = useState(skill.body);

  const isDirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body;

  const slug = (name.trim().toLowerCase().replace(/\s+/g, "-") || "skill") + ".md";

  function handleSave() {
    update.mutate({ id: skill.id, patch: { name, description, type, body } });
  }

  return (
    <div>
      <div style={s.section}>
        <label style={s.label}>Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={s.input}
          placeholder="e.g. Security checklist"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={s.input}
          placeholder="Write as a directive — what the agent must do with this skill"
        />
        <div style={s.helper}>
          This text appears in the assembled prompt as context for the skill body.
        </div>
      </div>

      <div style={s.section}>
        <span style={s.label}>Type</span>
        <div style={s.typePicker}>
          {SKILL_TYPES.map(({ value, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              style={s.typeBtn(type === value, color)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Skill body *</label>
        <div style={s.editorHeader}>
          <span style={s.filename}>{slug}</span>
          {isDirty && <span style={s.unsaved}>unsaved</span>}
          <span style={s.tokens}>{estimateTokens(body)} tokens</span>
        </div>
        <CodeMirror
          value={body}
          height="400px"
          extensions={[markdown()]}
          theme={oneDark}
          onChange={setBody}
        />
      </div>

      <div style={s.saveRow}>
        <Button
          kind="primary"
          onClick={handleSave}
          disabled={!isDirty || update.isPending}
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
