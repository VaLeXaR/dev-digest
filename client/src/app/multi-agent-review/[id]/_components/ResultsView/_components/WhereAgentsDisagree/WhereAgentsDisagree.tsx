/* WhereAgentsDisagree — cross-agent grouping block (design/04.png). One row per
   file:line group, one verdict cell per agent that ran: a colored severity dot
   + label when flagged, a muted "did not flag" (bare, no reason — E9) otherwise.
   "Show only conflicts" filters to `group.isConflict` (OFF by default, AC-16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, Toggle, SEV, type Severity } from "@devdigest/ui";
import type { CrossAgentGroup, MultiAgentRunAgent } from "@devdigest/shared";
import { s } from "./styles";

export function WhereAgentsDisagree({
  groups,
  agents,
  onlyConflicts,
  onToggleOnlyConflicts,
}: {
  groups: CrossAgentGroup[];
  agents: MultiAgentRunAgent[];
  onlyConflicts: boolean;
  onToggleOnlyConflicts: (v: boolean) => void;
}) {
  const t = useTranslations("multiAgentResults.disagree");
  const nameOf = React.useMemo(() => {
    const m = new Map(agents.map((a) => [a.agentId, a.name] as const));
    return (agentId: string) => m.get(agentId) ?? agentId;
  }, [agents]);

  return (
    <section style={s.section} data-testid="where-agents-disagree">
      <SectionLabel
        icon="Workflow"
        right={
          /* NOT a <label>: the Toggle renders its own <button>, and a <label>
             wrapping a labelable control re-dispatches the click to it, firing
             onChange twice so the switch flips back to where it started. Plain
             container + the switch as the sole control. */
          <div style={s.toggleRow}>
            <span style={s.toggleLabel}>{t("onlyConflicts")}</span>
            <Toggle on={onlyConflicts} onChange={onToggleOnlyConflicts} size={16} />
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      {groups.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <div style={s.groupList}>
          {groups.map((g, i) => (
            <div key={`${g.file}:${g.lineStart}:${i}`} style={s.group}>
              <div style={s.groupHeader}>
                <Icon.Code size={13} style={{ color: "var(--text-muted)" }} />
                <span className="mono" style={s.groupLoc}>
                  {g.file}:{g.lineStart}
                  {g.lineEnd > g.lineStart ? `–${g.lineEnd}` : ""}
                </span>
                <span style={s.groupTitle}>{g.title}</span>
              </div>
              <div style={s.verdictGrid(g.verdicts.length)}>
                {g.verdicts.map((v) => {
                  const flagged = v.state === "flagged";
                  const sev = v.severity ? SEV[v.severity as Severity] : null;
                  return (
                    <div
                      key={v.agentId}
                      style={s.verdictCell}
                      data-testid={`verdict-${g.file}-${g.lineStart}-${v.agentId}`}
                    >
                      <div style={s.verdictAgent}>{nameOf(v.agentId)}</div>
                      {flagged ? (
                        <div style={{ ...s.verdictState, color: sev?.c ?? "var(--text-primary)" }}>
                          <span style={{ ...s.dot, background: sev?.c ?? "var(--text-primary)" }} />
                          {sev?.label.toUpperCase() ?? "FLAGGED"}
                        </div>
                      ) : (
                        <div style={s.verdictMuted}>
                          <span style={{ ...s.dot, background: "var(--text-muted)" }} />
                          {t("didNotFlag")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
