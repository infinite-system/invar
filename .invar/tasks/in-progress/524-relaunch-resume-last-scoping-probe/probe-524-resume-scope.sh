#!/usr/bin/env bash
# probe-524-resume-scope.sh — does `codex resume --last` pick the most recent
# conversation GLOBALLY, or only among conversations recorded in the current
# working directory?
#
# WHAT THIS FINDS OUT: scripts/fleet/relaunch.sh resumes a dead builder with
# `codex resume --last` from the lane's worktree. If "--last" means "newest
# rollout anywhere", relaunching lane A while lane B ran later would resume
# B's conversation inside A's worktree. This probe proves which it is.
#
# HOW: two scratch directories in /tmp, one codex session each, a unique
# token planted in each conversation. Two arms:
#   CONTROL  — only lane A exists; kill its codex (pid resolved by /proc cwd,
#              never a name pattern); `resume --last` in A's dir must replay
#              A's token. Proves the resume+evidence pipeline can detect the
#              RIGHT session (positive control).
#   CROSSING — lane B launched after A and given the globally newest turn,
#              left ALIVE (like a real fleet neighbor); `resume --last` in
#              A's dir. A's token replayed => cwd-scoped (crossing refuted).
#              B's token replayed => --last is global (crossing proved).
#
# HOW TO RUN:   bash probe-524-resume-scope.sh
#   (needs: codex CLI on PATH, tmux, a logged-in codex account; spends two
#    trivial model turns. Never touches Invar sessions: all tmux sessions are
#    named probe524-*, all kills are /proc-cwd-resolved pids inside the two
#    scratch dirs.)
#
# HOW TO READ ITS OUTPUT: every line is "PROBE: ..." narration; the last two
# lines are "CONTROL: ..." and "VERDICT: ...". VERDICT says either
# "cwd-scoped — crossing REFUTED" or "GLOBAL — crossing PROVED". Evidence
# lines quote the rollout files and the token each pane replayed.
set -euo pipefail

LANE_A=/tmp/probe524-lane-a
LANE_B=/tmp/probe524-lane-b
TOKEN_A=LANE-A-TOKEN-524-$$
TOKEN_B=LANE-B-TOKEN-524-$$
CODEX_FLAGS=(--dangerously-bypass-approvals-and-sandbox -m gpt-5.6-sol -c model_reasoning_effort=low)

narrate() { printf 'PROBE: %s\n' "$*"; }

fail() { printf 'PROBE FAIL: %s\n' "$*" >&2; cleanup; exit 1; }

# wait_pane_has / wait_pane_lacks <session> <literal> [seconds] — condition
# waits on the live pane, never bare sleeps. Default 120s ceiling (model
# turns are the slow part).
wait_pane_has() {
  local session="$1" needle="$2" ceiling="${3:-120}" i
  for i in $(seq 1 "$ceiling"); do
    tmux capture-pane -p -t "$session" 2>/dev/null | grep -qF "$needle" && return 0
    sleep 1
  done
  return 1
}
wait_pane_lacks() {
  local session="$1" needle="$2" i
  for i in $(seq 1 120); do
    tmux capture-pane -p -t "$session" 2>/dev/null | grep -qF "$needle" || return 0
    sleep 1
  done
  return 1
}

# codex_pid_for_cwd <dir> — the codex process whose /proc cwd is exactly the
# scratch dir. NEVER a name-pattern kill (conductor law): identity is the
# working directory we created, plus comm=codex.
codex_pid_for_cwd() {
  local dir="$1" proc cwd comm
  for proc in /proc/[0-9]*; do
    cwd="$(readlink "$proc/cwd" 2>/dev/null || true)"
    [ "$cwd" = "$dir" ] || continue
    comm="$(cat "$proc/comm" 2>/dev/null || true)"
    [ "$comm" = "codex" ] && { printf '%s' "${proc#/proc/}"; return 0; }
  done
  return 1
}

kill_lane_codex() {
  local dir="$1" pid
  pid="$(codex_pid_for_cwd "$dir")" || fail "no codex process with cwd $dir to kill"
  narrate "killing codex pid $pid (cwd-resolved: $dir)"
  kill "$pid"
  for _ in $(seq 1 20); do
    [ -d "/proc/$pid" ] || return 0
    sleep 0.5
  done
  fail "codex pid $pid did not exit"
}

# newest_rollout_for_cwd <dir> — newest rollout file whose session head
# records this cwd (the same identity steer.sh/fleet-watch.sh use).
newest_rollout_for_cwd() {
  local dir="$1" record
  for record in $(ls -1t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -40); do
    if head -c 2048 "$record" 2>/dev/null | grep -qF "\"cwd\":\"$dir\""; then
      printf '%s' "$record"; return 0
    fi
  done
  return 1
}

# launch_lane <session> <dir> — start an interactive codex and wait for its
# banner. The version-update dialog can block the prompt (seen live on this
# probe's first run); it also paints '›', so the ready needle is the banner's
# 'permissions:' line, and the dialog is dismissed with option 3 (skip until
# next version).
launch_lane() {
  local session="$1" dir="$2"
  tmux new-session -d -s "$session" -c "$dir" "codex ${CODEX_FLAGS[*]}"
  if wait_pane_has "$session" 'Press enter to continue' 5; then
    tmux send-keys -t "$session" 3; tmux send-keys -t "$session" Enter
  fi
  wait_pane_has "$session" 'permissions:' || fail "$session never reached the codex banner"
}

