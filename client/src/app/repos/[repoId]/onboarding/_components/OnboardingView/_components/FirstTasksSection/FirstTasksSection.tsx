/* FirstTasksSection — mirrors the sibling cards' styling exactly: bold title
   + muted rationale + optional relatedFiles rendered as file chips reusing
   the Critical-paths row's Open-action pattern (R20/AC-25). */
"use client";

import { Chip } from "@devdigest/ui";
import type { OnboardingFirstTask } from "@devdigest/shared";
import { SectionCard } from "../SectionCard/SectionCard";
import { openGithubBlob } from "../../helpers";
import { s } from "../../styles";

export function FirstTasksSection({
  id,
  title,
  emptyText,
  tasks,
  repoFullName,
  defaultBranch,
}: {
  id: string;
  title: string;
  emptyText: string;
  tasks: OnboardingFirstTask[];
  repoFullName: string | null | undefined;
  defaultBranch: string | null | undefined;
}) {
  return (
    <SectionCard id={id} icon="CheckCircle" title={title}>
      {tasks.length === 0 && <p style={s.emptyText}>{emptyText}</p>}
      {tasks.map((task) => (
        <div key={task.title} style={s.numberedRow}>
          <div style={s.taskBody}>
            <span style={s.taskTitle}>{task.title}</span>
            <span style={s.taskRationale}>{task.rationale}</span>
            {task.relatedFiles && task.relatedFiles.length > 0 && (
              <div style={s.taskFiles}>
                {task.relatedFiles.map((path) => (
                  <Chip
                    key={path}
                    icon="File"
                    onClick={() => openGithubBlob(repoFullName, defaultBranch, path)}
                  >
                    <span className="mono">{path}</span>
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

export default FirstTasksSection;
