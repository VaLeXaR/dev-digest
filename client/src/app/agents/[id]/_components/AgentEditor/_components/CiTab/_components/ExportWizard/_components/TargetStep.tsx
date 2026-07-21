"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Icon } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { TARGET_CARDS } from "../constants";
import { s } from "../styles";

/** Step 1 — Target (design/02-wizard-1-target.png). GitHub Actions is
    selected by default; the other three are visible-but-disabled (AC-2,
    AC-43). Continue always moves forward in fixed order (AC-3) — there is no
    Back button on the first step, matching the mockup. */
export function TargetStep({
  target,
  onContinue,
}: {
  target: CiTarget;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");

  return (
    <div style={s.body}>
      <div style={s.cardGrid}>
        {TARGET_CARDS.map((card) => {
          const Icn = Icon[card.icon];
          const selected = card.key === target;
          return (
            <button
              key={card.key}
              type="button"
              disabled={card.disabled}
              title={card.disabled ? "Coming soon" : undefined}
              style={s.card(selected, card.disabled)}
            >
              <div style={s.cardHeader}>
                <Icn size={18} style={{ color: selected ? "var(--accent)" : "var(--text-muted)" }} />
                <span style={s.cardTitle}>{t(card.labelKey)}</span>
                {card.key === "gha" && <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.recommended")}</Badge>}
              </div>
              <span style={s.cardDesc}>{t(card.descKey)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ ...s.footer, marginTop: "auto", paddingTop: 20 }}>
        <div style={s.footerRight}>
          <Button kind="primary" iconRight="ArrowRight" onClick={onContinue}>
            {t("exportWizard.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
