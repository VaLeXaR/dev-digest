#!/usr/bin/env bash
#
# Stop-hook gate for the engineering-insights skill.
#
# Does NOT write insights itself. It blocks the Stop with a reason, which hands
# the job back to the MAIN model — the only participant that has the turn in
# context.
#
# Why not the agent hook this replaces: that agent was forbidden from reading the
# transcript, so its only input was a list of changed files. But the highest-value
# insights — user corrections, approaches that failed, tool surprises — leave no
# trace in the diff; a dead end is by definition code that got thrown away. From a
# file list alone an agent can only derive what is already obvious from reading the
# code, which is exactly what the skill's quality filter says to discard. It could
# produce noise or silence, never signal.
#
# Loop safety, two layers:
#   * `stop_hook_active` is true on the Stop that follows a block, so the
#     follow-up turn is never gated again. This is the canonical guard.
#   * The watermark is bumped when we ASK, not on every Stop. Files we have already
#     asked about fall behind it and never resurface, so a new cycle needs new work.
#     (The previous script bumped unconditionally and had to accept losing
#     insight-free sessions' paths; asking is the honest trigger for the bump.)
#
# INSIGHTS.md itself is excluded from the candidate list — otherwise the model
# writing an insight would be new work that triggers the next gate.

set -euo pipefail

STDIN_JSON="$(cat)"

# Layer 1: we already asked and the model is continuing because of it.
if printf '%s' "$STDIN_JSON" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Outside a repo (or git is unavailable) there is nothing to diff against. Stay
# silent rather than surfacing a hook error on every Stop.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$ROOT" ] || exit 0
cd "$ROOT"

MARKER=.claude/tmp/insights-last-run
LIMIT=40

mkdir -p .claude/tmp

# Tracked edits (staged + unstaged) plus untracked files. `git status --short`
# covers the same set, but its `XY path` / `R old -> new` / quoted-path output
# needs parsing; these two plumbing calls emit one clean path per line.
# `|| true`: a repo with no commits yet has no HEAD to diff against.
collect() {
  git -c core.quotepath=false diff --name-only HEAD 2>/dev/null || true
  git -c core.quotepath=false ls-files --others --exclude-standard 2>/dev/null || true
}

candidates() {
  collect | sort -u | while IFS= read -r f; do
    [ -n "$f" ] || continue
    # Deleted paths fail -f and drop out: nothing left to read, and with no file
    # to stat they would otherwise resurface on every Stop until commit.
    [ -f "$f" ] || continue
    case "$f" in
      INSIGHTS.md | */INSIGHTS.md) continue ;;
      .claude/tmp/*) continue ;;
    esac
    if [ -f "$MARKER" ] && [ ! "$f" -nt "$MARKER" ]; then
      continue
    fi
    printf '%s\n' "$f"
  done
}

LIST="$(candidates)"
[ -n "$LIST" ] || exit 0

COUNT="$(printf '%s\n' "$LIST" | wc -l | tr -d '[:space:]')"
SHOWN="$(printf '%s\n' "$LIST" | head -n "$LIMIT")"
if [ "$COUNT" -gt "$LIMIT" ]; then
  SHOWN="$SHOWN
… and $((COUNT - LIMIT)) more"
fi

REASON="Stop gate — engineering-insights. $COUNT file(s) changed since the last insights check:

$SHOWN

Invoke the engineering-insights skill now. Judge from THIS conversation, not from the diff: corrections the user made, approaches that failed, things that surprised you, tool or library quirks, decisions worth their reason. The diff shows only what survived — the dead ends are the valuable part and they are in your context, not in these files.

Apply the skill's quality filter (discard anything obvious from five minutes of reading the code), dedup against the target module's INSIGHTS.md, and append with an anchored Edit under the matching '## Section' header. Never Write over an existing INSIGHTS.md.

If the turn was mechanical or nothing passes the filter, say so in one line and stop — an empty file beats a noisy one. This gate will not fire again for these files."

# Bump the watermark at ASK time: layer 2 of the loop guard.
touch "$MARKER"

# Manual JSON encoding — jq is not available in this environment. Escape
# backslashes, then quotes, then fold real newlines into \n.
escaped="$(printf '%s' "$REASON" |
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' |
  sed -e ':a' -e 'N' -e '$!ba' -e 's/\n/\\n/g')"

printf '{"decision":"block","reason":"%s"}\n' "$escaped"
