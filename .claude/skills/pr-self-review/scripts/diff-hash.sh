#!/usr/bin/env bash
# Stable SHA-256 of "all open changes vs origin/main":
# committed-not-merged + staged + unstaged + untracked file contents.
#
# Used by BOTH the review (stamps .pr-self-review.json) and check-gate.sh (detects a stale
# PASS). Always go through this script — never inline the hash logic — so the two are
# guaranteed to use the same algorithm.
set -euo pipefail

BASE="$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD)"

_hash() {
  sha256sum 2>/dev/null || shasum -a 256
}

{
  git diff "$BASE"
  # Untracked files: include name + content so a new file invalidates a prior PASS.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    printf '\n--- untracked: %s ---\n' "$f"
    cat -- "$f" 2>/dev/null || true
  done < <(git ls-files --others --exclude-standard | sort)
} | _hash | awk '{print $1}'
