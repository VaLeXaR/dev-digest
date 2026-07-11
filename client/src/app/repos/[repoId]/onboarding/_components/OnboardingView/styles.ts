import type { CSSProperties } from "react";

/** Shared styles for OnboardingView and its colocated section subcomponents
    (each imports `s` via `../../styles`, matching the TraceSection
    precedent — client/INSIGHTS.md `RunTraceDrawer/_components/TraceSection`). */
export const s = {
  container: { padding: "24px 32px 60px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 28,
  } satisfies CSSProperties,

  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  staleHint: { color: "var(--text-muted)" } satisfies CSSProperties,

  actions: { display: "flex", gap: 10, flexShrink: 0 } satisfies CSSProperties,

  layout: {
    display: "grid",
    gridTemplateColumns: "190px 1fr",
    gap: 40,
    alignItems: "start",
  } satisfies CSSProperties,

  sections: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 } satisfies CSSProperties,

  // ---- ON-THIS-PAGE nav ----
  navSticky: { position: "sticky", top: 24 } satisfies CSSProperties,
  navLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  navList: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  navItem: (active: boolean): CSSProperties => ({
    textAlign: "left",
    padding: "6px 10px",
    fontSize: 13.5,
    // Round only the right corners — the design's active-indicator bar
    // (borderLeft below) has square, not rounded, ends.
    borderRadius: "0 6px 6px 0",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 400,
    background: "transparent",
  }),

  // ---- Section card ----
  card: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)" } satisfies CSSProperties,
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    cursor: "pointer",
  } satisfies CSSProperties,
  cardIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  cardTitleGroup: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  cardTitle: { fontSize: 14.5, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  cardCaption: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  cardChevron: (open: boolean): CSSProperties => ({
    marginLeft: "auto",
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  cardBody: {
    padding: "0 18px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  emptyText: { fontSize: 13.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,

  // ---- Diagram box ----
  diagramWrap: { marginTop: 4 } satisfies CSSProperties,

  // ---- File rows (critical paths + first-tasks chips) ----
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  fileRowIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  // Plain block (not flex) so the path + annotation flow as normal inline
  // text — the annotation wraps word-by-word right after the path instead
  // of being pushed to its own line as a whole flex item when it's long.
  fileRowText: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  fileRowPath: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  fileRowAnnotation: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  // ---- Numbered rows (run-locally + reading-path + first-tasks) ----
  numberedRow: { display: "flex", gap: 12, alignItems: "flex-start" } satisfies CSSProperties,
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 11,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,

  // ---- Run-locally command row ----
  commandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  // Line-number gutter INSIDE the command's own bordered row (not an
  // external circular badge like the other numbered sections) — commands
  // are single-line with no secondary description, so the design treats
  // each row like one line of a code block.
  commandIndex: {
    fontSize: 13,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  commandText: {
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    flex: 1,
  } satisfies CSSProperties,
  commandComment: { color: "var(--text-muted)" } satisfies CSSProperties,
  copyBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
    flexShrink: 0,
  } satisfies CSSProperties,

  // ---- Reading path / first tasks text rows ----
  readingPathBody: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  readingPathPath: { fontSize: 13.5, fontWeight: 650, color: "var(--text-secondary)" } satisfies CSSProperties,
  readingPathReason: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  // ---- First tasks (card grid) ----
  taskGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  taskCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "14px 16px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    // Grid items default to min-width:auto, which lets a long unbreakable
    // path (button) push the card wider than its column — override to 0 so
    // the card actually shrinks and the path below can ellipsis instead.
    minWidth: 0,
  } satisfies CSSProperties,
  taskTitle: { fontSize: 13.5, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  taskPath: {
    display: "block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12.5,
    color: "var(--text-muted)",
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    alignSelf: "flex-start",
  } satisfies CSSProperties,
} as const;
