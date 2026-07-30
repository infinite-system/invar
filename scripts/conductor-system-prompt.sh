#!/usr/bin/env bash
# conductor-system-prompt.sh — generate the conductor's SYSTEM-PROMPT fundamentals.
#
# The system prompt is the only memory tier that survives compaction unread —
# it is re-sent with every request. This script prints the FUNDAMENTALS that
# must never be lost: the reasoning framework, the conductor role and doctrine,
# and the laws. It deliberately EXCLUDES state (anchors, lanes, queues): a
# system-prompt anchor would survive compaction as a launch-time snapshot
# confidently describing hours-old state. State lives on disk, always re-read.
#
# Consumed by scripts/claude-conductor.sh, which writes it to the repo tmp/
# directory and launches claude with --append-system-prompt-file.
#
# LOUD-FAILURE LAW: a missing fundamentals file is FATAL, never a silent skip.
# Self-test: --self-test proves both arms.

set -euo pipefail

script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
repository_root="$(git rev-parse --show-toplevel)"

# Skills only — the operative distillations. project.conductor.md (dated
# lesson evidence) stays on disk, one resume-conductor.sh away (user call
# 2026-07-30: skills are what must always be in force).
fundamentals_files=(
  ".claude/skills/ibr/IBR.md"
  ".claude/skills/invariants/SKILL.md"
  ".claude/skills/ivue/SKILL.md"
  ".claude/skills/conductor/SKILL.md"
)

print_file() {
  local relative_path="$1"
  local absolute_path="${repository_root}/${relative_path}"
  if [ ! -f "$absolute_path" ]; then
    echo "conductor-system-prompt: FATAL — fundamentals file missing: ${relative_path}" >&2
    exit 3
  fi
  printf '\n================================================================\n'
  printf '== FUNDAMENTAL: %s\n' "$relative_path"
  printf '================================================================\n\n'
  cat "$absolute_path"
}

# --list-files: the fundamentals list for consumers (resume-conductor.sh
# subtracts these from its closure when the launcher's marker says they are
# already in the system prompt). One owner for the list — never a copy.
if [ "${1:-}" = "--list-files" ]; then
  printf '%s\n' "${fundamentals_files[@]}"
  exit 0
fi

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  full_output="$(bash "$0")"
  # Herestrings, not pipes: grep -q + pipefail turns an EARLY match into a
  # SIGPIPE failure of the writer — the resume-conductor self-test caught
  # this instrument bug punishing success on 2026-07-30.
  for relative_path in "${fundamentals_files[@]}"; do
    grep -qF "FUNDAMENTAL: ${relative_path}" <<<"$full_output" \
      || { echo "FAIL present arm — ${relative_path} missing"; failures=1; }
  done
  grep -qF 'STATE LIVES ON DISK' <<<"$full_output" \
    || { echo "FAIL present arm — state-is-on-disk law missing"; failures=1; }
  sandbox="$(mktemp -d /tmp/conductor-prompt-selftest-XXXXXX)"
  git -C "$repository_root" worktree add --detach "$sandbox/tree" HEAD >/dev/null 2>&1
  rm "$sandbox/tree/.claude/skills/invariants/SKILL.md"
  if (cd "$sandbox/tree" && bash "$script_path" >/dev/null 2>&1); then
    echo "FAIL absent arm — missing skill file did not fail"; failures=1
  fi
  git -C "$repository_root" worktree remove --force "$sandbox/tree" >/dev/null 2>&1 || true
  rm -rf "$sandbox"
  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: fundamentals print; a missing file fails loudly."
    exit 0
  fi
  exit 1
fi

cat <<'PREAMBLE'
YOU ARE THE CONDUCTOR of the Invar fleet. The fundamentals below are part of
your system prompt: they survive compaction and are always in force.

THE USER'S LIVE MESSAGE OUTRANKS EVERYTHING — the anchor, the queue, the
lanes, the momentum of any task. Answer him first, fully and directly, then
resume the work. A question left unanswered while you grind tasks is a
DEFECT, not focus. (Drill 3 evidence, 2026-07-30: a fresh conductor worked
the lanes flawlessly and ignored the user's direct questions.)

STATE LIVES ON DISK, NEVER HERE. Lanes, queues, watcher status, and history
change while you run; this prompt cannot. On resume, after compaction, or
whenever uncertain: read the NEWEST `RESUME ANCHOR` in `project.briefing.md`
(orientation wholesale: `bash scripts/resume-conductor.sh`). Never act on a
remembered anchor when a newer one may exist on disk.
PREAMBLE

for relative_path in "${fundamentals_files[@]}"; do
  print_file "$relative_path"
done

printf '\n================================================================\n'
printf '== END OF FUNDAMENTALS — state is on disk; go read the newest anchor.\n'
printf '================================================================\n'
