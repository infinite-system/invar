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
# DEDUP AGAINST THE SYSTEM PROMPT: when the session was launched via
# claude-conductor.sh (marker: CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE), the
# launch fundamentals SURVIVE compaction in the system prompt — injecting
# them again doubles tokens for nothing. Subtract, using the owner's list
# (conductor-system-prompt.sh --list-files), same mechanism as
# resume-conductor.sh. Without the marker, print everything.
# The truth of what the prompt holds is the marker FILE's own content — a
# session launched before a list change would otherwise dedup against a list
# its prompt never saw (caught live 2026-08-04). Fall back to --list-files
# only when the marker names a file that no longer exists.
fundamentals_list=""
if [ -n "${CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE:-}" ]; then
  if [ -f "$CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE" ]; then
    fundamentals_list="$(grep -oE '^== FUNDAMENTAL: .*' "$CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE" | sed 's/^== FUNDAMENTAL: //')"
  else
    fundamentals_list="$(bash scripts/conductor-system-prompt.sh --list-files)"
  fi
fi
while IFS= read -r skill_path; do
  case "$skill_path" in ''|'#'*) continue;; esac
  if [ ! -f "$skill_path" ]; then
    echo "recontext: MISSING skill file: $skill_path" >&2
    exit 1
  fi
  if [ -n "$fundamentals_list" ] && grep -qFx "$skill_path" <<<"$fundamentals_list"; then
    banner "SKILL SKIPPED (already in the system prompt): $skill_path"
    continue
  fi
  banner "SKILL: $skill_path"
  cat "$skill_path"
done < "$list"

banner "END OF RECONTEXT — state is the anchor above; fluency is the skills above"
