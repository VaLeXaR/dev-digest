/* SectionCard — icon + title + functional collapse chevron; local open/closed
   state, default expanded. Shared shell for all five Onboarding Tour sections. */
"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "../../styles";

export function SectionCard({
  id,
  icon,
  title,
  caption,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const I = Icon[icon];
  return (
    <section id={id} style={s.card} aria-label={title}>
      <div
        role="button"
        tabIndex={0}
        // Distinct accessible name from the ON-THIS-PAGE nav's plain-title
        // buttons (same visible text otherwise) — see client/INSIGHTS.md.
        aria-label={`${title} section`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={s.cardHead}
      >
        <div style={s.cardIconBox}>
          <I size={14} />
        </div>
        <div style={s.cardTitleGroup}>
          <span style={s.cardTitle}>{title}</span>
          {caption && <span style={s.cardCaption}>{caption}</span>}
        </div>
        <Icon.ChevronDown size={16} style={s.cardChevron(open)} aria-hidden="true" />
      </div>
      {open && <div style={s.cardBody}>{children}</div>}
    </section>
  );
}

export default SectionCard;
