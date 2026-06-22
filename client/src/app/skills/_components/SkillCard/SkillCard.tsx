"use client";

import React from "react";
import { Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { typeColor, sourceLabel } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.header}>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      {skill.description && <div style={s.description}>{skill.description}</div>}
      <div style={s.meta}>
        <span style={s.typeBadge(typeColor(skill.type))}>{skill.type}</span>
        <span style={s.sourceBadge}>{sourceLabel(skill.source)}</span>
      </div>
    </div>
  );
}
