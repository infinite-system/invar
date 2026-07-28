#!/usr/bin/env bash
# agent-tmux.sh — a reliable driver for interactive CLI agents (claude/codex) in tmux.
#
# WHY THIS EXISTS: driving an interactive agent through tmux send-keys is fragile in
# exactly four ways, and every caller re-derives (and re-breaks) the same workarounds:
#   1. send-keys races — text + Enter in one call lands Enter mid-paste → split them.
#   2. "not at the prompt yet" — startup + approval dialogs (MCP / trust / bypass) must
#      be dismissed before the session can take input → blank-pane failures otherwise.
#   3. "is the turn done?" — you must poll a busy indicator, not guess with a fixed sleep.
#   4. reading — capture a BOUNDED window, not the whole scrollback.
# This script encapsulates all four so callers (a human, the director, a test) just call
# verbs. It does NOT remove tmux's architectural limits (a pty is still required; a live
# session is single-owner) — only the drive-flakiness.
#
# Interactive sessions bill the INTERACTIVE quota bucket (not the Agent-SDK pool, which is
# `claude -p` only) — which is the bucket we want. claude profile launches PERSISTED +
# promoted so the session survives a tmux/host death and can be `--resume`d.
#
# Verbs:
#   launch <name> [--cwd D] [--timeout S] [--profile claude|codex] [--ready RE] [--busy RE] -- <cmd...>
#   send       <name> "<msg>"          split-send + Enter, nudge if it didn't submit
#   wait       <name> [cap_seconds]    block until idle (default 300); prints idle|timeout|dead
#   send-wait  <name> "<msg>" [cap]    send, wait for idle, then peek the reply
#   peek       <name> [lines]          bounded capture-pane (default 40), plain text
#   status     <name>                  PANE-ONLY: idle | busy | starting | dead
#   state      <name> [window]         TRUST THIS: pane AND rollout must agree on idle
#   rollout    <name> [window]         producer-side growth: grew | quiet | unknown
#   kill       <name>
#   list                               logical names of live agent-tmux sessions
#
# Sessions are namespaced `at_<name>` (override with $AGENT_TMUX_PREFIX). Per-session the
# ready/busy regexes are stored as tmux options so every verb is profile-aware.
set -uo pipefail

SP="${AGENT_TMUX_PREFIX:-at_}"
DEFAULT_TIMEOUT="${AGENT_TMUX_TIMEOUT:-60}"
DEFAULT_CAP="${AGENT_TMUX_CAP:-300}"

_sess()  { printf '%s%s' "$SP" "$1"; }
_alive() { tmux has-session -t "$(_sess "$1")" 2>/dev/null; }
_pane()  { tmux capture-pane -t "$(_sess "$1")" -p 2>/dev/null; }
_get()   { tmux show-option -t "$(_sess "$1")" -qv "@$2" 2>/dev/null; }

# Profile: sets READY_RE (at an input prompt), BUSY_RE (a turn is running), LAUNCH_ENV.
# --ready/--busy overrides win. claude is verified; codex is [UNVERIFIED] — tune when tested.
_profile() {
  case "$1" in
    claude)
      # idle footer is "? for shortcuts · ← for agents", but --dangerously-skip-permissions
      # replaces "? for shortcuts" with "⏵⏵ bypass permissions on …" — both keep "for agents".
      READY_RE='for shortcuts|for agents'
      BUSY_RE='esc to interrupt'
      LAUNCH_ENV='env -u CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1 '
      ;;
    codex)
      # VERIFIED 2026-07-28 against a live interactive codex (gpt-5.6-sol) in tui-editor.
      # READY: the composer prompt sits at column 0 as a bare '>' glyph. NOTE it is always
      # present (codex keeps a hint in the composer), so READY is NOT discriminating on its
      # own — idle here means "matches READY and does NOT match BUSY", which works only
      # because cmd_status/cmd_wait test BUSY first. Get BUSY right or both lie.
      # Do NOT build READY on the 'gpt-<ver>-sol high . ~/path' status line either: it is
      # permanently visible too, and with it as READY the verbs can only ever answer 'idle'
      # (measured — that exact mistake reported a mid-turn session as idle).
      # BUSY: codex has MORE THAN ONE busy footer — measured both:
      #   '. Working (4s . esc to interrupt)'
      #   '. Waiting for background terminal (58s . esc to interrupt) . 1 background terminal'
      # so key on the substring COMMON to every variant, 'esc to interrupt'. A narrower
      # 'Working \(' matched only the first and reported a session blocked 58s on a background
      # terminal as IDLE — `wait` would then return on an unfinished turn. When in doubt widen
      # the busy alternation: a false 'busy' costs a poll, a false 'idle' corrupts a result.
      # NOTE: the literal glyph, NOT a \xNN escape — grep -E does not interpret those, and
      # writing '^\xe2\x80\xba' here made `launch` time out for 90s against a session that
      # was sitting at a perfectly good prompt.
      READY_RE='^›'
      BUSY_RE='esc to interrupt'
      LAUNCH_ENV=''
      ;;
    *)
      READY_RE='.'
      BUSY_RE=''
      LAUNCH_ENV=''
      ;;
  esac
  [ -n "${READY_OVERRIDE:-}" ] && READY_RE="$READY_OVERRIDE"
  [ -n "${BUSY_OVERRIDE:-}" ]  && BUSY_RE="$BUSY_OVERRIDE"
}

