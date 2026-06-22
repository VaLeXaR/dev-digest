"use client";

import React from "react";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TABS } from "./constants";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab/PreviewTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { VersionsTab } from "./_components/VersionsTab/VersionsTab";
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
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
