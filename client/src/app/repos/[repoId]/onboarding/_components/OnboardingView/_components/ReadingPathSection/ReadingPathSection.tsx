/* ReadingPathSection — server-ordered, numbered file list with a one-line
   reason each; never re-sorted (R16/AC-19). */
"use client";

import type { OnboardingReadingPathEntry } from "@devdigest/shared";
import { SectionCard } from "../SectionCard/SectionCard";
import { s } from "../../styles";

export function ReadingPathSection({
  id,
  title,
  emptyText,
  entries,
}: {
  id: string;
  title: string;
  emptyText: string;
  entries: OnboardingReadingPathEntry[];
}) {
  return (
    <SectionCard id={id} icon="ListChecks" title={title}>
      {entries.length === 0 && <p style={s.emptyText}>{emptyText}</p>}
      {entries.map((entry, i) => (
        <div key={entry.path} style={s.numberedRow}>
          <span style={s.numberBadge}>{i + 1}</span>
          <div style={s.readingPathBody}>
            <span className="mono" style={s.readingPathPath}>
              {entry.path}
            </span>
            <span style={s.readingPathReason}>{entry.reason}</span>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

export default ReadingPathSection;
