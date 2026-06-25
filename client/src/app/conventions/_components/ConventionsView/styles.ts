import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 44px",
    maxWidth: 860,
    margin: "0 auto",
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 6,
  } satisfies CSSProperties,

  headerText: { flex: 1 } satisfies CSSProperties,

  h1: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 6,
    marginBottom: 0,
  } satisfies CSSProperties,

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    marginBottom: 18,
  } satisfies CSSProperties,

  toolbarRight: {
    marginLeft: "auto",
  } satisfies CSSProperties,

  counter: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  } satisfies CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  emptyState: {
    textAlign: "center" as const,
    padding: "48px 24px",
    color: "var(--text-secondary)",
    fontSize: 14,
  } satisfies CSSProperties,

  emptyStateTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 8,
  } satisfies CSSProperties,

  repoName: {
    color: "var(--accent-text, var(--accent))",
  } satisfies CSSProperties,

  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  } satisfies CSSProperties,

  modal: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "28px 28px 24px",
    maxWidth: 400,
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  } satisfies CSSProperties,

  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,

  modalBody: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  } satisfies CSSProperties,

  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid currentColor",
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "ddspin 0.75s linear infinite",
  } satisfies CSSProperties,
} as const;
