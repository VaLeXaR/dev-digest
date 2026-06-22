"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

const SKILL_TYPES = [
  { value: "rubric", color: "var(--accent)" },
  { value: "convention", color: "#22c55e" },
  { value: "security", color: "#ef4444" },
  { value: "custom", color: "var(--text-secondary)" },
] as const;

type SkillTypeValue = (typeof SKILL_TYPES)[number]["value"];

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<SkillTypeValue>("custom");

  async function handleCreate() {
    const skill = await create.mutateAsync({ name, description, type, body: "" });
    onClose();
    router.push(`/skills/${skill.id}`);
  }

  return (
    <Modal
      title="Create skill"
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={handleCreate}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.field}>
          <label htmlFor="skill-name" style={s.label}>Name *</label>
          <input
            id="skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Security checklist"
            style={s.input}
          />
        </div>
        <div style={s.field}>
          <label htmlFor="skill-desc" style={s.label}>Description</label>
          <input
            id="skill-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the agent should do with this skill"
            style={s.input}
          />
        </div>
        <div style={s.fieldLast}>
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
      </div>
    </Modal>
  );
}
