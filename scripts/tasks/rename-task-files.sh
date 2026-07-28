#!/usr/bin/env bash
# Give every task file a self-identifying name.
#
# WHY. The first layout used `task.md` / `brief-1-<date>.md` inside each folder, so 61 tasks produced 61
# files called `task.md`. That is unreadable exactly where a name matters most: editor tab bars, Quick
# Open, grep output and any diff summary all showed the same word 61 times, and the folder was the only
# thing carrying the identity. A file should say what it is when opened alone.
#
# task-<number>-<full-name>.md      the outline
# brief-<seq>-<number>-<full-name>.md   each brief; SEQ FIRST so briefs sort in send order, which is the
#                                       load-bearing property — a follow-up brief is a new file and the
#                                       order in which an agent received them is what makes its decisions
#                                       readable later.
# report-<number>-<full-name>.md    the agent's READY report
# summary-<number>-<full-name>.md   what actually happened, after landing
#
# Dates move INTO the files rather than into the names: a name carrying both a date and a full task name
# is too long to read at a glance, and the send ORDER is what the filename must encode.
#
# Uses `git mv` for tracked files so history follows. Idempotent: already-renamed files are skipped.
set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"
tasks_root=".invar/tasks"
dry_run=0
[ "${1:-}" = "--dry-run" ] && dry_run=1

renamed=0
skipped=0

move_file() {
  local source_path="$1" target_path="$2"
  [ "$source_path" = "$target_path" ] && { skipped=$((skipped + 1)); return; }
  [ -e "$target_path" ] && { skipped=$((skipped + 1)); return; }
  echo "  $(basename "$source_path") -> $(basename "$target_path")"
  if [ "$dry_run" = 0 ]; then
    if git ls-files --error-unmatch "$source_path" >/dev/null 2>&1; then
      git mv "$source_path" "$target_path"
    else
      mv "$source_path" "$target_path"
    fi
  fi
  renamed=$((renamed + 1))
}

for state_directory in todo live done retired; do
  [ -d "$tasks_root/$state_directory" ] || continue
  for task_folder in "$tasks_root/$state_directory"/*/; do
    [ -d "$task_folder" ] || continue
    folder_name="$(basename "$task_folder")"
    # `204-drive-tool-step-model-and-targeting` -> number 204, rest as the full name.
    task_identity="$folder_name"

    [ -f "${task_folder}task.md" ] && \
      move_file "${task_folder}task.md" "${task_folder}task-${task_identity}.md"
    [ -f "${task_folder}report.md" ] && \
      move_file "${task_folder}report.md" "${task_folder}report-${task_identity}.md"
    [ -f "${task_folder}summary.md" ] && \
      move_file "${task_folder}summary.md" "${task_folder}summary-${task_identity}.md"

    # brief-1-2026-07-28.md -> brief-1-204-drive-tool-step-model-and-targeting.md
    for brief_path in "${task_folder}"brief-*.md; do
      [ -f "$brief_path" ] || continue
      brief_base="$(basename "$brief_path")"
      case "$brief_base" in
        *"$task_identity"*) skipped=$((skipped + 1)); continue ;;
      esac
      brief_sequence="$(printf '%s' "$brief_base" | sed -E 's/^brief-([0-9]+).*/\1/')"
      case "$brief_sequence" in ''|*[!0-9]*) brief_sequence=1 ;; esac
      move_file "$brief_path" "${task_folder}brief-${brief_sequence}-${task_identity}.md"
    done
  done
done

echo ""
echo "$([ "$dry_run" = 1 ] && echo 'DRY RUN — ')renamed $renamed, skipped $skipped"
