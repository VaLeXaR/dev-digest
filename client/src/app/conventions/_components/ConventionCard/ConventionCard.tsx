"use client";

import React, { useState } from "react";
import { Button, ProgressBar, Icon } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";

interface ConventionCardProps {
  convention: ConventionCandidate;
  onPatch: (id: string, patch: { rule?: string; accepted?: boolean }) => void;
}

function confidenceColor(confidence: number): string {
  const pct = confidence * 100;
  if (pct >= 80) return "#22c55e"; // green
  if (pct >= 60) return "#f59e0b"; // yellow
  return "#ef4444"; // red
}

export function ConventionCard({ convention, onPatch }: ConventionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(convention.rule);

  const pct = Math.round(convention.confidence * 100);
  const barColor = confidenceColor(convention.confidence);

  function startEdit() {
    setDraft(convention.rule);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== convention.rule) {
      onPatch(convention.id, { rule: trimmed });
    }
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(convention.rule);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div style={s.card}>
      {/* Rule title — click to edit inline */}
      <div>
        <div style={s.ruleRow}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              style={s.ruleInput}
            />
          ) : (
            <span
              style={s.ruleText}
              onClick={startEdit}
              title="Click to edit rule"
            >
              {convention.rule}
            </span>
          )}
        </div>
        {editing && (
          <div style={s.editHint}>Enter to save · Esc to cancel</div>
        )}
      </div>

      {/* Evidence path badge */}
      <div>
        <span style={s.pathBadge} title={convention.evidence_path}>
          <Icon.File size={11} />
          {convention.evidence_path}
        </span>
      </div>

      {/* Code snippet */}
      <pre style={s.snippet}>{convention.evidence_snippet}</pre>

      {/* Confidence bar */}
      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>Confidence</span>
        <ProgressBar value={pct} color={barColor} height={6} />
        <span style={s.confidencePct}>{pct}%</span>
      </div>

      {/* Accept / Reject buttons */}
      <div style={s.actions}>
        <Button
          kind={convention.accepted === false ? "danger" : "ghost"}
          size="sm"
          icon="X"
          onClick={() => onPatch(convention.id, { accepted: false })}
          style={
            convention.accepted === false
              ? { borderColor: "var(--crit)", color: "var(--crit)" }
              : undefined
          }
        >
          Reject
        </Button>
        <Button
          kind={convention.accepted === true ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          onClick={() => onPatch(convention.id, { accepted: true })}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
