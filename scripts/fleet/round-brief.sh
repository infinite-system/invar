#!/usr/bin/env bash
# round-brief.sh — file a follow-up round for an in-progress task, MECHANICALLY.
#
# Round 1 is dispatch.sh's act. Every later round is this script's act, for the
# same reason: a steer that lives only in a tmux message is a record nobody can
# replay, and a brief file backfilled AFTER the builder answers inverts causal
# order — the lens then shows "building" for a task that is READY (that exact
# one-second race happened on #35, 2026-07-29 03:58:04 vs 03:58:05).
#
#   scripts/fleet/round-brief.sh <task-folder-name> <brief-file>
#
# What it does, in order:
#   1. guards: the folder is in-progress; the brief carries the two
#      invariant-dialogue sections and resolving document links (same law as
#      dispatch).
#   2. copies the brief in as brief-<number>-<round>-<original-name>.md.
#   3. stamps meta.json: round + roundBriefedAtMs, AT FILING TIME. The lens
#      reads this stamp — a report older than it is an unanswered round
#      (building round N); a report newer than it is READY. A later backfill
#      cannot override a delivered report, because the stamp is the filing
#      moment, not a file mtime.
#   4. prints the tmux send reminder. FILE FIRST, STEER SECOND — the steer
#      references a record that already exists.

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"

if [ $# -ne 2 ]; then
  echo "usage: $0 <task-folder-name> <brief-file>" >&2
  exit 2
fi

task_folder_name="$1"
brief_file="$2"
task_folder="${repository_root}/.invar/tasks/in-progress/${task_folder_name}"

[ -d "$task_folder" ] || { echo "round-brief: REFUSING — not in-progress: ${task_folder}" >&2; exit 2; }
[ -f "$brief_file" ] || { echo "round-brief: brief not found: ${brief_file}" >&2; exit 2; }
grep -q "^## Invariants in scope" "$brief_file" || {
  echo "round-brief: REFUSING — the brief has no '## Invariants in scope' section." >&2; exit 2; }
grep -q "^## Bycatch expected" "$brief_file" || {
  echo "round-brief: REFUSING — the brief has no '## Bycatch expected' section." >&2; exit 2; }
if ! PATH="$HOME/.bun/bin:$PATH" bun "${repository_root}/scripts/tasks/lint-task-links.ts" \
     --base-directory "$task_folder" "$brief_file"; then
  echo "round-brief: REFUSING — the brief has dead or bare document references." >&2
  echo "  Fix them, or run: bun scripts/tasks/lint-task-links.ts --fix --base-directory ${task_folder} ${brief_file}" >&2
  exit 2
fi

task_number="${task_folder_name%%-*}"
existing_briefs="$(ls "$task_folder"/brief-* 2>/dev/null | wc -l | tr -d ' ')"
round=$((existing_briefs + 1))
original_name="$(basename "$brief_file" .md)"
# Strip any leading brief-/number prefix the caller already used.
original_name="${original_name#brief-}"
original_name="${original_name#"${task_number}"-}"
destination="${task_folder}/brief-${task_number}-${round}-${original_name}.md"

cp "$brief_file" "$destination"

python3 - "$task_folder/meta.json" "$round" <<'PYTHON'
import json, sys, time
meta_path, round_number = sys.argv[1], int(sys.argv[2])
try:
    with open(meta_path) as handle:
        meta = json.load(handle)
except (FileNotFoundError, json.JSONDecodeError):
    meta = {}
meta["round"] = round_number
meta["roundBriefedAtMs"] = int(time.time() * 1000)
with open(meta_path, "w") as handle:
    json.dump(meta, handle, indent=2)
    handle.write("\n")
PYTHON

echo "round-brief: FILED round ${round} for #${task_number} -> ${destination}"
echo "  steer next (the record now exists):"
echo "    tmux send-keys -t invar/${task_folder_name} \"Conductor: round ${round} brief filed at ${destination#"${repository_root}"/} — read it and act.\" Enter"

if [ "${1:-}" != "--self-test" ]; then :; fi
