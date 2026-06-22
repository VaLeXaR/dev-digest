import type { CSSProperties } from "react";

export const CARD_GRID_COLS = "repeat(auto-fill, minmax(280px, 1fr))";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,

  // Sidebar (used inside /skills/[id] layout)
  sidebar: { display: "flex", flexDirection: "column", height: "100%" } satisfies CSSProperties,
  sidebarTop: { padding: "16px 16px 12px" } satisfies CSSProperties,
  sidebarTitleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  sidebarTitle: { fontSize: 15, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
  sidebarSearch: {
    width: "100%",
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text-primary)",
    fontSize: 13,
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,
  sidebarList: { flex: 1, overflow: "auto", padding: "0 8px 12px" } satisfies CSSProperties,
} as const;
