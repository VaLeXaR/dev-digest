"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill, useDeleteSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal/ImportSkillModal";
import { s } from "./styles";

export function SkillsListView({ activeId }: { activeId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [filter, setFilter] = useState("");

  const showCreate = search.get("create") === "1";
  const showImport = search.get("import") === "1";

  const filtered = (skills ?? []).filter(
    (sk) =>
      sk.name.toLowerCase().includes(filter.toLowerCase()) ||
      sk.description.toLowerCase().includes(filter.toLowerCase()),
  );

  function closeModal(param: "create" | "import") {
    const sp = new URLSearchParams(search.toString());
    sp.delete(param);
    const qs = sp.toString();
    router.replace(qs ? `/skills?${qs}` : "/skills");
  }

  const isRoot = activeId === undefined;

  if (isRoot) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
        {showCreate && <CreateSkillModal onClose={() => closeModal("create")} />}
        {showImport && <ImportSkillModal onClose={() => closeModal("import")} />}
        <div style={s.page}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <p style={s.subtitle}>{t("page.subtitle")}</p>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            <Dropdown
              width={210}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: "Create blank", icon: "Edit", onClick: () => router.push("/skills?create=1") },
                { label: "Import", icon: "Upload", onClick: () => router.push("/skills?import=1") },
              ]}
            />
          </div>

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={120} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </div>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && filtered.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => router.push("/skills?import=1")}
            />
          )}
          {filtered.length > 0 && (
            <div style={s.grid}>
              {filtered.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  variant="card"
                  onClick={() => router.push(`/skills/${skill.id}`)}
                  onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                  onDelete={() => {
                    if (!confirm(`Delete "${skill.name}"?`)) return;
                    del.mutate(skill.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // Sidebar mode (used inside /skills/[id] layout)
  return (
    <div style={s.sidebar}>
      <div style={s.sidebarTop}>
        <div style={s.sidebarTitleRow}>
          <h2 style={s.sidebarTitle}>{t("page.heading")}</h2>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: "Create blank", icon: "Edit", onClick: () => router.push("/skills?create=1") },
              { label: "Import", icon: "Upload", onClick: () => router.push("/skills?import=1") },
            ]}
          />
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          style={s.sidebarSearch}
        />
      </div>
      <div style={s.sidebarList}>
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
}
