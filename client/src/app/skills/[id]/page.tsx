"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillsListView } from "../_components/SkillsListView/SkillsListView";
import { SkillEditor } from "./_components/SkillEditor/SkillEditor";
import { useSkill, useUpdateSkill } from "../../../lib/hooks/skills";
import { useRunSkillEvalSet } from "../../../lib/hooks/eval";
import { VALID_TABS } from "./_components/SkillEditor/constants";
import { ApiError } from "../../../lib/api";

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  // Same set-run mutation as the Evals tab's own "Run all evals" button (R4/AC-33) —
  // both entry points trigger the identical action.
  const runEvalSet = useRunSkillEvalSet(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Skills", href: "/skills" },
    { label: skill?.name ?? "Skill" },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this skill"
          body={error instanceof ApiError ? error.message : "Skill not found"}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* left: skill list */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <SkillsListView activeId={id} />
        </div>

        {/* editor */}
        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 28px 0",
                flexShrink: 0,
              }}
            >
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--text-secondary)">{skill.type}</Badge>
              <Badge color="var(--text-muted)" mono>
                v{skill.version}
              </Badge>
              <div style={{ marginLeft: "auto" }}>
                {tab === "evals" ? (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Play"
                    loading={runEvalSet.isPending}
                    onClick={() => runEvalSet.mutate()}
                  >
                    Run on evals
                  </Button>
                ) : (
                  <Badge color={skill.enabled ? "var(--accent)" : "var(--text-muted)"}>
                    {skill.enabled ? "enabled" : "disabled"}
                  </Badge>
                )}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
