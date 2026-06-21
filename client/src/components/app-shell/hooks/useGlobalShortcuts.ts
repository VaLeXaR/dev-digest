"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { NAV, SETTINGS_ITEM, resolveHref } from "@devdigest/ui";
import { useActiveRepo } from "../../../lib/repo-context";
import { G_NAV_TIMEOUT_MS } from "../constants";
import { isTextInput } from "../helpers";

interface GlobalShortcutHandlers {
  onOpenPalette: () => void;
  onOpenHelp: () => void;
}

/**
 * Binds the global keyboard shortcuts: Cmd/Ctrl+K opens the command
 * palette, `?` opens shortcuts help, and `g`-then-key navigates to a section.
 */
export function useGlobalShortcuts({ onOpenPalette, onOpenHelp }: GlobalShortcutHandlers): void {
  const router = useRouter();
  const { repoId } = useActiveRepo();

  // Refs let the effect read the latest callbacks without needing them as deps,
  // which would reset gPending state on every navigation or parent re-render.
  const onOpenPaletteRef = React.useRef(onOpenPalette);
  onOpenPaletteRef.current = onOpenPalette;
  const onOpenHelpRef = React.useRef(onOpenHelp);
  onOpenHelpRef.current = onOpenHelp;

  React.useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenPaletteRef.current();
        return;
      }
      if (isTextInput(e.target)) return;
      if (e.key === "?") {
        onOpenHelpRef.current();
        return;
      }
      if (e.key === "g") {
        gPending = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (gPending = false), G_NAV_TIMEOUT_MS);
        return;
      }
      if (gPending) {
        gPending = false;
        const target = NAV.flatMap((g) => g.items).find((it) => it.gKey === e.key);
        if (target) router.push(resolveHref(target.href, repoId));
        else if (e.key === SETTINGS_ITEM.gKey) router.push(SETTINGS_ITEM.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(gTimer);
    };
  }, [router, repoId]);
}
