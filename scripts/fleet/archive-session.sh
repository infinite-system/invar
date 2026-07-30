#!/usr/bin/env bash
# archive-session.sh <task-folder-name> — copy a builder's native session file into the repo.
#
# WHY: the engines' stores (~/.codex/sessions, ~/.claude/projects) hold the full
# structured record — every tool call with complete input and output — which the
# pane transcript truncates. Codex retains them indefinitely TODAY, but retention
# is a requested feature upstream and may change. Post-analysis (which tool calls
# failed, where time went) needs the file to outlive their policy, so LAND copies
# it BESIDE the pane transcript, where one ls shows every artifact of a task:
# tmp/transcripts/transcript-RAW-<engine>-<model>-<effort>-<n>-<slug>.jsonl —
# the same identity as its pane-transcript sibling, so the pair sorts together.
#
# The link was written at dispatch: tmp/transcripts/session-link-<name>.txt.
#
# Usage:  bash scripts/fleet/archive-session.sh 122-editor-becomes-final-contributor
# Self-test:  bash scripts/fleet/archive-session.sh --self-test

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
archive_directory="${repository_root}/tmp/transcripts"

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
    # LAZY RESOLUTION: dispatch's eager lookup races codex's rollout write
    # (observed 15-56s after launch on 2026-07-30; #329, #323, #327 all wrote
    # UNRESOLVED). At archive time the file certainly exists, so resolve here
    # by the same identity dispatch uses: the rollout head NAMES the worktree.
    # Uniqueness guard: refuse on more than one match rather than guess.
    # Head-only match (session_meta cwd), NEVER full-file grep: conductor
    # steers and briefs plant task slugs inside OTHER sessions' transcripts
    # (the #280 mis-archive lesson). Only the head names the true cwd.
    local codex_store="$HOME/.codex/sessions"
    local matches=""
    local candidate
    while IFS= read -r candidate; do
      if head -c 8000 "$candidate" | grep -q "worktrees/${task_folder_name}\""; then
        matches="${matches}${candidate}
"
      fi
    done < <(find "$codex_store" -type f -name 'rollout-*.jsonl' 2>/dev/null)
    matches="$(printf '%s' "$matches")"
    local match_count
    match_count="$(printf '%s' "$matches" | grep -c . || true)"
    if [ "$match_count" = "1" ]; then
      session_file="$matches"
      echo "$session_file" > "$link_path"
      echo "archive-session: link was stale/UNRESOLVED — lazily resolved by worktree name: ${session_file}"
    else
      # CLAUDE-STORE FALLBACK: claude lanes key their project dir by the
      # worktree PATH, so the directory name contains the task folder name —
      # unique by construction. Newest jsonl in that dir is the session.
      # Done by hand 3x on 2026-07-30 (#383, #387, #402) before this hardening.
      local claude_candidate
      claude_candidate="$(ls -t "$HOME"/.claude/projects/*"${task_folder_name}"*/*.jsonl 2>/dev/null | head -1 || true)"
      if [ -n "$claude_candidate" ] && [ -f "$claude_candidate" ]; then
        session_file="$claude_candidate"
        echo "$session_file" > "$link_path"
        echo "archive-session: link was stale/UNRESOLVED — resolved from the claude store: ${session_file}"
      else
        echo "archive-session: FAIL — linked session file missing: ${session_file}" >&2
        echo "  (lazy resolution found ${match_count} codex candidates and no claude-store dir naming ${task_folder_name}; need exactly 1)" >&2
        return 1
      fi
    fi
  fi
  mkdir -p "$archive_directory"
  # Name the raw copy after its pane-transcript sibling: the same
  # <engine>-<model>-<effort>-<n>-<slug> identity with RAW inserted, so the pair
  # sorts together and carries one identity. Fallback: the folder name alone.
  local pane_transcript identity
  pane_transcript="$(ls "${archive_directory}"/transcript-*-"${task_folder_name}".md 2>/dev/null | head -1 || true)"
  if [ -n "$pane_transcript" ]; then
    identity="$(basename "$pane_transcript" .md)"
    identity="${identity#transcript-}"
  else
    identity="$task_folder_name"
  fi
  local destination="${archive_directory}/transcript-RAW-${identity}.jsonl"
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
    "${archive_directory}/transcript-RAW-selftest-present-arm.jsonl"
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
