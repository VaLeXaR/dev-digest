import React from "react";
import { Icon, type IconName } from "../icons";

export function IconBtn({
  icon,
  label,
  size = 30,
  active,
  onClick,
  danger,
  loading,
  disabled,
}: {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  /** Swap the icon for a spinner and block clicks (e.g. an in-flight action). */
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  const I = loading ? Icon.RefreshCw : Icon[icon];
  const [h, setH] = React.useState(false);
  const hovered = h && !isDisabled;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: hovered ? "var(--bg-hover)" : active ? "var(--bg-hover)" : "transparent",
        color: danger && hovered ? "var(--crit)" : active || hovered ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: isDisabled ? "default" : "pointer",
        opacity: disabled && !loading ? 0.5 : 1,
        transition: "background .12s, color .12s",
      }}
    >
      <I
        size={Math.round(size * 0.52)}
        style={loading ? { animation: "ddspin 1s linear infinite" } : undefined}
      />
    </button>
  );
}
