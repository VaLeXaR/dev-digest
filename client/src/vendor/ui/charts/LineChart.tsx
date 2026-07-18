/* LineChart — multi-series line chart on Recharts. */
import React from "react";
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface ChartSeries {
  name: string;
  color: string;
  data: (number | null)[];
}

/** Index of the last non-null value in `data`, or -1 if every value is null. */
function lastNonNullIndex(data: (number | null)[]): number {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] != null) return i;
  }
  return -1;
}

/** A non-null point is isolated when both neighbours are null or absent. */
function isIsolated(data: (number | null)[], i: number): boolean {
  const prev = i > 0 ? data[i - 1] : null;
  const next = i < data.length - 1 ? data[i + 1] : null;
  return prev == null && next == null;
}

/**
 * Builds a per-series dot renderer: draws a filled circle only on a point that is
 * non-null AND (the series' last non-null point OR isolated — R4 + R11.1). Every other
 * point renders an empty fragment (recharts calls this per point and expects an
 * element back, so `null` triggers a render warning).
 */
function makeDotRenderer(s: ChartSeries) {
  const lastIdx = lastNonNullIndex(s.data);
  return (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index } = props;
    const key = `dot-${s.name}-${index}`;
    if (index == null || cx == null || cy == null) return <React.Fragment key={key} />;
    const value = s.data[index];
    if (value == null) return <React.Fragment key={key} />;
    const shouldDraw = index === lastIdx || isIsolated(s.data, index);
    if (!shouldDraw) return <React.Fragment key={key} />;
    return <circle key={key} cx={cx} cy={cy} r={3} fill={s.color} stroke="none" />;
  };
}

export function LineChart({
  series,
  w = 620,
  h = 200,
  yMin = 0.6,
  yMax = 1.0,
  tooltip,
}: {
  series: ChartSeries[];
  w?: number;
  h?: number;
  yMin?: number;
  yMax?: number;
  /** Optional render-prop: content for the hovered point, keyed by its index in `series[n].data`. Placement only — content is the caller's responsibility (R8). */
  tooltip?: (index: number) => React.ReactNode;
}) {
  const n = series[0]?.data.length ?? 0;
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | null> = { i };
    series.forEach((s) => {
      row[s.name] = s.data[i] ?? null;
    });
    return row;
  });
  return (
    <div style={{ width: "100%", maxWidth: w, height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -10 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {tooltip && (
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const idx = payload[0]?.payload?.i;
                if (idx == null) return null;
                return <>{tooltip(idx)}</>;
              }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              connectNulls={false}
              dot={makeDotRenderer(s)}
              activeDot={{ r: 4, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
