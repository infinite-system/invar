#!/usr/bin/env bash
# agent-tmux.test.sh — tests for agent-tmux.sh.
#   ./agent-tmux.test.sh           unit + tmux-mechanics (bash session) — no quota
#   AGENT_TMUX_LIVE=1 ./…          also a live claude (haiku) smoke (spends a little quota)
#
# Sources agent-tmux.sh (its source-guard suppresses the dispatcher) to call functions
# directly. Runs WITHOUT errexit, like the other suites.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=test-lib.sh
source "$HERE/test-lib.sh"
export AGENT_TMUX_PREFIX="att_" # isolated namespace so tests never touch real at_ sessions
# shellcheck source=agent-tmux.sh
source "$HERE/agent-tmux.sh"

command -v tmux >/dev/null 2>&1 || { echo "tmux not installed — skipping"; exit 0; }

echo "── unit: profiles & naming ──"
_profile claude
eq "claude READY_RE" "for shortcuts|for agents" "$READY_RE"
eq "claude BUSY_RE" "esc to interrupt" "$BUSY_RE"
[ -n "$LAUNCH_ENV" ] && ok "claude launch env sets persistence/promotion" || bad "claude LAUNCH_ENV" "non-empty" "empty"
case "$LAUNCH_ENV" in *FORCE_SESSION_PERSISTENCE*) ok "launch env forces persistence" ;; *) bad "persistence flag" "present" "$LAUNCH_ENV" ;; esac
_profile codex
[ -n "$READY_RE" ] && ok "codex READY_RE present (stub)" || bad "codex READY_RE" "non-empty" "empty"
READY_OVERRIDE="ZZZ"; _profile claude; eq "--ready override wins" "ZZZ" "$READY_RE"; READY_OVERRIDE=""
eq "_sess namespacing" "att_foo" "$(_sess foo)"

echo "── mechanics: real tmux against a bash session (no quota) ──"
N="mech$$"
cmd_kill "$N" >/dev/null 2>&1
out="$(cmd_launch "$N" --ready '\$' --busy '' --timeout 15 -- bash --norc -i 2>&1)"
eq "launch reaches the bash prompt" "ready" "$out"
eq "status: idle at prompt" "idle" "$(cmd_status "$N")"
SENT="HELLO_${$}_${RANDOM}"
cmd_send "$N" "echo $SENT" >/dev/null
sleep 1
if cmd_peek "$N" 30 | grep -q "$SENT"; then ok "send → peek roundtrip (output appeared)"
else bad "send/peek roundtrip" "$SENT in pane" "$(cmd_peek "$N" 5 | tr '\n' '|')"; fi
cmd_kill "$N" >/dev/null
eq "status: dead after kill" "dead" "$(cmd_status "$N")"
eq "kill of missing session" "no session 'nope$$'" "$(cmd_kill "nope$$")"
eq "status of missing session" "dead" "$(cmd_status "nope$$")"

if [ "${AGENT_TMUX_LIVE:-0}" = "1" ] && command -v claude >/dev/null 2>&1; then
  echo "── live smoke: claude (haiku) ──"
  L="live$$"; cmd_kill "$L" >/dev/null 2>&1
  out="$(cmd_launch "$L" --timeout 70 -- claude --model haiku --dangerously-skip-permissions 2>&1)"
  eq "claude launch reaches prompt" "ready" "$out"
  TOK="PONG_${$}_${RANDOM}"
  reply="$(cmd_send_wait "$L" "Reply with exactly this token and nothing else: $TOK" 120 40)"
  if printf '%s' "$reply" | grep -q "$TOK"; then ok "live send-wait → token echoed back"
  else bad "live send-wait" "$TOK in reply" "$(printf '%s' "$reply" | tail -3 | tr '\n' '|')"; fi
  cmd_kill "$L" >/dev/null
else
  echo "── live smoke skipped (set AGENT_TMUX_LIVE=1 to run) ──"
fi

report
