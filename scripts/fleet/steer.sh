#!/usr/bin/env bash
# steer.sh — deliver a conductor message to a builder tmux session, VERIFIED.
#
# WHY: tmux send-keys "msg" Enter sometimes leaves the message sitting in the
# codex composer unsubmitted (2026-07-29: #289 lost one steer, #281 sat idle
# ~25 minutes on a stuck round-2 notification). A steer that is not verified
# delivered is a steer that silently did not happen — the same class as an
# unread gate verdict. This script sends, then PROVES the composer cleared,
# retrying Enter up to 5 times before failing loudly.
#
# Usage: scripts/fleet/steer.sh <task-folder-name> <message...>
set -euo pipefail

if [ "${1:-}" != "--self-test" ] && [ "$#" -lt 2 ]; then
  echo "usage: $0 <task-folder-name> <message...>" >&2
  exit 2
fi

# Composer occupancy is judged on WHITESPACE-NORMALIZED text: the codex
# composer WRAPS long messages, splitting any fixed substring across a line
# break (2026-07-30, #413: a wrapped steer defeated the raw tail grep and
# steer declared DELIVERED while the message sat in the composer — the user
# caught it, not the script). Normalize both sides before comparing.
normalize() { tr '\n' ' ' | tr -s ' '; }

# The composer region is the pane text from the LAST '›' prompt line onward —
# submitted messages echo HIGHER in the transcript and must not count.
composer_region() { awk '/^›/{n=NR} {line[NR]=$0} END{for(i=n;i<=NR;i++) print line[i]}'; }

# occupied <pane_text> <normalized_tail> -> 0 if the composer still holds the
# message (wrapped or chip-collapsed) or shows the queue hint for pending text.
composer_occupied() {
  local region_normalized
  region_normalized="$(printf '%s' "$1" | composer_region | normalize)"
  case "$region_normalized" in
    *"$2"*) return 0 ;;
    *'[Pasted Content'*) return 0 ;;
    *'tab to queue message'*) return 0 ;;
  esac
  return 1
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  wrapped_pane='• Working (1m • esc to interrupt)

› Conductor: read the framework and map each rank component to the
  axiom it operationalizes.

  tab to queue message     25% context left'
  cleared_pane='    read the framework and map each rank component to the
    axiom it operationalizes.

› Write tests for @filename

  gpt-5.6-sol high · ~/dev/invar'
  tail_normalized="$(printf '%s' "component to the axiom it operationalizes." | normalize)"
  # PRESENT arm: a wrapped composer message must read OCCUPIED.
  composer_occupied "$wrapped_pane" "$tail_normalized" || { echo "FAIL present arm (wrapped message not seen)"; failures=1; }
  # ABSENT arm: a cleared composer (message echoed above the prompt) must read CLEAR.
  if composer_occupied "$cleared_pane" "$tail_normalized"; then echo "FAIL absent arm (echo above prompt counted as composer)"; failures=1; fi
  # CHIP arm: a pasted-content chip is an occupant regardless of tail.
  composer_occupied '› [Pasted Content 812 chars]' "$tail_normalized" || { echo "FAIL chip arm"; failures=1; }
  # RESURRECTION-GUARD arm: a dead session on a NON-in-progress task must
  # refuse (exit 3), never relaunch. (The auto-restore present arm needs a
  # live dead lane and is exercised operationally, not here.)
  if bash "$0" "no-such-task-selftest-$$" "test message" 2>/dev/null; then
    echo "FAIL resurrection-guard arm (steer to a closed lane did not refuse)"; failures=1
  fi
  [ "$failures" = 0 ] && { echo "SELF-TEST: wrapped/cleared/chip/resurrection-guard arms all correct."; exit 0; }
  exit 1
fi

task_folder_name="$1"
shift
message="$*"
session_name="invar/${task_folder_name}"

if ! tmux has-session -t "$session_name" 2>/dev/null; then
  # AUTO-RESTORE (user design, 2026-07-30): a steer to a dead IN-PROGRESS lane
  # resumes the builder's own conversation first (relaunch.sh: codex resume
  # --last / claude --continue), then delivers. The steer ritual subsumes
  # recovery, so nothing depends on the conductor remembering relaunch.sh.
  # ONLY in-progress: steering must never resurrect a landed/retired lane.
  if [ -d ".invar/tasks/in-progress/${task_folder_name}" ]; then
    echo "steer: session '${session_name}' is gone and the task is in-progress — auto-restoring its conversation"
    bash "$(dirname "$0")/relaunch.sh" "$task_folder_name" || {
      echo "steer: FAILED — auto-restore failed; relaunch by hand" >&2
      exit 3
    }
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      sleep 2
      restored_pane="$(tmux capture-pane -p -t "$session_name" 2>/dev/null || true)"
      if printf '%s' "$restored_pane" | grep -qE '^›|for shortcuts|for agents'; then
        break
      fi
    done
  else
    echo "steer: REFUSING — no tmux session '$session_name' and the task is not in-progress (never resurrect a closed lane)" >&2
    exit 3
  fi