# Dismiss claude's startup/approval dialogs. Returns 0 if it acted on one.
_dismiss() {
  local s p; s="$(_sess "$1")"; p="$(_pane "$1")"
  if printf '%s' "$p" | grep -qiE 'New MCP server found'; then
    tmux send-keys -t "$s" Down; sleep 0.2; tmux send-keys -t "$s" Down; sleep 0.2
    tmux send-keys -t "$s" Enter; return 0           # option 3: continue without
  fi
  # NB: match the dialog's own words ("accept the risk"/"Yes, I accept"), NOT the bare
  # "bypass permissions" string — that also appears in the persistent idle footer
  # ("⏵⏵ bypass permissions on …"), which would make _dismiss fire forever.
  if printf '%s' "$p" | grep -qiE 'Do you trust|accept the risk|Yes, I accept'; then
    tmux send-keys -t "$s" Enter; return 0
  fi
  return 1
}

cmd_launch() {
  local name="${1:?launch: need a name}"; shift
  local cwd="" timeout="$DEFAULT_TIMEOUT" profile="" p=""
  READY_OVERRIDE=""; BUSY_OVERRIDE=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --cwd) cwd="$2"; shift 2;;
      --timeout) timeout="$2"; shift 2;;
      --profile) profile="$2"; shift 2;;
      --ready) READY_OVERRIDE="$2"; shift 2;;
      --busy) BUSY_OVERRIDE="$2"; shift 2;;
      --) shift; break;;
      *) break;;
    esac
  done
  [ $# -gt 0 ] || { echo "launch: missing command (use: launch <name> [flags] -- <cmd...>)" >&2; return 2; }
  [ -n "$profile" ] || profile="$(basename "$1")"
  _profile "$profile"
  local s; s="$(_sess "$name")"
  tmux kill-session -t "$s" 2>/dev/null
  local q="" a; for a in "$@"; do q+=" $(printf '%q' "$a")"; done
  if [ -n "$cwd" ]; then
    tmux new-session -d -s "$s" -x 220 -y 50 -c "$cwd" "${LAUNCH_ENV}${q}" || { echo "launch: tmux new-session failed" >&2; return 1; }
  else
    tmux new-session -d -s "$s" -x 220 -y 50 "${LAUNCH_ENV}${q}" || { echo "launch: tmux new-session failed" >&2; return 1; }
  fi
  tmux set-option -t "$s" @ready "$READY_RE" 2>/dev/null
  tmux set-option -t "$s" @busy  "$BUSY_RE"  2>/dev/null
  tmux set-option -t "$s" @profile "$profile" 2>/dev/null
  local i
  for ((i=0; i<timeout; i++)); do
    _alive "$name" || { echo "launch: session died during startup" >&2; return 1; }
    if _dismiss "$name"; then sleep 1.2; continue; fi
    p="$(_pane "$name")"
    if printf '%s' "$p" | grep -qE "$READY_RE" \
       && { [ -z "$BUSY_RE" ] || ! printf '%s' "$p" | grep -qE "$BUSY_RE"; }; then
      echo "ready"; return 0
    fi
    sleep 1
  done
  echo "launch: timed out after ${timeout}s waiting for the prompt" >&2; return 1
}

