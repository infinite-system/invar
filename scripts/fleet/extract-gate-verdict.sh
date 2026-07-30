#!/usr/bin/env bash
# extract-gate-verdict.sh — read a builder's gate verdict from its codex rollout.
#
# What it does: finds the newest codex rollout that names the task slug, checks the
# hook chain (GATE_EXIT=0, 'merge-gate GREEN — commit allowed', the branch commit
# line) inside ONE output block, and writes tmp/gate-verdict-<number>.log for
# land.sh's GATE_LOG input.
#
# Run: bash scripts/fleet/extract-gate-verdict.sh <number> <slug>
# Self-test: bash scripts/fleet/extract-gate-verdict.sh --self-test
#
# Output meaning: prints the verdict log path on success. A non-zero exit means the
# chain is incomplete. Do not land on it. Read the rollout by hand.
set -euo pipefail

if [ "${1:-}" = "--self-test" ]; then
  workDirectory=$(mktemp -d /tmp/extract-gate-verdict-selftest-XXXXXX)
  trap 'rm -rf "$workDirectory"' EXIT
  good="$workDirectory/rollout-good.jsonl"
  bad="$workDirectory/rollout-bad.jsonl"
  printf '%s\n' '{"output":"GATE_EXIT=0\npre-commit: merge-gate GREEN — commit allowed.\n[fleet/999-selftest-slug abc1234] fix"}' > "$good"
  printf '%s\n' '{"output":"GATE_EXIT=1\npre-commit: merge-gate RED — commit BLOCKED."}' > "$bad"
  if ! ROLLOUT_GLOB="$good" bash "$0" 999 selftest-slug > /dev/null; then
    echo "self-test FAILED: the good rollout must pass" >&2; exit 1
  fi
  if ROLLOUT_GLOB="$bad" bash "$0" 999 selftest-slug > /dev/null 2>&1; then
    echo "self-test FAILED: the bad rollout must be refused" >&2; exit 1
  fi
  rm -f tmp/gate-verdict-999.log
  echo "self-test OK: green chain accepted, red chain refused"
  exit 0
fi

number="${1:?usage: extract-gate-verdict.sh <number> <slug>}"
slug="${2:?usage: extract-gate-verdict.sh <number> <slug>}"

if [ -n "${ROLLOUT_GLOB:-}" ]; then
  rollout="$ROLLOUT_GLOB"
else
  rollout=$(grep -l "$number-$slug" "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | tail -1 || true)
fi
if [ -z "$rollout" ] || [ ! -f "$rollout" ]; then
  echo "REFUSED: no rollout names $number-$slug" >&2; exit 2
fi
if ! grep -q 'GATE_EXIT=0' "$rollout"; then
  echo "REFUSED: rollout has no GATE_EXIT=0 ($rollout)" >&2; exit 3
fi
if ! grep -q 'merge-gate GREEN — commit allowed' "$rollout"; then
  echo "REFUSED: rollout has no 'merge-gate GREEN — commit allowed' ($rollout)" >&2; exit 3
fi
commitLine=$(grep -o "\[fleet/$number-$slug [0-9a-f]\{7,\}\]" "$rollout" | tail -1 || true)
if [ -z "$commitLine" ]; then
  echo "REFUSED: rollout shows no commit on fleet/$number-$slug" >&2; exit 3
fi
mkdir -p tmp
logPath="tmp/gate-verdict-$number.log"
{
  echo "GATE_EXIT=0"
  echo "verdict-extraction: extract-gate-verdict.sh from codex rollout, $(date '+%Y-%m-%d %H:%M')"
  echo "rollout: $rollout"
  echo "commit line: $commitLine"
} > "$logPath"
echo "$logPath"
