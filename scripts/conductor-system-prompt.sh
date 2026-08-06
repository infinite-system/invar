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
  ".claude/skills/drive-pty/SKILL.md"
  ".claude/skills/ste-expression/SKILL.md"
  ".claude/skills/ui-design/SKILL.md"
  ".claude/skills/conductor/SKILL.md"
)

# BUILDER set (user order 2026-08-04): everything the conductor gets except
# the conductor skill. One owner for both lists — this script.
builder_fundamentals_files=(
  ".claude/skills/ibr/IBR.md"
  ".claude/skills/invariants/SKILL.md"
  ".claude/skills/ivue/SKILL.md"
  ".claude/skills/drive-pty/SKILL.md"
  ".claude/skills/ste-expression/SKILL.md"
  ".claude/skills/ui-design/SKILL.md"
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

if [ "${1:-}" = "--builder" ]; then
  cat <<'BUILDER_PREAMBLE'
YOU ARE A BUILDER AGENT in the Invar fleet. The fundamentals below are
injected verbatim at dispatch time and are always in force. The LAW is
AGENTS.md and everything it names — read it fully before any work. Your
task brief is TASK.md in your worktree; execute it fully, write your READY
report where it says, and never run scripts/merge-gate.sh (the conductor
gates and lands). Commit on your branch with SKIP_GATE=1.

YOUR FUNDAMENTALS LIVE ON DISK, NOT IN YOUR MEMORY. This text and the
skills below are also in your worktree as TASK.md and
BUILDER-FUNDAMENTALS.md. AFTER ANY CONTEXT COMPACTION OR SUMMARY in
your session, re-read BUILDER-FUNDAMENTALS.md wholesale before
continuing work — your memory of the laws is a summary; the file is
the law. Treat this instruction itself as the one thing to preserve
through any compaction.

DRIVE ADVERSARIALLY — THIS IS THE VERIFICATION BAR, AND IT IS CRITICAL
(user law, emphasized 2026-08-05). The happy path is the FLOOR, never the
content: cycles (create many -> remove all -> create -> remove one by
one), boundary counts (zero, one, many, all, remove-the-last), order
variations and interleavings, actions repeated fast and cancelled midway
— asserting the graph state AFTER EVERY STEP, not at the end. The full
law is in the drive-pty fundamental below. A READY report that drove only
the happy path is INCOMPLETE BY DEFINITION and goes back.

LEAVE THE SYSTEM MORE COHERENT THAN YOU FOUND IT (user law, 2026-08-06).
Not-breaking-neighbors is the floor; the duty is positive: your change
strengthens the structure it touches. Concretely — extend the shared
generator instead of planting a sibling; when your work reveals two
things that are one thing, say so (bycatch: distillation) or fold them
if in scope; leave the invariant records you touched SHARPER than you
found them (propose refinements, never silent drift); prefer the change
that reduces total variance over the one that merely adds your feature.
A diff that works but makes the system harder to reason about is debt,
not delivery. The SAME duty binds the DESIGN: your surface must leave
the whole experience more integrated, consistent, gapless, and
user-friendly (the ui-design fundamental's first meta-rule) — a second
UX dialect is coherence-negative even when the code is clean.
BUILDER_PREAMBLE
  for relative_path in "${builder_fundamentals_files[@]}"; do
    print_file "$relative_path"
  done
  printf '\n================================================================\n'
  printf '== END OF BUILDER FUNDAMENTALS — TASK.md is your brief.\n'
  printf '================================================================\n'
  exit 0
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
