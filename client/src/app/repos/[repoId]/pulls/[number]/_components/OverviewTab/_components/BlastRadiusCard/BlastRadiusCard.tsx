"use client";

import React, { useMemo, useState } from "react";
import { SectionLabel, Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { PrBlastRecord } from "@devdigest/shared";
import { BlastGraph } from "./_components/BlastGraph";
import { s } from "./styles";

interface BlastRadiusCardProps {
  blastData: PrBlastRecord | undefined;
  blastLoading: boolean;
  onGoToDiff: (file: string, line: number) => void;
  /** Built by OverviewTab (owns the useGenerateBlastSummary mutation) — mirrors IntentCard's recalcButton. */
  explainButton: React.ReactNode;
}

type ViewMode = "tree" | "graph";

const ChevronRightIcon = Icon.ChevronRight;
const ChevronDownIcon = Icon.ChevronDown;
const RouteIcon = Icon.Globe;
const CronIcon = Icon.Clock;
const WarnIcon = Icon.AlertTriangle;
const SymbolStatIcon = Icon.Code;
const CallerStatIcon = Icon.CornerDownRight;

export function BlastRadiusCard({
  blastData,
  blastLoading,
  onGoToDiff,
  explainButton,
}: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const [view, setView] = useState<ViewMode>("tree");
  // Rows the user has explicitly toggled away from their default state
  // (index 0 defaults open, all others default closed). Keyed by array
  // position, not symbol name — two downstream entries can share a symbol
  // name (same function name declared in different files), and a name-keyed
  // Set would collide, applying one row's toggle to both.
  const [toggled, setToggled] = useState<Set<number>>(new Set());

  const callerCount = useMemo(
    () => (blastData?.downstream ?? []).reduce((sum, d) => sum + d.callers.length, 0),
    [blastData],
  );
  const endpointCount = useMemo(() => {
    const set = new Set<string>();
    for (const d of blastData?.downstream ?? []) {
      for (const e of d.endpoints_affected) set.add(e);
    }
    return set.size;
  }, [blastData]);
  const cronCount = useMemo(() => {
    const set = new Set<string>();
    for (const d of blastData?.downstream ?? []) {
      for (const c of d.crons_affected) set.add(c);
    }
    return set.size;
  }, [blastData]);

  const isExpanded = (index: number) => {
    const defaultOpen = index === 0;
    return toggled.has(index) ? !defaultOpen : defaultOpen;
  };

  const toggleRow = (index: number) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggle = (
    <div style={s.headerActions}>
      {explainButton}
      <div style={s.toggleGroup}>
        <button
          type="button"
          style={{ ...s.toggleBtn, ...(view === "tree" ? s.toggleBtnActive : {}) }}
          onClick={() => setView("tree")}
        >
          {t("view.tree")}
        </button>
        <button
          type="button"
          style={{ ...s.toggleBtn, ...(view === "graph" ? s.toggleBtnActive : {}) }}
          onClick={() => setView("graph")}
        >
          {t("view.graph")}
        </button>
      </div>
    </div>
  );

  const renderBody = () => {
    if (blastLoading) return null;

    if (!blastData) {
      return <p style={s.emptyText}>{t("empty")}</p>;
    }

    if (blastData.degraded) {
      return (
        <div style={s.degradedBadge}>
          <span style={s.degradedBadgeLabel}>
            <WarnIcon size={13} />
            {t("degraded.badge")}
          </span>
          <span style={s.degradedBadgeText}>{t("degraded.explain")}</span>
        </div>
      );
    }

    if (blastData.changed_symbols.length === 0) {
      return <p style={s.emptyText}>{t("empty")}</p>;
    }

    if (blastData.downstream.length === 0) {
      return (
        <p style={s.emptyText}>
          {t("noDownstream", { count: blastData.changed_symbols.length })}
        </p>
      );
    }

    if (view === "graph") {
      return <BlastGraph />;
    }

    return (
      <div style={s.symbolGroup}>
        {blastData.downstream.map((d, index) => {
          const open = isExpanded(index);
          const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
          return (
            <React.Fragment key={index}>
              <button
                type="button"
                style={s.symbolRow}
                onClick={() => toggleRow(index)}
                aria-expanded={open}
              >
                <Chevron size={14} style={s.callerGlyph} />
                <span style={s.symbolName}>{d.symbol}()</span>
                <span style={s.symbolCallerCount}>
                  {t("callerCount", { count: d.callers.length })}
                </span>
              </button>
              {open && (
                <>
                  <div style={s.callerList}>
                    {d.callers.map((c) => (
                      <button
                        key={`${c.file}:${c.line}`}
                        type="button"
                        style={s.callerRow}
                        onClick={() => onGoToDiff(c.file, c.line)}
                        aria-label={t("gotoCaller", { file: c.file, line: c.line })}
                        className="mono"
                      >
                        <span style={s.callerGlyph}>{"└→"}</span>
                        <span style={s.callerPath} title={`${c.file}:${c.line}`}>
                          {c.file}:{c.line}
                        </span>
                      </button>
                    ))}
                  </div>
                  {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                    <div style={s.pillRow}>
                      {d.endpoints_affected.map((e) => (
                        <span key={e} style={s.pillEndpoint}>
                          <RouteIcon size={11} />
                          {e}
                        </span>
                      ))}
                      {d.crons_affected.map((c) => (
                        <span key={c} style={s.pillCron}>
                          <CronIcon size={11} />
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div style={s.card}>
      <div style={s.headerRow}>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        {toggle}
      </div>

      {blastData && !blastData.degraded && blastData.downstream.length > 0 && (
        <div style={s.statsRow}>
          <span style={s.statItem}>
            <SymbolStatIcon size={13} />
            <span style={s.statNumber}>{blastData.downstream.length}</span> {t("stat.symbols")}
          </span>
          <span style={s.statItem}>
            <CallerStatIcon size={13} />
            <span style={s.statNumber}>{callerCount}</span> {t("stat.callers")}
          </span>
          <span style={s.statItem}>
            <RouteIcon size={13} />
            <span style={s.statNumber}>{endpointCount}</span> {t("stat.endpoints")}
          </span>
          <span style={s.statItem}>
            <CronIcon size={13} />
            <span style={s.statNumber}>{cronCount}</span> {t("stat.crons")}
          </span>
        </div>
      )}

      {blastData?.summary && <p style={s.summary}>{blastData.summary}</p>}

      {renderBody()}
    </div>
  );
}
