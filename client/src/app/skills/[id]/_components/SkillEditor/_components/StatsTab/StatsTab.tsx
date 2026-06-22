"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

const RING_R = 20;
const RING_CIRC = 2 * Math.PI * RING_R;

function RingChart({ pct }: { pct: number }) {
  const filled = (pct / 100) * RING_CIRC;
  return (
    <svg width={56} height={56} style={{ flexShrink: 0 }}>
      <circle cx={28} cy={28} r={RING_R} fill="none" stroke="var(--border)" strokeWidth={5} />
      <circle
        cx={28}
        cy={28}
        r={RING_R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={5}
        strokeDasharray={`${filled} ${RING_CIRC - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text
        x={28}
        y={28}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill="var(--text-primary)"
      >
        {pct}
      </text>
    </svg>
  );
}

export function StatsTab({ skill }: { skill: Skill }) {
  const router = useRouter();
  const { data: agents = [], isLoading: agentsLoading } = useSkillAgents(skill.id);

  return (
    <div>
      <div style={s.statsRow}>
        <div style={s.card}>
          <span style={s.cardLabel}>Used By</span>
          <span style={s.cardValue}>
            {skill.agent_count ?? 0}
          </span>
          <span style={s.cardSub}>
            {(skill.agent_count ?? 0) === 1 ? "agent" : "agents"}
          </span>
        </div>

        <div style={s.card}>
          <span style={s.cardLabel}>Pull Frequency</span>
          <span style={s.cardValue}>
            {skill.pull_pct != null ? `${skill.pull_pct}%` : "—"}
          </span>
          <span style={s.cardSub}>of PRs reviewed</span>
        </div>

        <div style={s.rateCard}>
          <div style={s.rateInfo}>
            <span style={s.cardLabel}>Accept Rate</span>
            <span style={s.cardValue}>
              {skill.accept_pct != null ? `${skill.accept_pct}%` : "—"}
            </span>
            <span style={s.cardSub}>findings accepted</span>
          </div>
          {skill.accept_pct != null && <RingChart pct={skill.accept_pct} />}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Agents Using This Skill</span>
        </div>

        {agentsLoading ? (
          <div style={s.noAgents}>Loading…</div>
        ) : agents.length === 0 ? (
          <div style={s.noAgents}>No agents are using this skill yet.</div>
        ) : (
          <div style={s.agentList}>
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                style={i === agents.length - 1 ? s.agentRowLast : s.agentRow}
              >
                <span style={s.agentName}>{agent.name}</span>
                <button
                  style={s.openBtn}
                  onClick={() => router.push(`/agents/${agent.id}`)}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
