#!/usr/bin/env bash
# lane-rollout.sh — the ONE resolver from a fleet lane to its session record.
#
# WHY: steer.sh, fleet-watch.sh, and codex-compaction-notify.sh each carried
# their own copy of the same search (find the lane's codex rollout file, or
# its claude store record). Three copies of one generator drift; this file is
# the shared seam (#525, from #517 bycatch). #524's probe proved
# `codex resume --last` is already cwd-scoped (codex-cli 0.146.1), so
# relaunch.sh needs no resolver call today — this seam is where a resume-by-id
# fix plugs in if a future codex version drops the cwd filter.
#
# USAGE (source it, then call):
#   . scripts/fleet/lane-rollout.sh
#   resolve_lane_rollout <cwd> <task-folder-name> <thread-id>
#
# Resolution order — strongest identity first:
#   1. thread-id  — the rollout FILENAME carries the codex thread id
#                   (~/.codex/sessions/YYYY/MM/DD/rollout-*-<thread-id>.jsonl;
#                   the #517 notify payload proved this identity).
#   2. cwd scan   — newest LANE_ROLLOUT_SCAN_HEAD rollout heads, matched on
#                   the session-meta "cwd" field (identity, never content
#                   grep — the #280/#313 lesson).
#   3. claude     — newest record in the claude store dir named by the task
#                   folder (claude lanes have no rollout).
# Empty arguments skip their arm. Prints the record path or nothing; always
# returns 0 — an unresolved lane is a normal answer, not an error.
#
# Self-test: bash scripts/fleet/lane-rollout.sh --self-test
#   Plants a fixture sessions tree and asserts every arm in both polarities.
#
# Env knobs (fixtures and tests): LANE_ROLLOUT_CODEX_SESSIONS,
# LANE_ROLLOUT_CLAUDE_PROJECTS, LANE_ROLLOUT_SCAN_HEAD.

LANE_ROLLOUT_CODEX_SESSIONS="${LANE_ROLLOUT_CODEX_SESSIONS:-$HOME/.codex/sessions}"
LANE_ROLLOUT_CLAUDE_PROJECTS="${LANE_ROLLOUT_CLAUDE_PROJECTS:-$HOME/.claude/projects}"
LANE_ROLLOUT_SCAN_HEAD="${LANE_ROLLOUT_SCAN_HEAD:-40}"

resolve_lane_rollout() {
  local cwd="${1:-}" task_folder_name="${2:-}" thread_id="${3:-}" record_file
  # Every `ls | head` below carries `|| true`: ls takes SIGPIPE when head
  # exits first, and under a caller's set -e -o pipefail that kills the
  # whole script silently (seen live building #524's probe).
  if [ -n "$thread_id" ]; then
    record_file="$(ls -t "$LANE_ROLLOUT_CODEX_SESSIONS"/*/*/*/rollout-*"$thread_id".jsonl 2>/dev/null | head -1 || true)"
    [ -n "$record_file" ] && { printf '%s' "$record_file"; return 0; }
  fi
  if [ -n "$cwd" ]; then
    for record_file in $(ls -1t "$LANE_ROLLOUT_CODEX_SESSIONS"/*/*/*/rollout-*.jsonl 2>/dev/null | head -"$LANE_ROLLOUT_SCAN_HEAD" || true); do
      if head -c 2048 "$record_file" 2>/dev/null | grep -qF "\"cwd\":\"$cwd\""; then
        printf '%s' "$record_file"; return 0
      fi
    done
  fi
  if [ -n "$task_folder_name" ]; then
    record_file="$(ls -t "$LANE_ROLLOUT_CLAUDE_PROJECTS"/*"$task_folder_name"*/*.jsonl 2>/dev/null | head -1 || true)"
    [ -n "$record_file" ] && { printf '%s' "$record_file"; return 0; }
  fi
  return 0
}

