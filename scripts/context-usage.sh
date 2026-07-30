#!/usr/bin/env bash
# context-usage.sh — report the conductor's own live context size.
#
# Ground truth: every assistant message in the session transcript carries a
# usage block; context length = cache_read + cache_creation + input of the
# LAST message. Reads the most recently modified transcript in the project
# dir ([1] optional override: explicit transcript path).
#
# Output: one line, machine-parseable:  CONTEXT_TOKENS=<n> PCT=<n>% FILE=<path>
set -euo pipefail

project_dir="${CONTEXT_PROJECT_DIR:-$HOME/.claude/projects/-home-parallels-dev-ibr}"
# Budget resolution, most authoritative first: explicit override, then the
# harness's own CLAUDE_CODE_AUTO_COMPACT_WINDOW (present in every Bash call's
# environment — adapts automatically when the user changes the setting),
# then the 400k fallback.
budget_tokens="${CONTEXT_BUDGET_TOKENS:-${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-400000}}"
# The UI's percentage runs against the USABLE window (budget minus the
# autocompact reserve: output + compaction headroom), not the raw budget.
# 2026-07-29 calibration: script said 86.4% raw while the user's UI said
# 95% -> usable ~= 364k -> reserve ~= 36k on a 400k budget.
compact_reserve_tokens="${CONTEXT_COMPACT_RESERVE_TOKENS:-36000}"

newest_transcript="$(ls -t "$project_dir"/*.jsonl 2>/dev/null | head -1 || true)"
transcript="${1:-$newest_transcript}"
if [[ -z "${transcript:-}" || ! -f "$transcript" ]]; then
  echo "CONTEXT_TOKENS=UNKNOWN PCT=UNKNOWN FILE=none (no transcript found in $project_dir)" >&2
  exit 1
fi

python3 - "$transcript" "$budget_tokens" "$compact_reserve_tokens" <<'PY'
import json, sys
transcript_path, budget, compact_reserve = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
last_usage = None
with open(transcript_path) as handle:
    for line in handle:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        usage = (record.get("message") or {}).get("usage")
        if usage and usage.get("cache_read_input_tokens") is not None:
            last_usage = usage
if last_usage is None:
    print("CONTEXT_TOKENS=UNKNOWN PCT=UNKNOWN FILE=%s (no usage records)" % transcript_path)
    sys.exit(1)
context_tokens = (
    last_usage.get("input_tokens", 0)
    + last_usage.get("cache_read_input_tokens", 0)
    + last_usage.get("cache_creation_input_tokens", 0)
)
raw_percent = 100.0 * context_tokens / budget
usable_budget = budget - compact_reserve
compact_percent = 100.0 * context_tokens / usable_budget
print(
    "CONTEXT_TOKENS=%d RAW_PCT=%.1f%% COMPACT_PCT=%.1f%% (UI gauge) FILE=%s"
    % (context_tokens, raw_percent, compact_percent, transcript_path)
)
PY
