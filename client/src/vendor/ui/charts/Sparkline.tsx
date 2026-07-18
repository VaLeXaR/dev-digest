/* Sparkline — lightweight inline-SVG trend line (no Recharts; trivial + perf). */
import React from "react";

export function Sparkline({
  data,
  color = "var(--accent)",
  w = 80,
  h = 24,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  // Length-1 guard (R11.2): the divisor below is `data.length - 1`, which is 0 at
  // length 1 — `0/0 → NaN` produces an invalid path and a NaN-positioned circle, so
  // the whole sparkline silently vanishes. Skip the path and draw just the terminal
  // dot at the right edge, consistent with "latest value sits at the right".
  if (data.length === 1) {
    const only = data[0]!;
    const y = h - ((only - min) / span) * (h - 4) - 2;
    return (
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        <circle cx={w} cy={y} r={2} fill={color} />
      </svg>
    );
  }

  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0]!.toFixed(1) + "," + p[1]!.toFixed(1)).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}
