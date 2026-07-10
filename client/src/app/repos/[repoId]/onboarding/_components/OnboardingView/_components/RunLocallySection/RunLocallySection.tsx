/* RunLocallySection — server-ordered, numbered commands, each with a
   copy-to-clipboard control and an inline comment (R15/AC-18/AC-20). A small
   muted caption under the card title shows the AI-generated disclaimer,
   driven by runLocally.aiGenerated (R19/AC-24). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { OnboardingRunLocally } from "@devdigest/shared";
import { SectionCard } from "../SectionCard/SectionCard";
import { s } from "../../styles";

function CommandRow({ index, command, comment }: { index: number; command: string; comment?: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    void navigator.clipboard?.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div style={s.numberedRow}>
      <span style={s.numberBadge}>{index + 1}</span>
      <div style={s.commandRow}>
        <span className="mono" style={s.commandText}>
          {command}
          {comment && <span style={s.commandComment}> # {comment}</span>}
        </span>
        <button type="button" title="Copy" aria-label="Copy" onClick={copy} style={s.copyBtn}>
          {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export function RunLocallySection({
  id,
  title,
  aiGeneratedCaption,
  emptyText,
  runLocally,
}: {
  id: string;
  title: string;
  aiGeneratedCaption: string;
  emptyText: string;
  runLocally: OnboardingRunLocally;
}) {
  return (
    <SectionCard
      id={id}
      icon="Command"
      title={title}
      caption={runLocally.aiGenerated ? aiGeneratedCaption : undefined}
    >
      {runLocally.commands.length === 0 && <p style={s.emptyText}>{emptyText}</p>}
      {runLocally.commands.map((c, i) => (
        <CommandRow key={i} index={i} command={c.command} comment={c.comment} />
      ))}
    </SectionCard>
  );
}

export default RunLocallySection;
