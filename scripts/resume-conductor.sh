#!/usr/bin/env bash
# resume-conductor.sh — the conductor's ENTIRE resume orientation, one command.
#
# Two resurrection drills (2026-07-30) proved instructions survive one
# dereference, never two: the fresh conductor skipped AGENTS.md, then read
# AGENTS.md but skipped ITS required reading. This script deletes the
# dereferences: it prints the complete closure into context, in law-first
# order, with loud boundaries. Reading its output IS the orientation.
#
#   bash scripts/resume-conductor.sh
#
# LOUD-FAILURE LAW: a missing closure file is a hard error, never a silent
# skip — an orientation that quietly omits the law is worse than none.
# Self-test: --self-test proves both arms (full output present; a missing
# file fails loudly).

set -euo pipefail

script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
repository_root="$(git rev-parse --show-toplevel)"

closure_files=(
  "AGENTS.md"
  "project.conventions.md"
  ".claude/skills/ste-expression/SKILL.md"
  ".claude/skills/ibr/IBR.md"
  ".claude/skills/conductor/SKILL.md"
)

# When launched via claude-conductor.sh the fundamentals are ALREADY in the
# session's system prompt (marker: CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE).
# Printing them again doubles ~45k tokens for nothing — subtract them.
# The list of what the system prompt holds comes from its OWNER
# (conductor-system-prompt.sh --list-files), never a copied list here.
skipped_files=()
if [ -n "${CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE:-}" ]; then
  fundamentals_list="$("${repository_root}/scripts/conductor-system-prompt.sh" --list-files)"
  remaining_files=()
  for relative_path in "${closure_files[@]}"; do
    if grep -qFx "$relative_path" <<<"$fundamentals_list"; then
      skipped_files+=("$relative_path")
    else
      remaining_files+=("$relative_path")
    fi
  done
  closure_files=("${remaining_files[@]}")
fi

print_file() {
  local relative_path="$1"
  local absolute_path="${repository_root}/${relative_path}"
  if [ ! -f "$absolute_path" ]; then
    echo "resume-conductor: FATAL — closure file missing: ${relative_path}" >&2
    echo "resume-conductor: the orientation is INCOMPLETE; do not proceed." >&2
    exit 3
  fi
  printf '\n================================================================\n'
  printf '== CLOSURE DOCUMENT: %s\n' "$relative_path"
  printf '================================================================\n\n'
  cat "$absolute_path"
}

print_newest_anchor() {
  local briefing="${repository_root}/project.briefing.md"
  if [ ! -f "$briefing" ]; then
    echo "resume-conductor: FATAL — project.briefing.md missing." >&2
    exit 3
  fi
  printf '\n================================================================\n'
  printf '== NEWEST RESUME ANCHOR (from project.briefing.md)\n'
  printf '================================================================\n\n'
  # The newest anchor is the LAST "## RESUME ANCHOR" section in the file.
  awk '/^## RESUME ANCHOR/{ buffer=""; capturing=1 } capturing{ buffer=buffer $0 "\n" } END{ printf "%s", buffer }' "$briefing"
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  # PRESENT arm: every closure header + the anchor header appear in the output.
  # The marker is explicitly UNSET — inside a conductor session it is set, and
  # inheriting it would subtract files and false-fail this arm.
  full_output="$(env -u CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE bash "$0")"
  # Herestrings, not pipes: grep -q exits at first match; with pipefail the
  # writer's SIGPIPE (141) then fails the pipeline EXACTLY when the match is
  # early — the instrument punished success (caught 2026-07-30, first run).
  for relative_path in "${closure_files[@]}"; do
    grep -qF "CLOSURE DOCUMENT: ${relative_path}" <<<"$full_output" \
      || { echo "FAIL present arm — ${relative_path} header missing"; failures=1; }
  done
  grep -qF 'NEWEST RESUME ANCHOR' <<<"$full_output" \
    || { echo "FAIL present arm — anchor section missing"; failures=1; }
  grep -qF 'RESUME ANCHOR' <<<"$full_output" \
    || { echo "FAIL present arm — newest anchor content missing"; failures=1; }
  # MARKER arm: with the launcher's marker set, fundamentals already in the
  # system prompt are NOT reprinted (loud notice instead); non-fundamentals stay.
  marker_output="$(CLAUDE_CONDUCTOR_FUNDAMENTALS_FILE=/proc/self/status bash "$0")"
  grep -qF 'CLOSURE DOCUMENT: .claude/skills/ibr/IBR.md' <<<"$marker_output" \
    && { echo "FAIL marker arm — IBR.md reprinted despite system-prompt marker"; failures=1; }
  grep -qF 'CLOSURE DOCUMENT: .claude/skills/conductor/SKILL.md' <<<"$marker_output" \
    && { echo "FAIL marker arm — conductor skill reprinted despite marker"; failures=1; }
  grep -qF 'CLOSURE DOCUMENT: AGENTS.md' <<<"$marker_output" \
    || { echo "FAIL marker arm — AGENTS.md missing (must survive subtraction)"; failures=1; }
  grep -qF 'ALREADY IN YOUR SYSTEM PROMPT' <<<"$marker_output" \
    || { echo "FAIL marker arm — skip notice missing"; failures=1; }
  # ABSENT arm: a missing closure file must fail loudly, not print a partial orientation.
  sandbox="$(mktemp -d /tmp/resume-conductor-selftest-XXXXXX)"
  git -C "$repository_root" worktree add --detach "$sandbox/tree" HEAD >/dev/null 2>&1
  rm "$sandbox/tree/project.conventions.md"
  if (cd "$sandbox/tree" && bash "$script_path" >/dev/null 2>&1); then
    echo "FAIL absent arm — missing conventions file did not fail"; failures=1
  fi
  git -C "$repository_root" worktree remove --force "$sandbox/tree" >/dev/null 2>&1 || true
  rm -rf "$sandbox"
  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: full closure prints; a missing file fails loudly."
    exit 0
  fi
  exit 1
fi

printf 'CONDUCTOR RESUME ORIENTATION — reading this output IS the required reading.\n'
printf 'Order: law, conventions, expression, reasoning, doctrine, then the anchor.\n'
if [ "${#skipped_files[@]}" -gt 0 ]; then
  printf 'ALREADY IN YOUR SYSTEM PROMPT (not reprinted): %s\n' "${skipped_files[*]}"
fi

for relative_path in "${closure_files[@]}"; do
  print_file "$relative_path"
done
print_newest_anchor

printf '\n================================================================\n'
printf '== END OF ORIENTATION — now act per the anchor above.\n'
printf '================================================================\n'
