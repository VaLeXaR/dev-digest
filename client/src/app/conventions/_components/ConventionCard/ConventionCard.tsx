"use client";

import React, { useState } from "react";
import { Button, ProgressBar, Icon } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";

interface ConventionCardProps {
  convention: ConventionCandidate;
  onPatch: (id: string, patch: { rule?: string; accepted?: boolean }) => void;
  onRemove: (id: string) => void;
}

function confidenceColor(confidence: number): string {
  const pct = confidence * 100;
  if (pct >= 80) return "#22c55e";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

export function ConventionCard({ convention, onPatch, onRemove }: ConventionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(convention.rule);
  const [copied, setCopied] = useState(false);

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
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  function copySnippet() {
    void navigator.clipboard.writeText(convention.evidence_snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={s.card}>
      {/* Left: content */}
      <div style={s.body}>
        {/* Rule title */}
        <div style={s.ruleRow}>
          {editing ? (
            <input
              autoFocus
              aria-label="Edit convention rule"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              style={s.ruleInput}
            />
          ) : (
            <span style={s.ruleText} onClick={startEdit} title="Click to edit rule">
              {convention.rule}
            </span>
          )}
        </div>
        {editing && <div style={s.editHint}>Enter to save · Esc to cancel</div>}

        {/* Evidence path badge */}
        <div>
          <span style={s.pathBadge} title={convention.evidence_path}>
            <Icon.File size={11} />
            {convention.evidence_path}
          </span>
        </div>

        {/* Code snippet with copy button */}
        <div style={s.snippetWrap}>
          <pre style={s.snippet}>{convention.evidence_snippet}</pre>
          <button type="button" style={s.copyBtn} onClick={copySnippet} title="Copy snippet">
            {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
          </button>
        </div>

        {/* Confidence bar */}
        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>Confidence</span>
          <ProgressBar value={pct} color={barColor} height={6} />
          <span style={s.confidencePct}>{pct}%</span>
        </div>
      </div>

      {/* Right: Accept / Reject */}
      <div style={s.actions}>
        <Button
          kind={convention.accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          onClick={() => onPatch(convention.id, { accepted: true })}
        >
          {convention.accepted ? "Accepted" : "Accept"}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="X"
          onClick={() => onPatch(convention.id, { accepted: false })}
          style={convention.accepted === false ? { color: "var(--crit)" } : undefined}
        >
          Reject
        </Button>
        <button
          type="button"
          style={s.removeBtn}
          title="Remove from list"
          onClick={() => onRemove(convention.id)}
        >
          <Icon.Trash size={13} />
        </button>
      </div>
    </div>
  );
}
