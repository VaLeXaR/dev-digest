#!/usr/bin/env bash
#
# Stop-hook helper for the engineering-insights agent hook.
#
# Emits, one path per line, the files changed SINCE THE LAST insights run —
# not simply "everything dirty in the working tree".
#
# Why a watermark: the change list is derived state, rebuilt from git on every
# Stop. Keyed off `git status` alone, uncommitted files reappear on every single
# Stop, so the agent re-reads work it already wrote insights for. Committing is
# the only thing that would clear them, which is not always an option mid-work.
# `.claude/tmp/insights-last-run` is the watermark: only files with an mtime
# newer than it survive the filter.
#
# Why the watermark is bumped HERE rather than by the agent once it has actually
# written something — which would be the precise version:
#
#   * A trailing cleanup hook cannot do it: hooks inside a single `hooks` array
#     run in PARALLEL (see the Claude Code hooks reference), so it would race the
#     agent rather than follow it.
#   * The agent itself could Write the marker, but that needs a
#     `Write(.claude/tmp/insights-last-run)` rule in permissions.allow. Without
#     one the Stop-time write has nobody to approve it, the marker never moves,
#     and the filter silently degrades to "always the whole dirty list" — worse
#     than no watermark at all.
#
# Accepted trade-off (deliberate, 2026-07-17): a session the agent judges
# insight-free still advances the watermark, so those paths never resurface. If
# insights start going missing, the fix is the permission rule above plus moving
# the bump into the agent prompt — not dropping the watermark.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TMP_DIR=.claude/tmp
OUT="$TMP_DIR/insights-changes.txt"
MARKER="$TMP_DIR/insights-last-run"

mkdir -p "$TMP_DIR"

# Tracked edits (staged + unstaged) plus untracked files. `git status --short`
# covers the same set, but its `XY path` / `R old -> new` / quoted-path output
# needs parsing; these two plumbing calls emit one clean path per line.
collect() {
  git -c core.quotepath=false diff --name-only HEAD
  git -c core.quotepath=false ls-files --others --exclude-standard
}

if [ -f "$MARKER" ]; then
  # Deleted paths fail -f and drop out: there is nothing left to read, and with
  # no file to stat they would otherwise resurface on every Stop until commit.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || continue
    if [ "$f" -nt "$MARKER" ]; then
      printf '%s\n' "$f"
    fi
  done < <(collect | sort -u) > "$OUT"
else
  # First run: no watermark yet, so everything currently dirty is a candidate.
  collect | sort -u > "$OUT"
fi

touch "$MARKER"
