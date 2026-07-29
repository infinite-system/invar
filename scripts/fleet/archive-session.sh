#!/usr/bin/env bash
# archive-session.sh <task-folder-name> — copy a builder's native session file into the repo.
#
# WHY: the engines' stores (~/.codex/sessions, ~/.claude/projects) hold the full
# structured record — every tool call with complete input and output — which the
# pane transcript truncates. Codex retains them indefinitely TODAY, but retention
# is a requested feature upstream and may change. Post-analysis (which tool calls
# failed, where time went) needs the file to outlive their policy, so LAND copies
# it here: tmp/native-sessions/<task-folder-name>-<original-basename>.
#
# The link was written at dispatch: tmp/transcripts/session-link-<name>.txt.
#
# Usage:  bash scripts/fleet/archive-session.sh 122-editor-becomes-final-contributor
# Self-test:  bash scripts/fleet/archive-session.sh --self-test

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
archive_directory="${repository_root}/tmp/native-sessions"

archive_one() {
  local task_folder_name="$1"
  local link_path="${repository_root}/tmp/transcripts/session-link-${task_folder_name}.txt"
  if [ ! -f "$link_path" ]; then
    echo "archive-session: FAIL — no link file at ${link_path}" >&2
    return 1
  fi
  local session_file
  session_file="$(head -1 "$link_path")"
  if [ ! -f "$session_file" ]; then
    echo "archive-session: FAIL — linked session file missing: ${session_file}" >&2
    echo "  (link may read UNRESOLVED; resolve by timestamp against the engine store and update the link)" >&2
    return 1
  fi
  mkdir -p "$archive_directory"
  local destination="${archive_directory}/${task_folder_name}-$(basename "$session_file")"
  cp "$session_file" "$destination"
  # Prove the copy: same byte count, or the archive is a lie.
  local source_bytes destination_bytes
  source_bytes="$(wc -c < "$session_file")"
  destination_bytes="$(wc -c < "$destination")"
  if [ "$source_bytes" != "$destination_bytes" ]; then
    echo "archive-session: FAIL — size mismatch (${source_bytes} vs ${destination_bytes})" >&2
    return 1
  fi
  echo "archive-session: OK ${destination} (${destination_bytes} bytes)"
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  sandbox="$(mktemp -d /tmp/archive-session-selftest-XXXXXX)"
  # PRESENT arm: a linked file archives with matching bytes.
  echo "structured record" > "$sandbox/rollout-test.jsonl"
  mkdir -p "${repository_root}/tmp/transcripts"
  echo "$sandbox/rollout-test.jsonl" > "${repository_root}/tmp/transcripts/session-link-selftest-present-arm.txt"
  archive_one "selftest-present-arm" >/dev/null || { echo "FAIL present arm"; failures=1; }
  # ABSENT arm: a missing link must fail loudly, not succeed quietly.
  if archive_one "selftest-absent-arm" 2>/dev/null; then
    echo "FAIL absent arm — archived with no link"; failures=1
  fi
  # BROKEN-LINK arm: a link to a deleted file must fail.
  echo "$sandbox/deleted.jsonl" > "${repository_root}/tmp/transcripts/session-link-selftest-broken-arm.txt"
  if archive_one "selftest-broken-arm" 2>/dev/null; then
    echo "FAIL broken-link arm — archived a missing file"; failures=1
  fi
  rm -rf "$sandbox" \
    "${repository_root}/tmp/transcripts/session-link-selftest-present-arm.txt" \
    "${repository_root}/tmp/transcripts/session-link-selftest-broken-arm.txt" \
    "${archive_directory}/selftest-present-arm-rollout-test.jsonl"
  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: archive proves bytes, missing and broken links fail loudly."
    exit 0
  fi
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <task-folder-name>" >&2
  exit 2
fi
archive_one "$1"
