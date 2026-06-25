const SEVS: { key: string; color: string; label: string }[] = [
  { key: "CRITICAL", color: "var(--crit)", label: "CRITICAL" },
  { key: "WARNING", color: "var(--warn)", label: "WARNING" },
  { key: "SUGGESTION", color: "var(--sugg)", label: "SUGGESTION" },
];

export function SeverityFilterBar({
  counts,
  active,
  onToggle,
}: {
  counts: Record<string, number>;
  active: string | null;
  onToggle: (sev: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {SEVS.map(({ key, color, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            title={isActive ? "Show all severities" : `Show only ${label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 9px",
              borderRadius: 20,
              border: `1px solid ${isActive ? color : "var(--border)"}`,
              background: isActive ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
              color: isActive ? color : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: "0.02em",
              transition: "border-color .12s, color .12s, background .12s",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 12 }}>{counts[key] ?? 0}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
