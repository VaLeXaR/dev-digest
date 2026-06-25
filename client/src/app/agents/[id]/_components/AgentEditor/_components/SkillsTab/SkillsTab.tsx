"use client";

import React, { useRef, useState } from "react";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import {
  useAgentSkillLinks,
  useSetAgentSkills,
  useToggleAgentSkill,
} from "../../../../../../../lib/hooks/agents";
import { typeColor } from "../../../../../../../app/skills/_components/SkillCard/helpers";
import { s } from "./styles";

function SkillRow({
  skill,
  linked,
  enabled,
  dragOver,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  skill: Skill;
  linked: boolean;
  enabled: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragLeave?: () => void;
}) {
  const color = typeColor(skill.type);

  return (
    <div
      draggable={linked}
      onDragStart={linked ? onDragStart : undefined}
      onDragOver={linked ? onDragOver : undefined}
      onDrop={linked ? onDrop : undefined}
      onDragLeave={linked ? onDragLeave : undefined}
      style={linked ? s.row(enabled, dragOver) : s.unlinkedRow()}
    >
      <span style={linked ? s.drag : s.dragPlaceholder}>≡</span>
      <input
        type="checkbox"
        aria-label={linked ? `Disable ${skill.name}` : `Add ${skill.name}`}
        checked={linked && enabled}
        onChange={onToggle}
        style={s.checkbox}
      />
      <span style={s.skillName}>{skill.name}</span>
      {skill.description && <span style={s.skillDesc}>{skill.description}</span>}
      <span style={s.typeBadge(color)}>{skill.type}</span>
    </div>
  );
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const { data: allSkills = [] } = useSkills();
  const { data: links = [] } = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const toggleSkill = useToggleAgentSkill(agent.id);

  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const linkMap = new Map<string, AgentSkillLink>(links.map((l) => [l.skill_id, l]));

  const linkedInOrder = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => allSkills.find((sk) => sk.id === l.skill_id))
    .filter((sk): sk is Skill => !!sk);

  const q = search.toLowerCase();
  const matches = (sk: Skill) =>
    !q || sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q);

  const linkedVisible = linkedInOrder.filter(matches);
  // Unlinked: only workspace-enabled skills, not already linked
  const unlinkedVisible = allSkills.filter(
    (sk) => sk.enabled && !linkMap.has(sk.id) && matches(sk),
  );

  const enabledCount = links.filter((l) => l.enabled).length;

  function handleToggle(skill: Skill) {
    const link = linkMap.get(skill.id);
    if (link) {
      // Already linked → toggle enabled flag for this agent
      toggleSkill.mutate({ skillId: skill.id, enabled: !link.enabled });
    } else {
      // Not linked → add to agent (enabled by default)
      const newIds = [...links.map((l) => l.skill_id), skill.id];
      setSkills.mutate(newIds);
    }
  }

  function handleDragStart(skillId: string) {
    dragId.current = skillId;
  }

  function handleDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) return;
    const ids = linkedInOrder.map((sk) => sk.id);
    const fromIdx = ids.indexOf(dragId.current);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId.current);
    setSkills.mutate(reordered);
    dragId.current = null;
    setDragOver(null);
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>Skills</span>
        <span style={s.counter}>
          {enabledCount} of {links.length} enabled
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter skills…"
          style={s.search}
        />
      </div>
      <div style={s.hint}>
        Order matters — earlier skills appear earlier in the assembled prompt. Drag to reorder.
      </div>

      {linkedVisible.map((skill) => {
        const link = linkMap.get(skill.id)!;
        return (
          <SkillRow
            key={skill.id}
            skill={skill}
            linked
            enabled={link.enabled}
            dragOver={dragOver === skill.id}
            onToggle={() => handleToggle(skill)}
            onDragStart={() => handleDragStart(skill.id)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(skill.id); }}
            onDrop={() => handleDrop(skill.id)}
            onDragLeave={() => setDragOver(null)}
          />
        );
      })}

      {unlinkedVisible.length > 0 && (
        <>
          {linkedVisible.length > 0 && <div style={s.divider} />}
          {unlinkedVisible.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              linked={false}
              enabled={false}
              dragOver={false}
              onToggle={() => handleToggle(skill)}
            />
          ))}
        </>
      )}
    </div>
  );
}
