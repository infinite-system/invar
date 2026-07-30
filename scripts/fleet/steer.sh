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

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <task-folder-name> <message...>" >&2
  exit 2
fi

task_folder_name="$1"
shift
message="$*"
session_name="invar/${task_folder_name}"

if ! tmux has-session -t "$session_name" 2>/dev/null; then
  echo "steer: REFUSING — no tmux session '$session_name'" >&2
  exit 3
fi

# A distinctive tail fragment of the message, to detect it lingering in the
# composer. Use the last 40 characters — long enough to be unambiguous.
message_tail="${message: -40}"

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
  pane_tail="$(printf '%s' "$pane_text" | tail -8)"
  # A long message can collapse into a "[Pasted Content N chars]" chip: the
  # message tail is then ABSENT from the pane while the text still sits in
  # the composer (2026-07-29, #326 — the tail check passed and the steer sat
  # unsubmitted 13 minutes). A visible chip near the prompt is a composer
  # occupant regardless of the tail check.
  if printf '%s' "$pane_tail" | grep -qF -- '[Pasted Content'; then
    tmux send-keys -t "$session_name" Enter
    continue
  fi
  if ! printf '%s' "$pane_tail" | grep -qF -- "$message_tail"; then
    if printf '%s' "$pane_text" | grep -qE 'esc to interrupt|• Working'; then
      echo "steer: DELIVERED to $session_name — composer cleared, builder processing (attempt $attempt)"
    else
      echo "steer: DELIVERED to $session_name — composer cleared (attempt $attempt)"
    fi
    exit 0
  fi
  # Message still visible near the prompt — stuck in the composer. Mid-turn
  # codex queues on Enter; keep pressing across attempts (8 x 2s outlasts a
  # short compaction) rather than accepting a spinner as delivery.
  tmux send-keys -t "$session_name" Enter
done

echo "steer: FAILED — message still in the composer of $session_name after 5 Enter attempts; attach and submit by hand: tmux attach -t $session_name" >&2
exit 4
