#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Denies git push / gh pr create / gh pr merge unless a
# fresh PASS is on record for the CURRENT diff. Never runs the review itself — only enforces
# that one ran and passed. Wire in .claude/settings.json under PreToolUse / Bash.
#
# Decision model (exit 2 = deny, stderr shown to the agent; exit 0 = allow):
#   command is not push/PR related ............ allow
#   PR_SELF_REVIEW_OVERRIDE set ............... allow (logged)
#   no state file ............................. deny  (run /pr-self-review first)
#   verdict is BLOCKED ........................ deny
#   diff moved since the review (stale hash) .. deny
#   PASS + hash matches ....................... allow
#   any internal error ........................ allow (fail-open: never brick the workflow)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE=".pr-self-review.json"

input="$(cat)"
cmd="$(printf '%s' "$input" | node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write((j.tool_input && j.tool_input.command) || "");
    } catch { process.stdout.write(""); }
  });
' 2>/dev/null || echo "")"

case "$cmd" in
  *"git push"*|*"gh pr create"*|*"gh pr merge"*) ;;
  *) exit 0 ;;
esac

if [ -n "${PR_SELF_REVIEW_OVERRIDE:-}" ]; then
  echo "pr-self-review: override accepted — reason: ${PR_SELF_REVIEW_OVERRIDE}" >&2
  exit 0
fi

if [ ! -f "$STATE" ]; then
  echo "🚫 pr-self-review: no review on record for this branch." >&2
  echo "   Run /pr-self-review first." >&2
  echo "   Hotfix? Set PR_SELF_REVIEW_OVERRIDE=\"reason\" and retry." >&2
  exit 2
fi

verdict="$(node -e "const fs=require('fs');try{process.stdout.write((JSON.parse(fs.readFileSync(process.argv[1],'utf8')).verdict)||'')}catch{process.stdout.write('ERR')}" "$STATE" 2>/dev/null || echo "ERR")"
saved="$(node -e "const fs=require('fs');try{process.stdout.write((JSON.parse(fs.readFileSync(process.argv[1],'utf8')).diffHash)||'')}catch{process.stdout.write('ERR')}" "$STATE" 2>/dev/null || echo "ERR")"

# Fail-open: a broken state file must never block all pushes permanently.
[ "$verdict" = "ERR" ] && exit 0
[ "$saved"   = "ERR" ] && exit 0

if [ "$verdict" = "BLOCKED" ]; then
  echo "🚫 pr-self-review: last review was BLOCKED — critical findings remain unresolved." >&2
  echo "   Fix the criticals and re-run /pr-self-review before pushing." >&2
  echo "   Hotfix? Set PR_SELF_REVIEW_OVERRIDE=\"reason\" and retry." >&2
  exit 2
fi

current="$("$DIR/diff-hash.sh" 2>/dev/null || echo "ERR")"
[ "$current" = "ERR" ] && exit 0  # can't compute hash — fail-open

if [ "$saved" != "$current" ]; then
  echo "🚫 pr-self-review: changes moved since the last review — PASS is stale." >&2
  echo "   Re-run /pr-self-review so the gate reflects what you're about to push." >&2
  exit 2
fi

exit 0
