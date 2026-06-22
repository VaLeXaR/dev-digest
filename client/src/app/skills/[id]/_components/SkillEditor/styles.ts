import type React from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", height: "100%" } as React.CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)", flexShrink: 0 } as React.CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } as React.CSSProperties,
};
