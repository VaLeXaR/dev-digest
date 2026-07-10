/* OnThisPageNav — scroll-spy anchor nav over the 5 Onboarding Tour sections.
   Highlights the section nearest the viewport top (computeActiveSection,
   colocated helpers.ts) and scrolls to a section on click. Ready-state only. */
"use client";

import React from "react";
import { s } from "../../styles";
import { computeActiveSection } from "../../helpers";

export interface OnThisPageSection {
  id: string;
  label: string;
}

/** Walks up from `el` to find the nearest scrollable ancestor (overflow
    auto/scroll on the Y axis) — AppFrame's <main> scrolls, not `window`
    (client/INSIGHTS.md: "AppFrame's <main> is the real scroll container,
    not window/body" — confirmed via live screenshot verification, the
    scroll-spy silently never updated when listening on window). Falls back
    to `window` when no scrollable ancestor is found (e.g. in isolation). */
function findScrollTarget(el: HTMLElement | null): EventTarget {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return window;
}

/** True once the scroll target has bottomed out — the trailing section(s) can
    be shorter than the viewport, so their top never crosses the offset
    computeActiveSection uses; without this the last section(s) could never
    highlight even once fully scrolled into view (found via live screenshot
    verification: "Guided reading path"/"First tasks" never lit up). Only
    meaningful for a real scrollable element (AppFrame's <main> in
    production) — the `window` fallback only applies when this component is
    mounted outside AppFrame (e.g. isolated tests), where "at bottom" isn't a
    reliable signal (jsdom reports scrollHeight 0 with no real layout). */
function isAtBottom(target: EventTarget, tolerance = 4): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.scrollTop + target.clientHeight >= target.scrollHeight - tolerance;
}

export function OnThisPageNav({ label, sections }: { label: string; sections: OnThisPageSection[] }) {
  const [active, setActive] = React.useState<string | null>(sections[0]?.id ?? null);
  const navRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const target = findScrollTarget(navRef.current);
    function recompute() {
      const tops = sections
        .map(({ id }) => {
          const el = document.getElementById(id);
          return el ? { id, top: el.getBoundingClientRect().top } : null;
        })
        .filter((v): v is { id: string; top: number } => v !== null);
      const next = isAtBottom(target) ? sections[sections.length - 1]?.id : computeActiveSection(tops);
      if (next) setActive(next);
    }
    recompute();
    target.addEventListener("scroll", recompute, { passive: true });
    return () => target.removeEventListener("scroll", recompute);
    // sections is a stable literal built once per render of the parent (ready state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav ref={navRef} aria-label={label} style={s.navSticky}>
      <div style={s.navLabel}>{label}</div>
      <div style={s.navList}>
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            aria-current={active === sec.id ? "true" : undefined}
            style={s.navItem(active === sec.id)}
            onClick={() => goTo(sec.id)}
          >
            {sec.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default OnThisPageNav;
