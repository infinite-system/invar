#!/usr/bin/env bash
# Deterministic post-compaction context refill for the CONDUCTOR.
# Compaction preserves state summaries but destroys instrument fluency
# (proven 2026-08-03: six wasted round-trips on a retired drive API).
# Run this as the FIRST act after any compaction or resume; read ALL of
# its output. The skill list is data: scripts/recontext-skills.txt.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

banner() {
  printf '\n================================================================\n== %s\n================================================================\n' "$1"
}

banner "NEWEST RESUME ANCHOR (project.briefing.md)"
awk '/^# RESUME ANCHOR/{ if (found) exit; found=1 } found' project.briefing.md

list="scripts/recontext-skills.txt"
if [ ! -f "$list" ]; then
  echo "recontext: MISSING $list — refusing to guess the skill set" >&2
  exit 1
fi
while IFS= read -r skill_path; do
  case "$skill_path" in ''|'#'*) continue;; esac
  if [ ! -f "$skill_path" ]; then
    echo "recontext: MISSING skill file: $skill_path" >&2
    exit 1
  fi
  banner "SKILL: $skill_path"
  cat "$skill_path"
done < "$list"

banner "END OF RECONTEXT — state is the anchor above; fluency is the skills above"
