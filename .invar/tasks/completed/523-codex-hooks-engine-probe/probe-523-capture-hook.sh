#!/usr/bin/env bash
# Capture script for the 523 hooks probe: logs one JSON-lines record per
# invocation — timestamp, argv, full stdin, and CODEX_* env — to
# $HOOK_LOG (default /tmp/hooks-probe-capture.log). Read the log to see
# which hook events fired and with what payload.
LOG="${HOOK_LOG:-/tmp/hooks-probe-capture.log}"
STDIN=$(cat)
{
  echo "=== $(date -Is) argv=[$*]"
  echo "--- stdin:"
  echo "$STDIN"
  echo "--- env (CODEX*/CLAUDE*):"
  env | grep -E '^(CODEX|CLAUDE)' || true
} >> "$LOG"
exit 0
