/* CriticalPathsSection — server-ranked file rows: path + why + Open action
   (R14/AC-17/AC-27). Never re-sorted client-side. */
"use client";

import { Button, Icon } from "@devdigest/ui";
import type { OnboardingCriticalPath } from "@devdigest/shared";
import { SectionCard } from "../SectionCard/SectionCard";
import { openGithubBlob } from "../../helpers";
import { s } from "../../styles";

export function CriticalPathsSection({
  id,
  title,
  openLabel,
  emptyText,
  paths,
  repoFullName,
  defaultBranch,
}: {
  id: string;
  title: string;
  openLabel: string;
  emptyText: string;
  paths: OnboardingCriticalPath[];
  repoFullName: string | null | undefined;
  defaultBranch: string | null | undefined;
}) {
  return (
    <SectionCard id={id} icon="Activity" title={title}>
      {paths.length === 0 && <p style={s.emptyText}>{emptyText}</p>}
      {paths.map((p) => (
        <div key={p.path} style={s.fileRow}>
          <Icon.File size={14} style={s.fileRowIcon} />
          <div style={s.fileRowText}>
            <span className="mono" style={s.fileRowPath}>
              {p.path}
            </span>{" "}
            <span style={s.fileRowAnnotation}>— {p.why}</span>
          </div>
          <Button
            kind="ghost"
            size="sm"
            onClick={() => openGithubBlob(repoFullName, defaultBranch, p.path)}
          >
            {openLabel}
          </Button>
        </div>
      ))}
    </SectionCard>
  );
}

export default CriticalPathsSection;
