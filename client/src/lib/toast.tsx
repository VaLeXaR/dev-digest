/* toast.tsx — A6 cross-cutting: system-level notifications.
   Error UX taxonomy: system errors → toast (here); form errors → inline;
   critical → full-screen (ErrorState fullScreen). */
"use client";

import React from "react";
import { s, TOAST_DURATION_MS } from "./toast.styles";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastCtx = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* Module-level bridge so non-React code (e.g. the React Query cache) can raise
   toasts without the hook. Exactly ONE <ToastProvider> must be mounted at a
   time — concurrent providers would race and the last one to mount wins. */
type Pusher = (message: string, kind?: ToastKind) => void;
let activePusher: Pusher | null = null;
export const notify = {
  toast: (m: string, k?: ToastKind) => activePusher?.(m, k),
  success: (m: string) => activePusher?.(m, "success"),
  error: (m: string) => activePusher?.(m, "error"),
  info: (m: string) => activePusher?.(m, "info"),
};

// Pre-computed per-kind styles at module level (avoids inline object literals in JSX).
const COLORS: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  success: { bg: "var(--ok-bg, #052e1c)", border: "var(--ok)", icon: "✓" },
  error: { bg: "var(--crit-bg, #2e0a0a)", border: "var(--crit)", icon: "✕" },
  info: { bg: "var(--bg-elevated)", border: "var(--border-strong)", icon: "ℹ" },
};

const itemStyles: Record<ToastKind, React.CSSProperties> = {
  success: { ...s.item, background: COLORS.success.bg, border: `1px solid ${COLORS.success.border}` },
  error: { ...s.item, background: COLORS.error.bg, border: `1px solid ${COLORS.error.border}` },
  info: { ...s.item, background: COLORS.info.bg, border: `1px solid ${COLORS.info.border}` },
};

const iconStyles: Record<ToastKind, React.CSSProperties> = {
  success: { color: COLORS.success.border, fontWeight: 700 },
  error: { color: COLORS.error.border, fontWeight: 700 },
  info: { color: COLORS.info.border, fontWeight: 700 },
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);

  return (
    <div style={itemStyles[t.kind]}>
      <span style={iconStyles[t.kind]}>{COLORS[t.kind].icon}</span>
      <span style={s.message}>{t.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        style={s.dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const seq = React.useRef(1);

  const push = React.useCallback((message: string, kind: ToastKind = "info") => {
    const id = seq.current++;
    setItems((prev) => [...prev, { id, kind, message }]);
  }, []);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push],
  );

  // Expose this provider's pusher to the module-level `notify` bridge.
  React.useEffect(() => {
    activePusher = push;
    return () => {
      if (activePusher === push) activePusher = null;
    };
  }, [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={s.container} role="status" aria-live="polite">
        {items.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
