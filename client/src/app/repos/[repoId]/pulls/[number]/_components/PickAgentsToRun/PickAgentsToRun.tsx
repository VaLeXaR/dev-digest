/* PickAgentsToRun — replaces RunReviewDropdown (R1/AC-1, AC-2). Multi-select
   "Pick agents to run" panel: checkbox per agent + per-agent time-estimate
   hint (useMultiRunEstimate), primary "Run multi-agent review (N)" button
   (useCreateMultiRun), muted "Configure agents…" row. On confirm, navigates
   to the new run's results page — never stays on the PR page. */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateMultiRun, useMultiRunEstimate } from "@/lib/hooks/multi-agent";
import { s } from "./styles";

/** "~6s" for a duration hint, "—" when the estimate is null (absolute cold
   start — never a fabricated number, per R5/AC-11). */
function formatDurationHint(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `~${Math.round(ms / 1000)}s`;
}

export function PickAgentsToRun({
  prId,
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  /** Fired once the run is created (before navigating away). */
  onRunsStarted?: () => void;
  /** Fired when the create request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("multiAgentPicker");
  const router = useRouter();
  const { data: agents } = useAgents();
  const all = agents ?? [];

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const estimate = useMultiRunEstimate();
  const create = useCreateMultiRun();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch a time/cost hint for EVERY listed agent (not just the checked ones)
  // whenever the panel opens, so hints are visible before the user picks.
  useEffect(() => {
    if (!open || all.length === 0) return;
    estimate.mutate({ prId, agentIds: all.map((a) => a.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prId]);

  const toggle = (agentId: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, agentId] : prev.filter((id) => id !== agentId)));
  };

  const hintFor = (agentId: string): string => {
    const perAgent = estimate.data?.perAgent.find((p) => p.agentId === agentId);
    return formatDurationHint(perAgent?.estDurationMs);
  };

  const handleConfirm = async () => {
    if (selected.length === 0) return;
    onRunStart?.();
    try {
      const res = await create.mutateAsync({ prId, agentIds: selected });
      onRunsStarted?.();
      setOpen(false);
      router.push(`/multi-agent-review/${res.multiRunId}`);
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={wrapRef} style={s.wrap}>
      <span
        title={warnMerged ? t("mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind="primary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          loading={create.isPending}
          onClick={() => setOpen((o) => !o)}
        >
          {create.isPending ? t("running") : t("trigger")}
        </Button>
      </span>
      {open && (
        <div style={s.panel}>
          <div style={s.headerRow}>
            <span style={s.headerLabel}>{t("panelTitle")}</span>
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              style={{ ...s.clearLink, ...(selected.length === 0 ? { opacity: 0.5, cursor: "default" } : {}) }}
            >
              {t("clear")}
            </button>
          </div>
          <div style={s.list}>
            {all.length === 0 ? (
              <div style={s.emptyRow}>{t("noAgents")}</div>
            ) : (
              all.map((a) => (
                <div key={a.id} style={s.agentRow}>
                  <Checkbox
                    checked={selected.includes(a.id)}
                    onChange={(checked) => toggle(a.id, checked)}
                    label={
                      <span style={s.agentLabel}>
                        <Icon.Cpu size={13} style={{ color: "var(--text-muted)" }} />
                        {a.name}
                      </span>
                    }
                  />
                  <span style={s.hint}>{hintFor(a.id)}</span>
                </div>
              ))
            )}
          </div>
          <Button
            kind="primary"
            size="sm"
            full
            icon="Users"
            disabled={selected.length === 0 || create.isPending}
            loading={create.isPending}
            onClick={handleConfirm}
          >
            {t("runButton", { count: selected.length })}
          </Button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/agents");
            }}
            style={s.configureRow}
          >
            <Icon.Settings size={13} />
            {t("configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
