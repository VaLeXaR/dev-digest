/* AgentColumn — one agent's card in Columns mode (design/04.png): category icon
   + name + live status/cost/duration + score ring header, finding rows body,
   "View trace" + count footer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, CircularScore, SEV, type IconName } from "@devdigest/ui";
import type { MultiAgentRunAgent } from "@devdigest/shared";
import { columnStyleFor } from "../../constants";
import { mapAgentStatus, formatDuration, formatCost, type AgentFinding } from "../../helpers";
import { s } from "./styles";

const STATUS_META: Record<ReturnType<typeof mapAgentStatus>, { color: string; icon: IconName }> = {
  running: { color: "var(--accent)", icon: "RefreshCw" },
  finished: { color: "var(--ok)", icon: "CheckCircle" },
  failed: { color: "var(--crit)", icon: "XCircle" },
  cancelled: { color: "var(--text-muted)", icon: "X" },
};

export function AgentColumn({
  agent,
  index,
  findings,
  onViewTrace,
}: {
  agent: MultiAgentRunAgent;
  index: number;
  findings: AgentFinding[];
  onViewTrace: () => void;
}) {
  const t = useTranslations("multiAgentResults");
  const palette = columnStyleFor(index);
  const ColIcon = Icon[palette.icon];
  const status = mapAgentStatus(agent.status);
  const statusMeta = STATUS_META[status];
  const StatusIcon = Icon[statusMeta.icon];

  return (
    <div style={s.column(palette.color)} data-testid={`agent-column-${agent.agentId}`}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.iconBox(palette.color, palette.bg)}>
            <ColIcon size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={s.name}>{agent.name}</div>
            <div style={s.metaLine}>
              <StatusIcon
                size={11}
                style={{
                  color: statusMeta.color,
                  animation: status === "running" ? "ddspin 1s linear infinite" : undefined,
                }}
              />
              <span style={{ color: statusMeta.color, fontWeight: 600 }}>{t(`status.${status}`)}</span>
              <span>
                {" "}
                · {formatDuration(agent.durationMs)} · {formatCost(agent.costUsd)}
              </span>
            </div>
          </div>
        </div>
        {agent.score != null ? (
          <CircularScore score={agent.score} size={36} stroke={3} />
        ) : (
          <div style={s.scorePlaceholder}>—</div>
        )}
      </div>

      <div style={s.body}>
        {findings.length === 0 ? (
          <div style={s.noFindings}>{t("column.noFindings")}</div>
        ) : (
          findings.map((f) => {
            const sev = f.severity ? SEV[f.severity] : null;
            const SevIcon = sev ? Icon[sev.icon] : null;
            return (
              <div key={f.groupKey} style={s.findingCard(sev?.c ?? "var(--border-strong)")}>
                {SevIcon && (
                  <SevIcon size={13} style={{ color: sev!.c, marginTop: 2, flexShrink: 0 }} />
                )}
                <div style={s.findingText}>
                  <div style={s.findingTitle}>{f.title}</div>
                  <div className="mono" style={s.findingLoc}>
                    {f.file}:{f.line}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={s.footer}>
        <button style={s.viewTrace} onClick={onViewTrace}>
          {t("column.viewTrace")}
        </button>
        <span style={s.findingsCount}>
          {t("column.findingsCount", { count: agent.findingsCount ?? 0 })}
        </span>
      </div>
    </div>
  );
}
