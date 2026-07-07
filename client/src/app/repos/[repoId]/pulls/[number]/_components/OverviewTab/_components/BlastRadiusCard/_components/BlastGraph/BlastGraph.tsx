"use client";

import { Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { s } from "./styles";

const GraphIcon = Icon.Workflow;

export function BlastGraph() {
  const t = useTranslations("blast");

  return (
    <div aria-label={t("graph.ariaLabel")} style={s.container}>
      <GraphIcon size={28} style={s.icon} />
      <p style={s.text}>{t("graph.empty")}</p>
    </div>
  );
}
