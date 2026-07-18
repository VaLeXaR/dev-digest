/* TrendTooltip — METRIC TREND chart hover content (T-03, R1/R9).
   Extracted as a small pure component so it's unit-testable directly with
   props, without rendering recharts: `ResponsiveContainer` measures
   offsetWidth=0 under jsdom, so no chart (and no tooltip) ever mounts there. */
import type { EvalTrendPoint } from "@devdigest/shared";
import { METRIC_COLORS, formatMetricPct, formatRunTimestamp } from "../../../_components/EvalDashboardView/constants";
import { formatCost } from "./constants";
import { s } from "./styles";

export function TrendTooltip({ point }: { point: EvalTrendPoint }) {
  return (
    <div style={s.tooltipCard}>
      <div style={s.tooltipTimestamp}>{formatRunTimestamp(point.ran_at)}</div>
      <div style={s.tooltipVersionRow}>
        <span className="mono" style={s.tooltipVersion}>{`v${point.owner_version}`}</span>
        <span className="tnum" style={s.tooltipCost}>
          {formatCost(point.cost_usd)}
        </span>
      </div>
      <div style={s.tooltipDivider} />
      <TooltipMetricRow label="Recall" color={METRIC_COLORS.recall} value={point.recall} />
      <TooltipMetricRow label="Precision" color={METRIC_COLORS.precision} value={point.precision} />
      <TooltipMetricRow label="Citation" color={METRIC_COLORS.citation} value={point.citation_accuracy} />
    </div>
  );
}

function TooltipMetricRow({ label, color, value }: { label: string; color: string; value: number | null }) {
  return (
    <div style={s.tooltipMetricRow}>
      <span style={{ ...s.tooltipDot, background: color }} />
      <span style={s.tooltipMetricLabel}>{label}</span>
      <span className="tnum" style={s.tooltipMetricValue}>
        {formatMetricPct(value)}
      </span>
    </div>
  );
}