# ---------------------------------------------------------------------------
# SELF-TEST — runs only when executed, never when sourced.
# ---------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${1:-}" = "--self-test" ]; then
  set -euo pipefail
  sandbox="$(mktemp -d /tmp/lane-rollout-selftest-XXXXXX)"
  failures=0
  export LANE_ROLLOUT_CODEX_SESSIONS="$sandbox/codex-sessions"
  export LANE_ROLLOUT_CLAUDE_PROJECTS="$sandbox/claude-projects"

  day_directory="$LANE_ROLLOUT_CODEX_SESSIONS/2026/08/11"
  mkdir -p "$day_directory"
  rollout_a="$day_directory/rollout-2026-08-11T10-00-00-THREAD-AAA.jsonl"
  rollout_a_newer="$day_directory/rollout-2026-08-11T11-00-00-THREAD-AA2.jsonl"
  rollout_b="$day_directory/rollout-2026-08-11T12-00-00-THREAD-BBB.jsonl"
  printf '{"type":"session_meta","payload":{"cwd":"/tmp/fixture-lane-a"}}\n' > "$rollout_a"
  printf '{"type":"session_meta","payload":{"cwd":"/tmp/fixture-lane-a"}}\n' > "$rollout_a_newer"
  printf '{"type":"session_meta","payload":{"cwd":"/tmp/fixture-lane-b"}}\n' > "$rollout_b"
  touch -d '3 hours ago' "$rollout_a"
  touch -d '2 hours ago' "$rollout_a_newer"
  touch -d '1 hour ago'  "$rollout_b"

  # THREAD-ID present arm: the exact file, even though lane B's is newer.
  found="$(resolve_lane_rollout "" "" "THREAD-AAA")"
  [ "$found" = "$rollout_a" ] || { echo "FAIL thread-id present arm: $found"; failures=1; }
  # THREAD-ID absent arm: an unknown id with no other identity resolves empty.
  found="$(resolve_lane_rollout "" "" "THREAD-ZZZ")"
  [ -z "$found" ] || { echo "FAIL thread-id absent arm: $found"; failures=1; }
  # THREAD-ID fallback arm: an unknown id with a cwd falls through to the scan.
  found="$(resolve_lane_rollout "/tmp/fixture-lane-a" "" "THREAD-ZZZ")"
  [ "$found" = "$rollout_a_newer" ] || { echo "FAIL thread-id fallback arm: $found"; failures=1; }

  # CWD present arm: lane A's NEWEST rollout, never lane B's newer file.
  found="$(resolve_lane_rollout "/tmp/fixture-lane-a" "" "")"
  [ "$found" = "$rollout_a_newer" ] || { echo "FAIL cwd present arm: $found"; failures=1; }
  # CWD isolation arm: lane B resolves to lane B.
  found="$(resolve_lane_rollout "/tmp/fixture-lane-b" "" "")"
  [ "$found" = "$rollout_b" ] || { echo "FAIL cwd isolation arm: $found"; failures=1; }
  # CWD absent arm: an unknown cwd with no claude fallback resolves empty.
  found="$(resolve_lane_rollout "/tmp/fixture-lane-nowhere" "" "")"
  [ -z "$found" ] || { echo "FAIL cwd absent arm: $found"; failures=1; }
  # SCAN-WINDOW arm: the cwd scan reads only the newest N heads — with the
  # window pinched to 1, lane A (older than lane B) must NOT be found. This
  # proves the bound is real, not decoration.
  found="$(LANE_ROLLOUT_SCAN_HEAD=1 resolve_lane_rollout "/tmp/fixture-lane-a" "" "")"
  [ -z "$found" ] || { echo "FAIL scan-window arm: $found"; failures=1; }

  # CLAUDE fallback present arm: no codex match, task-named store dir wins.
  claude_directory="$LANE_ROLLOUT_CLAUDE_PROJECTS/-tmp-fixture-999-selftest-lane"
  mkdir -p "$claude_directory"
  claude_record_old="$claude_directory/older.jsonl"
  claude_record_new="$claude_directory/newer.jsonl"
  echo '{}' > "$claude_record_old"; echo '{}' > "$claude_record_new"
  touch -d '2 hours ago' "$claude_record_old"
  found="$(resolve_lane_rollout "/tmp/fixture-lane-nowhere" "999-selftest-lane" "")"
  [ "$found" = "$claude_record_new" ] || { echo "FAIL claude fallback present arm: $found"; failures=1; }
  # CLAUDE fallback absent arm: a task name matching no store dir resolves empty.
  found="$(resolve_lane_rollout "" "999-no-such-lane" "")"
  [ -z "$found" ] || { echo "FAIL claude fallback absent arm: $found"; failures=1; }

  # PRECEDENCE arm: codex cwd match outranks a matching claude store dir.
  found="$(resolve_lane_rollout "/tmp/fixture-lane-a" "999-selftest-lane" "")"
  [ "$found" = "$rollout_a_newer" ] || { echo "FAIL precedence arm: $found"; failures=1; }

  rm -rf "$sandbox"
  [ "$failures" = 0 ] && { echo "SELF-TEST: thread-id, cwd scan, scan window, claude fallback, precedence — all arms both polarities."; exit 0; }
  exit 1
fi
