"use client";

import React from "react";
import { Toggle, IconBtn, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { typeColor, sourceInfo } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  variant = "row",
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  variant?: "row" | "card";
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const color = typeColor(skill.type);
  const src = sourceInfo(skill.source);
  const SourceIcon = Icon[src.icon];
  const cardStyle = variant === "card" ? s.card(!!active, skill.enabled) : s.row(!!active, skill.enabled);

  return (
    <div onClick={onClick} style={cardStyle}>
      <div style={s.header}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={13} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <div onClick={(e) => e.stopPropagation()}>
            <IconBtn icon="Trash" label="Delete skill" onClick={onDelete} />
          </div>
        )}
      </div>

      {skill.description && <div style={s.description}>{skill.description}</div>}

      <div style={s.meta}>
        <span style={s.typeBadge(color)}>{skill.type}</span>
        <span style={s.sourceBadge}>
          <SourceIcon size={11} />
          {src.label}
        </span>
      </div>

      {(skill.agent_count != null || skill.pull_pct != null || skill.accept_pct != null) && (
        <div style={s.statsRow}>
          {skill.agent_count != null && (
            <span style={s.statMuted}>
              {skill.agent_count} {skill.agent_count === 1 ? "agent" : "agents"}
            </span>
          )}
          {skill.pull_pct != null && (
            <span style={s.statMuted}>{skill.pull_pct}% pull</span>
          )}
          {skill.accept_pct != null && (
            <span style={s.statAccept}>{skill.accept_pct}% accept</span>
          )}
        </div>
      )}
    </div>
  );
}