# send_turn <session> <token> — one trivial model turn that plants the token.
# The DONE condition is the token painted TWICE (composer echo above the
# prompt + the reply bullet) with the busy marker gone — a single occurrence
# is the message sitting UNSUBMITTED in the composer (the steer.sh lesson,
# reproduced live while building this probe). Enter is retried until the
# turn provably ran.
send_turn() {
  local session="$1" token="$2" attempt pane occurrences
  tmux send-keys -t "$session" "Reply with exactly $token and nothing else."
  for attempt in 1 2 3 4 5; do
    tmux send-keys -t "$session" Enter
    for _ in $(seq 1 30); do
      sleep 2
      pane="$(tmux capture-pane -p -t "$session")"
      occurrences="$(printf '%s' "$pane" | grep -cF "$token" || true)"
      if [ "$occurrences" -ge 2 ] && ! printf '%s' "$pane" | grep -qF 'esc to interrupt'; then
        return 0
      fi
      # Still busy: keep waiting instead of stacking Enters mid-turn.
      printf '%s' "$pane" | grep -qF 'esc to interrupt' && continue
      # Not busy and only the composer copy visible: retry Enter.
      [ "$occurrences" -le 1 ] && break
    done
  done
  fail "$session: turn for $token never completed (composer never cleared or reply never painted)"
}

cleanup() {
  local session pid dir
  for session in probe524-a probe524-b probe524-resume-a probe524-control; do
    tmux kill-session -t "$session" 2>/dev/null || true
  done
  for dir in "$LANE_A" "$LANE_B"; do
    pid="$(codex_pid_for_cwd "$dir" 2>/dev/null || true)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  rm -rf "$LANE_A" "$LANE_B"
}
trap cleanup EXIT

rm -rf "$LANE_A" "$LANE_B"
mkdir -p "$LANE_A" "$LANE_B"
git -C "$LANE_A" init -q; git -C "$LANE_B" init -q

# ---- CONTROL ARM: only lane A exists; the right session must resume ----
narrate "launching lane A in $LANE_A"
launch_lane probe524-a "$LANE_A"
send_turn probe524-a "$TOKEN_A"
rollout_a="$(newest_rollout_for_cwd "$LANE_A")" || fail "no rollout recorded for lane A"
narrate "lane A rollout: $rollout_a"
kill_lane_codex "$LANE_A"
tmux kill-session -t probe524-a 2>/dev/null || true

narrate "CONTROL: resume --last in lane A's dir (A is the only/newest session)"
tmux new-session -d -s probe524-control -c "$LANE_A" "codex ${CODEX_FLAGS[*]} resume --last"
wait_pane_has probe524-control '›' || fail "control resume never reached a prompt"
if wait_pane_has probe524-control "$TOKEN_A"; then
  control_result="CONTROL: PASS — resume --last in lane A replayed $TOKEN_A (right session, evidence pipeline works)"
else
  control_result="CONTROL: FAIL — resumed pane never replayed $TOKEN_A"
fi
narrate "$control_result"
kill_lane_codex "$LANE_A"
tmux kill-session -t probe524-control 2>/dev/null || true

# ---- CROSSING ARM: lane B newer and ALIVE; whose conversation does A get? --
narrate "launching lane B in $LANE_B (after A; B's rollout is globally newest)"
launch_lane probe524-b "$LANE_B"
send_turn probe524-b "$TOKEN_B"
rollout_b="$(newest_rollout_for_cwd "$LANE_B")" || fail "no rollout recorded for lane B"
narrate "lane B rollout: $rollout_b"
# `|| true`: ls takes SIGPIPE when head exits first; under set -e -o pipefail
# that silently killed the whole probe here (seen live, run 2).
newest_global="$(ls -1t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -1 || true)"
narrate "globally newest rollout now: $newest_global"
[ "$newest_global" = "$rollout_b" ] || narrate "NOTE: globally newest is not lane B's — ordering premise weakened, read verdict with care"

narrate "CROSSING TEST: resume --last in lane A's dir while lane B is alive and newest"
tmux new-session -d -s probe524-resume-a -c "$LANE_A" "codex ${CODEX_FLAGS[*]} resume --last"
wait_pane_has probe524-resume-a '›' || fail "crossing resume never reached a prompt"
sleep 3   # allow history replay to finish painting before judging tokens
pane="$(tmux capture-pane -p -t probe524-resume-a)"
has_a=no; has_b=no
printf '%s' "$pane" | grep -qF "$TOKEN_A" && has_a=yes
printf '%s' "$pane" | grep -qF "$TOKEN_B" && has_b=yes
narrate "resumed pane in lane A: has TOKEN_A=$has_a has TOKEN_B=$has_b"

echo "$control_result"
if [ "$has_b" = yes ]; then
  echo "VERDICT: --last is GLOBAL — crossing PROVED (lane A resumed lane B's conversation: $rollout_b)"
elif [ "$has_a" = yes ]; then
  echo "VERDICT: --last is cwd-scoped — crossing REFUTED (lane A resumed its own conversation despite B being globally newest)"
else
  echo "VERDICT: INCONCLUSIVE — resumed pane replayed neither token; inspect manually"
  printf '%s\n' "$pane" | tail -30
fi