# Confirmation is the hard part. The obvious check — "did the pane go busy?" — is a check with
# ONE REACHABLE OUTCOME whenever the session was ALREADY busy: it passes trivially and cannot
# distinguish "my message started a turn" from "a turn was already running." That false positive
# lost a queued follow-up on 2026-07-28: send reported success while the text sat in the composer
# as `[Pasted Content 1022 chars]`.
#
# So confirmation is the COMPOSER EMPTYING, which is true only if the input was consumed, and is
# meaningful whether or not a turn was already in flight. A large paste renders as
# `[Pasted Content N chars]`; while that marker is present nothing has been submitted.
# ...and THAT detector had the same disease it was written to cure. It recognised pending text ONLY
# as the `[Pasted Content N chars]` placeholder, so against text delivered by `send-keys -l` — which
# renders as ORDINARY VISIBLE COMPOSER LINES, no placeholder anywhere — it found nothing, reported
# "not pending" on the first poll, and `send` printed `submitted` while ~1900 characters sat in the
# composer. Caught by the human, who saw the text still sitting there. Pending text has (at least)
# TWO renderings and the check knew one: partial coverage presenting as total.
#
# THE OTHER HALF, and the reason no number of Enter nudges could have helped: while a codex turn is
# in flight the composer footer reads `tab to queue message`, and in that state **Enter is a no-op —
# TAB is what queues**. Ten Enters against a busy session change nothing.
_queue_affordance() {
  _pane "$1" | grep -qF 'tab to queue message'
}

# A probe taken from the START of the message. The composer's first line begins at column 0, so a
# short prefix is never split by wrapping — which a probe taken from the middle would be.
_send_probe() {
  printf '%s' "$1" | head -n 1 | head -c 30
}

cmd_send() {
  local name="${1:?send: need a name}" msg="${2?send: need a message}"
  _alive "$name" || { echo "send: no session '$name'" >&2; return 1; }
  local s i probe queued_before queued_now; s="$(_sess "$name")"
  probe="$(_send_probe "$msg")"
  # Count the queued markers BEFORE sending: an increase is positive proof of acceptance, whereas
  # the mere PRESENCE of a marker only proves some earlier message was queued.
  queued_before="$(_pane "$name" | grep -cF '↳' || true)"
  tmux send-keys -t "$s" -l -- "$msg"   # -l: literal text, no key-name interpretation
  sleep 0.5
  for ((i=0; i<12; i++)); do
    # Which key SUBMITS depends on whether a turn is in flight. Ask every iteration: the turn can
    # end (or begin) while we are nudging.
    if _queue_affordance "$name"; then
      tmux send-keys -t "$s" Tab
    else
      tmux send-keys -t "$s" Enter
    fi
    sleep 0.9
    queued_now="$(_pane "$name" | grep -cF '↳' || true)"
    # Two POSITIVE outcomes, matching the two things that can happen to consumed input:
    #   queued    — a new `↳` marker appeared: accepted, will run after the current turn
    #   submitted — the probe text is gone from the pane: consumed into a turn
    if [ "$queued_now" -gt "$queued_before" ]; then echo queued; return 0; fi
    if ! _pane "$name" | grep -qF -- "$probe"; then echo submitted; return 0; fi
  done
  echo "send: NOT CONFIRMED — '$probe...' still visible and no new queued marker" >&2
  return 1
}

cmd_wait() {
  local name="${1:?wait: need a name}" cap="${2:-$DEFAULT_CAP}"
  local ready busy p i; ready="$(_get "$name" ready)"; busy="$(_get "$name" busy)"
  for ((i=0; i<cap; i++)); do
    _alive "$name" || { echo dead; return 1; }
    p="$(_pane "$name")"
    if [ -n "$busy" ] && printf '%s' "$p" | grep -qE "$busy"; then sleep 2; continue; fi
    if printf '%s' "$p" | grep -qE "$ready"; then echo idle; return 0; fi
    sleep 1
  done
  echo timeout; return 1
}

cmd_peek() {
  local name="${1:?peek: need a name}" lines="${2:-40}"
  _alive "$name" || { echo "(no session '$name')"; return 1; }
  tmux capture-pane -t "$(_sess "$name")" -p -S "-${lines}" 2>/dev/null | sed -e 's/[[:space:]]*$//'
}

