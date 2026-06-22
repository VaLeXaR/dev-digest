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

  const unlinkedSkills = search
    ? allSkills.filter(
        (sk) =>
          !linkMap.has(sk.id) &&
          (sk.name.toLowerCase().includes(search.toLowerCase()) ||
            sk.description.toLowerCase().includes(search.toLowerCase())),
      )
    : [];

  const enabledCount = links.filter((l) => l.enabled).length;

  function handleToggle(skillId: string) {
    const link = linkMap.get(skillId);
    if (link) {
      toggleSkill.mutate({ skillId, enabled: !link.enabled });
    } else {
      const newIds = [...links.map((l) => l.skill_id), skillId];
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

      {linkedInOrder.map((skill) => {
        const link = linkMap.get(skill.id)!;
        return (
          <div
            key={skill.id}
            draggable
            onDragStart={() => handleDragStart(skill.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(skill.id);
            }}
            onDrop={() => handleDrop(skill.id)}
            onDragLeave={() => setDragOver(null)}
            style={{
              ...s.row(link.enabled),
              outline: dragOver === skill.id ? "2px solid var(--accent)" : undefined,
            }}
          >
            <span style={s.drag}>≡</span>
            <input
              type="checkbox"
              aria-label={`Enable ${skill.name}`}
              checked={link.enabled}
              onChange={() => handleToggle(skill.id)}
              style={s.checkbox}
            />
            <span style={s.skillName}>{skill.name}</span>
            <span style={s.typeBadge(typeColor(skill.type))}>{skill.type}</span>
          </div>
        );
      })}

      {unlinkedSkills.map((skill) => (
        <div key={skill.id} style={s.unlinkedRow(false)}>
          <span style={{ ...s.drag, opacity: 0 }}>≡</span>
          <input
            type="checkbox"
            aria-label={`Add ${skill.name}`}
            checked={false}
            onChange={() => handleToggle(skill.id)}
            style={s.checkbox}
          />
          <span style={s.skillName}>{skill.name}</span>
          <span style={s.typeBadge(typeColor(skill.type))}>{skill.type}</span>
        </div>
      ))}
    </div>
  );
}
