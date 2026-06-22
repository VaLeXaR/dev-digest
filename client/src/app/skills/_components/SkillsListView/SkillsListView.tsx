"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill, useDeleteSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal/ImportSkillModal";

export function SkillsListView({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills = [] } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [filter, setFilter] = useState("");

  const showCreate = search.get("create") === "1";
  const showImport = search.get("import") === "1";

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase()),
  );

  function closeModal(param: "create" | "import") {
    const sp = new URLSearchParams(search.toString());
    sp.delete(param);
    const qs = sp.toString();
    router.replace(qs ? `/skills?${qs}` : "/skills");
  }

  const isRoot = activeId === undefined;

  const list = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1, margin: 0 }}>Skills</h2>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                Add Skill
              </Button>
            }
            items={[
              {
                label: "Create blank",
                icon: "Edit",
                onClick: () => router.push("/skills?create=1"),
              },
              {
                label: "Import",
                icon: "Upload",
                onClick: () => router.push("/skills?import=1"),
              },
            ]}
          />
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search skills..."
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            fontSize: 13,
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 12px" }}>
        {filtered.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            active={skill.id === activeId}
            onClick={() => router.push(`/skills/${skill.id}`)}
            onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            onDelete={() => {
              if (!confirm(`Delete "${skill.name}"?`)) return;
              del.mutate(skill.id);
              if (activeId === skill.id) router.push("/skills");
            }}
          />
        ))}
      </div>
    </div>
  );

  if (isRoot) {
    return (
      <AppShell crumb={[{ label: "Skills Lab" }, { label: "Skills" }]}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>{list}</div>
        {showCreate && <CreateSkillModal onClose={() => closeModal("create")} />}
        {showImport && <ImportSkillModal onClose={() => closeModal("import")} />}
      </AppShell>
    );
  }

  return list;
}
