import React from "react";
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
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: (T | SelectOption<T>)[];
  placeholder?: string;
  width?: number | string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o as T, label: o } : { value: o.value, label: o.label ?? o.value },
  );

  const selected = normalized.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", display: "block", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          borderRadius: 7,
          border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
          background: "var(--bg-input)",
          color: selected ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: 13,
          fontWeight: 400,
          textAlign: "left",
          cursor: "pointer",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color .12s",
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

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            padding: 6,
            zIndex: 50,
            animation: "ddpop .12s ease",
          }}
        >
          {normalized.map((o) => (
            <SelectItem
              key={o.value}
              label={o.label!}
              active={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
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
        padding: "7px 10px",
        borderRadius: 6,
        border: "none",
        background: hover ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 13,
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
