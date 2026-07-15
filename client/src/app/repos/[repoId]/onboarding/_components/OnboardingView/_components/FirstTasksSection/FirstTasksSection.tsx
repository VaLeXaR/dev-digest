/* FirstTasksSection — 3-column card grid (per design/onboarding-tour-*.png):
   title, first related file as a plain clickable path, and a complexity
   pill. Rationale is not shown — the design omits it. */
"use client";

import type { OnboardingFirstTask, OnboardingTaskComplexity } from "@devdigest/shared";
import { Badge } from "@devdigest/ui";
import { SectionCard } from "../SectionCard/SectionCard";
import { openGithubBlob } from "../../helpers";
import { s } from "../../styles";

const COMPLEXITY_TOKEN: Record<OnboardingTaskComplexity, { color: string; bg: string }> = {
  low: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

export function FirstTasksSection({
  id,
  title,
  emptyText,
  complexityLabels,
  tasks,
  repoFullName,
  defaultBranch,
}: {
  id: string;
  title: string;
  emptyText: string;
  complexityLabels: Record<OnboardingTaskComplexity, string>;
  tasks: OnboardingFirstTask[];
  repoFullName: string | null | undefined;
  defaultBranch: string | null | undefined;
}) {
  return (
    <SectionCard id={id} icon="CheckCircle" title={title}>
      {tasks.length === 0 && <p style={s.emptyText}>{emptyText}</p>}
      {tasks.length > 0 && (
        <div style={s.taskGrid}>
          {tasks.map((task) => {
            const primaryFile = task.relatedFiles?.[0];
            const token = task.complexity ? COMPLEXITY_TOKEN[task.complexity] : null;
            return (
              <div key={task.title} style={s.taskCard}>
                <span style={s.taskTitle}>{task.title}</span>
                {primaryFile && (
                  <button
                    type="button"
                    className="mono"
                    style={s.taskPath}
                    title={primaryFile}
                    onClick={() => openGithubBlob(repoFullName, defaultBranch, primaryFile)}
                  >
                    {primaryFile}
                  </button>
                )}
                {token && (
                  <Badge color={token.color} bg={token.bg} style={{ border: `1px solid ${token.color}`, alignSelf: "flex-start" }}>
                    {complexityLabels[task.complexity!]}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export default FirstTasksSection;