fi

task_directory=""
for state_directory in in-progress active completed; do
  candidate=".invar/tasks/${state_directory}/${task_folder_name}"
  [ -d "$candidate" ] && { task_directory="$candidate"; break; }
done
[ -n "$task_directory" ] || task_directory="/tmp"

# The builder's own session record: codex rollout matched by session-meta cwd
# (identity, never content grep — the #280/#313 lesson), or the claude store
# dir named by the worktree path. Empty when not yet identifiable.
find_session_record() {
  local cwd record_file
  cwd="$(tmux display-message -t "$session_name" -p '#{pane_current_path}' 2>/dev/null)"
  [ -n "$cwd" ] || return 0
  for record_file in $(ls -1t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -40); do
    if head -c 2048 "$record_file" 2>/dev/null | grep -qF "\"cwd\":\"$cwd\""; then
      printf '%s' "$record_file"; return 0
    fi
  done
  record_file="$(ls -t "$HOME"/.claude/projects/*"${task_folder_name}"*/*.jsonl 2>/dev/null | head -1)"
  [ -n "$record_file" ] && printf '%s' "$record_file"
  return 0
}

# A distinctive tail fragment of the message, to detect it lingering in the
# composer. Use the last 40 characters — long enough to be unambiguous —
# whitespace-normalized so composer line-wrapping cannot hide it.
message_tail="$(printf '%s' "${message: -40}" | normalize)"

tmux send-keys -t "$session_name" "$message"
tmux send-keys -t "$session_name" Enter

for attempt in 1 2 3 4 5 6 7 8; do
  sleep 2
  pane_text="$(tmux capture-pane -p -t "$session_name")"
  # THE ONLY acceptance: the composer area near the prompt no longer shows
  # the message. A spinner is NOT proof — 2026-07-29 a COMPACTION spinner
  # matched while the steer sat composed and unsubmitted for 14 minutes
  # (#314). Codex echoes submitted messages higher in the transcript, so
  # only the last lines near the prompt count as "still in the composer".
  # Occupancy is judged on the composer REGION (last '›' onward), whitespace-
  # normalized — this catches wrapped messages, "[Pasted Content" chips
  # (2026-07-29, #326: 13 minutes unsubmitted), and the "tab to queue message"
  # pending hint, in one predicate with a self-test (--self-test).
  if ! composer_occupied "$pane_text" "$message_tail"; then
    # Composer clear is NECESSARY, not SUFFICIENT: the pane is a rendering,
    # and it has lied four recorded times. The PROOF of landing is the
    # builder's own session record (codex rollout / claude store jsonl) —
    # the producer's append-only file, immune to wrapping and redraws.
    record_fragment="$(printf '%s' "$message" | tr -c 'a-zA-Z0-9 ' ' ' | tr -s ' ')"
    record_fragment="${record_fragment: -30}"
    session_record="$(find_session_record)"
    for confirm_attempt in 1 2 3 4 5; do
      if [ -n "$session_record" ] && grep -qF -- "$record_fragment" "$session_record" 2>/dev/null; then
        printf '%s LANDED %s\n' "$(date '+%F %T')" "$message" >> "${task_directory}/steers.log"
        echo "steer: LANDED on $session_name — confirmed in the builder's own session record (${session_record##*/})"
        exit 0
      fi
      sleep 2
      [ -n "$session_record" ] || session_record="$(find_session_record)"
    done
    # Mid-turn steers are QUEUED by the terminal and only enter the record
    # when the builder picks them up — that can be minutes. Hand the pending
    # confirmation to fleet-watch: it confirms (and logs LANDED) or raises
    # STEER_LOST. NOTHING is appended to steers.log for an unconfirmed steer —
    # a log of attempts would be a deceptive metric.
    pending_marker="/tmp/steer-pending-$(printf '%s' "$task_folder_name" | tr -c 'a-zA-Z0-9-' '-')-$(date +%s)"
    {
      printf 'task_directory=%s\n' "$task_directory"
      printf 'session_name=%s\n' "$session_name"
      printf 'fragment=%s\n' "$record_fragment"
      printf 'message=%s\n' "$(printf '%s' "$message" | normalize)"
    } > "$pending_marker"
    echo "steer: QUEUED on $session_name — composer clear but not yet in the session record; fleet-watch will confirm LANDED or raise STEER_LOST (marker: $pending_marker)"
    exit 0
  fi
  # Message still visible near the prompt — stuck in the composer. Mid-turn
  # codex queues on Enter; keep pressing across attempts (8 x 2s outlasts a
  # short compaction) rather than accepting a spinner as delivery.
  tmux send-keys -t "$session_name" Enter
done

echo "steer: FAILED — message still in the composer of $session_name after 5 Enter attempts; attach and submit by hand: tmux attach -t $session_name" >&2
exit 4
