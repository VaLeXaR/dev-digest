"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";

export interface SelectOption<T extends string = string> {
  value: T;
  label?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  width,
  disabled,
}: {
  value: T | "";
  onChange?: (v: T) => void;
  options: (T | SelectOption<T>)[];
  placeholder?: string;
  width?: number | string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropRef.current && !dropRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const normalized = options.map((o) =>
    typeof o === "string"
      ? { value: o as T, label: o }
      : { value: o.value, label: o.label ?? o.value },
  );

  const selected = normalized.find((o) => o.value === value);

  function handleToggle() {
    if (disabled) return;
    if (!open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  }

  const dropdown =
    open && mounted && rect
      ? createPortal(
          <div
            ref={dropRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              zIndex: 9999,
              animation: "ddpop .12s ease",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {normalized.map((o) => (
              <SelectItem
                key={o.value}
                label={o.label!}
                active={o.value === value}
                onClick={() => {
                  onChange?.(o.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div style={{ position: "relative", display: "block", width: width ?? "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "10px 12px",
          borderRadius: 7,
          border: `1px solid ${open ? "var(--accent)" : "var(--border-strong)"}`,
          background: "var(--bg-elevated)",
          color: selected ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: 14,
          fontWeight: 400,
          textAlign: "left",
          cursor: disabled ? "default" : "pointer",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color .12s",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1 }}>{selected?.label ?? placeholder}</span>
        <Icon.ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .15s",
          }}
        />
      </button>
      {dropdown}
    </div>
  );
}

function SelectItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        borderRadius: 6,
        border: "none",
        background: hover ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {active && <Icon.Check size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />}
    </button>
  );
}