cmd_status() {
  local name="${1:?status: need a name}"
  _alive "$name" || { echo dead; return 0; }
  local p ready busy; p="$(_pane "$name")"; ready="$(_get "$name" ready)"; busy="$(_get "$name" busy)"
  if   [ -n "$busy" ] && printf '%s' "$p" | grep -qE "$busy";  then echo busy
  elif [ -n "$ready" ] && printf '%s' "$p" | grep -qE "$ready"; then echo idle
  else echo starting; fi
}

cmd_send_wait() {
  local name="${1:?}" msg="${2?}" cap="${3:-$DEFAULT_CAP}" lines="${4:-40}"
  cmd_send "$name" "$msg" || return 1
  cmd_wait "$name" "$cap" >/dev/null
  cmd_peek "$name" "$lines"
}

# --- deterministic-ish turn state ----------------------------------------------------------
# Pane scraping is a PROXY: it reads what the agent DISPLAYS. Two ways it lied on 2026-07-28 —
# a marker built on a permanently-visible status line could only ever answer "idle", and a
# narrow busy marker missed a second busy footer and called a blocked session idle.
#
# codex writes an append-only rollout at ~/.codex/sessions/<Y>/<M>/<D>/rollout-*.jsonl. That is
# the PRODUCER'S OWN record: unaffected by rendering, redraws, or unsubmitted composer text.
# It carries `task_started` per turn and a stream of `token_count` events during one, but NO
# turn-complete event — so it cannot prove idleness either. What it gives is growth: while a
# turn runs the file grows.
#
# So `state` reports idle only when the pane marker AND rollout quiescence AGREE. That is a
# conjunction, not a proof, and it is deliberately stated as such: two independent sources
# failing the same way is far less likely than one.

# Newest rollout touched by the session's cwd, or empty when it cannot be identified.
_rollout() {
  local cwd; cwd="$(tmux display-message -t "$(_sess "$1")" -p '#{pane_current_path}' 2>/dev/null)"
  [ -n "$cwd" ] || return 0
  local newest="" f
  for f in $(ls -1t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -40); do
    if grep -qlF "$cwd" "$f" 2>/dev/null; then newest="$f"; break; fi
  done
  printf '%s' "$newest"
}

# grew | quiet | unknown — sampled over `window` seconds (default 6).
cmd_rollout() {
  local name="${1:?rollout: need a name}" window="${2:-6}"
  local f; f="$(_rollout "$name")"
  [ -n "$f" ] || { echo unknown; return 0; }
  local a b; a="$(stat -c%s "$f" 2>/dev/null || echo 0)"
  sleep "$window"
  b="$(stat -c%s "$f" 2>/dev/null || echo 0)"
  [ "$b" -gt "$a" ] && echo grew || echo quiet
}

# The verb to trust: busy | idle | starting | dead, requiring BOTH sources to agree on idle.
cmd_state() {
  local name="${1:?state: need a name}" window="${2:-6}"
  local pane; pane="$(cmd_status "$name")"
  [ "$pane" = "idle" ] || { echo "$pane"; return 0; }
  local growth; growth="$(cmd_rollout "$name" "$window")"
  case "$growth" in
    grew)    echo busy;;                  # pane says idle, producer says otherwise — believe the producer
    quiet)   echo idle;;
    unknown) echo "idle-unconfirmed";;    # never silently upgrade an unverifiable answer to idle
  esac
}

cmd_kill() { tmux kill-session -t "$(_sess "$1")" 2>/dev/null && echo "killed $1" || echo "no session '$1'"; }
cmd_list() { tmux list-sessions -F '#{session_name}' 2>/dev/null | sed -n "s/^${SP}//p"; }

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  case "${1:-help}" in
    launch)    shift; cmd_launch "$@";;
    send)      shift; cmd_send "$@";;
    wait)      shift; cmd_wait "$@";;
    send-wait) shift; cmd_send_wait "$@";;
    peek)      shift; cmd_peek "$@";;
    status)    shift; cmd_status "$@";;
    state)     shift; cmd_state "$@";;
    rollout)   shift; cmd_rollout "$@";;
    kill)      shift; cmd_kill "$@";;
    list)      cmd_list;;
    help|-h|--help) usage;;
    *) echo "unknown verb: $1" >&2; usage; return 2;;
  esac
}

# Run only when executed, not when sourced (so the test suite can call functions directly).
[ "${BASH_SOURCE[0]}" = "${0}" ] && main "$@"
