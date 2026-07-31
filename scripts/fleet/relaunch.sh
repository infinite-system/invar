#!/usr/bin/env bash
# relaunch.sh <task-folder-name> — relaunch a dead/killed builder IN ITS OWN
# CONVERSATION, not from scratch.
#
# WHY: killing a wedged builder and relaunching bare loses the session's whole
# context — the relaunched agent re-reads everything and repeats work. Both
# engines can resume their most recent conversation from the working
# directory: codex with `resume --last`, claude with `--continue`. The #393
# relaunch (2026-07-30) was done bare by hand and also forgot the agent-tmux
# ready/busy markers, which broke land.sh's idle detection — this script does
# both correctly.
#
# The engine/model/effort come from the task's meta.json — the assignment is
# the task file's, not the command line's.
#
# Usage:      bash scripts/fleet/relaunch.sh <task-folder-name>
# Dry run:    DRY_RUN=1 bash scripts/fleet/relaunch.sh <task-folder-name>
# Self-test:  bash scripts/fleet/relaunch.sh --self-test
#
# REFUSES while the tmux session still exists: stopping a builder is a
# destructive act the conductor performs deliberately (cwd-resolved pid,
# never a name pattern) — this script only ever starts.
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"

read_meta_field() {
  # read_meta_field <meta-path> <field> — first string value for the key.
  sed -n 's/.*"'"$2"'": *"\([^"]*\)".*/\1/p' "$1" | head -1
}

build_resume_command() {
  # build_resume_command <engine> <model> <effort> — echoes the launch command.
  local engine="$1" model="$2" effort="$3"
  case "$engine" in
    codex)
      printf 'codex --dangerously-bypass-approvals-and-sandbox -m gpt-%s -c model_reasoning_effort=%s resume --last' \
        "$model" "$effort"
      ;;
    claude)
      printf 'claude --dangerously-skip-permissions --model %s --effort %s --continue' \
        "$model" "$effort"
      ;;
    *)
      return 1
      ;;
  esac
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  meta_fixture="$(mktemp /tmp/relaunch-selftest-meta-XXXXXX.json)"
  printf '{"engine": "codex", "model": "5.6-sol", "effort": "high"}\n' > "$meta_fixture"
  # PRESENT arm: meta fields resolve and the codex command carries resume --last.
  engine="$(read_meta_field "$meta_fixture" engine)"
  [ "$engine" = "codex" ] || { echo "FAIL meta read arm"; failures=1; }
  command_line="$(build_resume_command codex 5.6-sol high)"
  case "$command_line" in
    *'resume --last') ;;
    *) echo "FAIL codex resume arm: $command_line"; failures=1 ;;
  esac
  # claude arm: --continue present.
  command_line="$(build_resume_command claude opus medium)"
  case "$command_line" in
    *'--continue') ;;
    *) echo "FAIL claude continue arm: $command_line"; failures=1 ;;
  esac
  # ABSENT arm: an unknown engine must fail, not silently launch something.
  if build_resume_command user any high >/dev/null 2>&1; then
    echo "FAIL unknown-engine arm"; failures=1
  fi
  rm -f "$meta_fixture"
  [ "$failures" = 0 ] && { echo "SELF-TEST: meta read, both resume forms, unknown-engine refusal."; exit 0; }
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <task-folder-name>" >&2
  exit 2
fi

task_folder_name="$1"
session_name="invar/${task_folder_name}"
task_directory=""
relaunch_states="in-progress active"
# Closed lanes revive only deliberately (steer.sh passes STEER_REVIVE=1).
[ "${STEER_REVIVE:-0}" = "1" ] && relaunch_states="in-progress active completed retired"
for state_directory in $relaunch_states; do
  candidate="${repository_root}/.invar/tasks/${state_directory}/${task_folder_name}"
  [ -d "$candidate" ] && { task_directory="$candidate"; break; }
done
[ -n "$task_directory" ] || { echo "relaunch: FAIL — no task folder for '${task_folder_name}'" >&2; exit 2; }
meta_path="${task_directory}/meta.json"
[ -f "$meta_path" ] || { echo "relaunch: FAIL — no meta.json in ${task_directory}" >&2; exit 2; }

if tmux has-session -t "$session_name" 2>/dev/null; then
  echo "relaunch: REFUSING — session '${session_name}' still exists. Stop the builder deliberately first (cwd-resolved pid, never a name pattern)." >&2
  exit 3
fi

engine="$(read_meta_field "$meta_path" engine)"
model="$(read_meta_field "$meta_path" model)"
effort="$(read_meta_field "$meta_path" effort)"
worktree="$(read_meta_field "$meta_path" worktree)"
worktree_path="${repository_root}/${worktree#./}"
[ -d "$worktree_path" ] || { echo "relaunch: FAIL — worktree missing: ${worktree_path}" >&2; exit 2; }

launch_command="$(build_resume_command "$engine" "$model" "$effort")" \
  || { echo "relaunch: FAIL — engine '${engine}' has no resume form" >&2; exit 2; }

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "relaunch DRY_RUN: tmux new-session -d -s '${session_name}' -c '${worktree_path}' \"${launch_command}\""
  exit 0
fi

tmux new-session -d -s "$session_name" -c "$worktree_path" "$launch_command"
# The agent-tmux ready/busy markers land.sh's idle detection needs — the
# hand-relaunch of #393 forgot these and land.sh read 'starting' forever.
case "$engine" in
  codex)  tmux set-option -t "$session_name" @ready '^›' ; tmux set-option -t "$session_name" @busy 'esc to interrupt' ;;
  claude) tmux set-option -t "$session_name" @ready 'for shortcuts|for agents' ; tmux set-option -t "$session_name" @busy 'esc to interrupt' ;;
esac
tmux set-option -t "$session_name" @profile "$engine"

echo "relaunch: RESUMED #${task_folder_name} (${engine} ${model} ${effort}) in its prior conversation"
echo "  attach: tmux attach -t ${session_name}"
echo "  steer the next round brief with scripts/fleet/steer.sh once the session is at its prompt"
