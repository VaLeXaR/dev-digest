"use client";

import React from "react";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TABS } from "./constants";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={[...TABS]} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Preview tab — coming in Task 11</div>}
        {tab === "versions" && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Versions tab — coming in Task 11</div>}
      </div>
    </div>
  );
}
