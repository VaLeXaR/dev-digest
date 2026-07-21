/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { GraduationCap, Reply } from "lucide-react";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

// Matches `Button`'s own icon-size formula for `size="sm"` (`fs + 2`, fs=12.5)
// — Learn/Reply stub icons are rendered as plain children (not the `icon` prop)
// because `@devdigest/ui`'s icon registry (`vendor/ui/icons.tsx`) is out of this
// task's Owned paths and doesn't carry GraduationCap/Reply.
const STUB_ICON_SIZE = 14.5;

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  onGoToDiff,
  targetId,
  targetNonce,
  onTurnIntoEvalCase,
  evalCaseDisabled,
  evalCaseDisabledReason,
  evalCasePending,
  showStubActions,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  onGoToDiff?: (file: string, line: number) => void;
  targetId?: string | null;
  targetNonce?: number;
  /** Opens the "Turn into eval case" modal (screen 2) — seeds a new case, or
   *  reopens the one this finding already backs. NOT a `FindingActionKind`, so a
   *  separate handler prop rather than overloading `onAction`. */
  onTurnIntoEvalCase?: () => void;
  /** True when the finding's review has no resolvable agent (`review.agent_id`
   *  is null) — the button is disabled rather than removed, with a tooltip. */
  evalCaseDisabled?: boolean;
  evalCaseDisabledReason?: string;
  /** True while the seed for this finding is being fetched (modal opening). */
  evalCasePending?: boolean;
  /** AC-24 (multi-agent review context only): renders two extra visible-but-
   *  disabled no-op action buttons — "Learn" and "Reply to author" — matching
   *  `design/05.png`'s expanded action row. Fires NO handler and calls NO
   *  server route; `FindingActionKind` is deliberately NOT extended for these.
   *  Absent/false on the existing single-agent PR findings page. */
  showStubActions?: boolean;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (targetId && f.id === targetId) {
      setExpanded(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, targetNonce]);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    !onGoToDiff && repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div ref={cardRef} data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink
              href={fileHref}
              onClick={onGoToDiff ? () => onGoToDiff(f.file, f.start_line) : undefined}
            >
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              style={accepted ? s.acceptActive : undefined}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              style={dismissed ? s.dismissActive : undefined}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {showStubActions && (
              <Button kind="ghost" size="sm" disabled>
                <GraduationCap size={STUB_ICON_SIZE} />
                {t("finding.learn")}
              </Button>
            )}
            {onTurnIntoEvalCase &&
              (() => {
                // Gated until the finding is decided (screen 1): an eval case's
                // expectation type is derived from accept/dismiss, so there is
                // nothing to seed before then.
                const needsDecision = !accepted && !dismissed;
                const disabled = evalCaseDisabled || needsDecision;
                const reason = evalCaseDisabled
                  ? evalCaseDisabledReason
                  : needsDecision
                    ? t("finding.evalNeedsDecision")
                    : undefined;
                return (
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="FlaskConical"
                    disabled={disabled || evalCasePending}
                    loading={evalCasePending}
                    title={reason}
                    onClick={onTurnIntoEvalCase}
                  >
                    {t("finding.turnIntoEvalCase")}
                  </Button>
                );
              })()}
            {showStubActions && (
              <Button kind="ghost" size="sm" disabled>
                <Reply size={STUB_ICON_SIZE} />
                {t("finding.replyToAuthor")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
