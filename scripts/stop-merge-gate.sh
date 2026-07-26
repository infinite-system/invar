#!/usr/bin/env bash
# Stop a running merge gate BY IDENTITY, never by searching command lines.
#
# WHY THIS EXISTS: on 2026-07-26 a `pkill -f "merge-gate.sh"` intended to stop one gate also killed two
# running builder agents, because every builder's brief contains the words "do NOT run
# scripts/merge-gate.sh" — so their command lines matched. One builder lost ~25 minutes of uncommitted
# work. A `-f` pattern match tests ARGUMENTS, not programs, and an agent carrying instructions about a
# tool looks exactly like that tool to a text search.
#
# This script kills only a pid the gate itself published, verifies the process is really that gate before
# signalling, and refuses to guess. If it cannot positively identify a gate, it exits non-zero and kills
# NOTHING — a refusal is always cheaper than destroying work.
#
# Usage: bash scripts/stop-merge-gate.sh [worktree-root]   (default: this script's repository)
set -uo pipefail
requested_root="${1:-}"
if [ -n "$requested_root" ]; then
  gate_root="$(cd "$requested_root" && pwd)"
else
  gate_root="$(cd "$(dirname "$0")/.." && pwd)"
fi
gate_pid_file="/tmp/merge-gate.$(echo "$gate_root" | tr -c 'a-zA-Z0-9' '-').pid"

if [ ! -f "$gate_pid_file" ]; then
  echo "stop-merge-gate: no pid file for $gate_root — no gate is running there. Killing nothing."
  exit 1
fi
gate_pid="$(cat "$gate_pid_file")"
if ! [ "$gate_pid" -gt 0 ] 2>/dev/null; then
  echo "stop-merge-gate: pid file holds '$gate_pid', which is not a pid. Killing nothing."
  exit 1
fi
if [ ! -d "/proc/$gate_pid" ]; then
  echo "stop-merge-gate: pid $gate_pid is already gone (stale pid file). Killing nothing."
  rm -f "$gate_pid_file"
  exit 0
fi
# POSITIVE IDENTIFICATION before signalling: the process must actually be a bash running merge-gate.sh
# from the expected root. Anything else — including an agent whose prompt merely mentions the gate — is
# refused. This is the check whose absence caused the incident.
process_command="$(tr '\0' ' ' < "/proc/$gate_pid/cmdline" 2>/dev/null || true)"
process_directory="$(readlink "/proc/$gate_pid/cwd" 2>/dev/null || true)"
case "$process_command" in
  *"merge-gate.sh"*) ;;
  *) echo "stop-merge-gate: pid $gate_pid is not a merge gate (cmdline: ${process_command:0:120}). Killing nothing."; exit 1 ;;
esac
if [ "$process_directory" != "$gate_root" ]; then
  echo "stop-merge-gate: pid $gate_pid runs in $process_directory, not $gate_root. Killing nothing."
  exit 1
fi
# The gate spawns a worker POOL; signalling the process GROUP takes the workers with it, and the group is
# derived from the identified pid rather than from any pattern.
gate_process_group="$(ps -o pgid= -p "$gate_pid" | tr -d ' ')"
echo "stop-merge-gate: stopping gate pid $gate_pid (process group $gate_process_group) in $gate_root"
kill -TERM "-$gate_process_group" 2>/dev/null || kill -TERM "$gate_pid"
rm -f "$gate_pid_file"
