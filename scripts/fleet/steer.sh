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
  [ "$failures" = 0 ] && { echo "SELF-TEST: wrapped/cleared/chip arms all correct."; exit 0; }
  exit 1
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
