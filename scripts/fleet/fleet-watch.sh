#!/usr/bin/env bash
# fleet-watch.sh — the ONE standing watcher the conductor arms as a persistent Monitor.
#
# WHY ONE WATCHER, NOT ONE PER DISPATCH
#
# Monitors are session state. They die with the session, and a per-dispatch monitor
# must be remembered at dispatch time and re-armed after every interrupt — two chances
# to forget. This script derives its watch set FROM DISK every cycle, so a new
# dispatch enters the watch automatically (its task folder is the dispatch commit),
# and recovery after an interrupt is ONE action:
#
#   Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true)
#
# The reconciliation sweep re-arms it when TaskList shows no fleet-watch monitor.
#
# EVENTS (one line each; the Monitor turns each into a notification):
#   READY: <path>            a new /tmp/*-READY*.md appeared (stamped .seen once reported)
#   SILENT: #<n> <slug>      an in-progress task's transcript is silent > SILENT_MINUTES
#                            while its tmux session is gone (builder likely died)
#   GATE_DONE: <log> <line>  a watched gate log reached its GATE_EXIT sentinel
#
# Self-test: fleet-watch.sh --self-test builds a sandbox and requires each event to
# fire (present arm) and a clean sandbox to stay silent (absent arm).

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
tasks_in_progress="${repository_root}/.invar/tasks/in-progress"
transcripts_directory="${repository_root}/tmp/transcripts"
SILENT_MINUTES="${SILENT_MINUTES:-20}"
CYCLE_SECONDS="${CYCLE_SECONDS:-30}"

emit_ready_events() {
  local ready_file
  for ready_file in /tmp/*-READY*.md; do
    [ -e "$ready_file" ] || continue
    if [ ! -f "${ready_file}.seen" ]; then
      echo "READY: ${ready_file}"
      touch "${ready_file}.seen"
    fi
  done
}

emit_silent_events() {
  [ -d "$tasks_in_progress" ] || return 0
  local task_folder folder_name transcript recent
  for task_folder in "$tasks_in_progress"/*/; do
    [ -d "$task_folder" ] || continue
    folder_name="$(basename "$task_folder")"
    # A delivered report means idle-by-design; silence is then expected, not a death.
    ls "$task_folder"report-* >/dev/null 2>&1 && continue
    transcript="$(ls "$transcripts_directory"/transcript-*-"$folder_name".md 2>/dev/null | head -1)"
    [ -n "$transcript" ] || continue
    recent="$(find "$transcript" -mmin "-${SILENT_MINUTES}" 2>/dev/null)"
    if [ -z "$recent" ] && ! tmux has-session -t "invar/${folder_name}" 2>/dev/null; then
      if [ ! -f "/tmp/fleet-watch-silent-${folder_name}.seen" ]; then
        echo "SILENT: ${folder_name} — transcript quiet >${SILENT_MINUTES}m and no tmux session"
        touch "/tmp/fleet-watch-silent-${folder_name}.seen"
      fi
    fi
  done
}

emit_gate_events() {
  # Any file may register a gate log by writing its path into /tmp/fleet-watch-gates
  # (one path per line). The sentinel is the gate's own GATE_EXIT line.
  [ -f /tmp/fleet-watch-gates ] || return 0
  local gate_log sentinel
  while IFS= read -r gate_log; do
    [ -f "$gate_log" ] || continue
    sentinel="$(grep -m1 "GATE_EXIT=" "$gate_log" 2>/dev/null || true)"
    if [ -n "$sentinel" ] && [ ! -f "${gate_log}.reported" ]; then
      echo "GATE_DONE: ${gate_log} ${sentinel}"
      touch "${gate_log}.reported"
    fi
  done < /tmp/fleet-watch-gates
}

if [ "${1:-}" = "--self-test" ]; then
  sandbox="$(mktemp -d /tmp/fleet-watch-selftest-XXXXXX)"
  failures=0
  # PRESENT arm: a planted READY file must fire once, then stay silent.
  planted="/tmp/selftest-$$-READY.md"; echo x > "$planted"
  first="$(emit_ready_events | grep -c "$planted" || true)"
  second="$(emit_ready_events | grep -c "$planted" || true)"
  [ "$first" = "1" ] || { echo "FAIL ready present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL ready seen-stamp arm (got $second)"; failures=1; }
  rm -f "$planted" "${planted}.seen"
  # PRESENT arm: a registered gate log with a sentinel must fire once.
  gate_log="$sandbox/gate.log"; echo "GATE_EXIT=0" > "$gate_log"
  echo "$gate_log" > /tmp/fleet-watch-gates
  first="$(emit_gate_events | grep -c GATE_DONE || true)"
  second="$(emit_gate_events | grep -c GATE_DONE || true)"
  [ "$first" = "1" ] || { echo "FAIL gate present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL gate reported-stamp arm (got $second)"; failures=1; }
  rm -f /tmp/fleet-watch-gates "${gate_log}.reported"
  # ABSENT arm: with nothing planted, no event may fire.
  quiet="$( { emit_ready_events; emit_gate_events; } | grep -c . || true)"
  [ "$quiet" = "0" ] || { echo "FAIL absent arm — events with nothing planted: $quiet"; failures=1; }
  rm -rf "$sandbox"
  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: all arms fire, clean state stays silent."
    exit 0
  fi
  exit 1
fi

while true; do
  emit_ready_events
  emit_silent_events
  emit_gate_events
  sleep "$CYCLE_SECONDS"
done
