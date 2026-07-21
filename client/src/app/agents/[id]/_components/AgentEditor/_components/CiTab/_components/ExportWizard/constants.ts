import type { CiTarget } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** i18n key suffix (under the `ci` namespace) for each `CiTarget`'s label —
    shared by the wizard's own Target-step cards and CiTab's installation-row
    badge (AC-21), so both read the same `ci.json` copy. */
export const TARGET_LABEL_KEYS: Record<CiTarget, string> = {
  gha: "exportWizard.targets.gha",
  circle: "exportWizard.targets.circle",
  jenkins: "exportWizard.targets.jenkins",
  cli: "exportWizard.targets.cli",
};

export interface TargetCardDef {
  key: CiTarget;
  icon: IconName;
  labelKey: string;
  descKey: string;
  /** Only "gha" is implemented (T-02) — the other three are visible-but-disabled
      "coming soon" cards (AC-2, AC-43). Signaled via `disabled` + a native
      `title` tooltip rather than a visible badge, since the mockup
      (design/02-wizard-1-target.png) shows no "coming soon" text on the cards
      themselves — only the muted disabled look. */
  disabled: boolean;
}

export const TARGET_CARDS: readonly TargetCardDef[] = [
  { key: "gha", icon: "Workflow", labelKey: "exportWizard.targets.gha", descKey: "exportWizard.targets.ghaDesc", disabled: false },
  { key: "circle", icon: "RefreshCw", labelKey: "exportWizard.targets.circle", descKey: "exportWizard.targets.circleDesc", disabled: true },
  { key: "jenkins", icon: "Settings", labelKey: "exportWizard.targets.jenkins", descKey: "exportWizard.targets.jenkinsDesc", disabled: true },
  { key: "cli", icon: "Command", labelKey: "exportWizard.targets.cli", descKey: "exportWizard.targets.cliDesc", disabled: true },
];

/** Trigger chip ids (AC-7). `opened`/`synchronize` start selected, `reopened`
    is optional/unselected — matches design/02-wizard-... design/04. */
export const TRIGGER_IDS = ["opened", "synchronize", "reopened"] as const;
export type TriggerId = (typeof TRIGGER_IDS)[number];
export const DEFAULT_TRIGGERS: TriggerId[] = ["opened", "synchronize"];

export type PostAs = "github_review" | "pr_comment" | "none";
export const POST_AS_VALUES: readonly PostAs[] = ["github_review", "pr_comment", "none"];

export type InstallMethod = "open_pr" | "zip";
