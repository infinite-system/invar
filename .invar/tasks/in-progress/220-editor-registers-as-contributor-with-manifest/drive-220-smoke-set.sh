#!/usr/bin/env bash
# What this script finds out: whether the smoke set #220 cites is GREEN in a given worktree.
#
# #220 must quote each smoke green BEFORE the first edit and again after, so a silence after the
# change is a COMPARISON and not a claim. This drives the same list in whichever worktree it is
# run from, one at a time, and prints one line per smoke.
#
# How to run it (from the worktree root you want to measure):
#   bash <this-file> <log-directory>
#
# How to read the output: one `<exit-code> <smoke-name>` line per smoke, then a `FAILED:` summary.
# `0` means the smoke drove green (its own output ends in ALL-PASS). Any other number is a red and
# the full transcript is in `<log-directory>/<smoke-name>.log`. A green line here is evidence only
# when the same line is produced in the same way on both sides of the change.
set -u

LOG_DIRECTORY="${1:?usage: drive-220-smoke-set.sh <log-directory>}"
mkdir -p "$LOG_DIRECTORY"

SMOKES=(
  smoke-plugin-manifest-harness
  smoke-editor-harness
  smoke-bracket-match-harness
  smoke-selection-harness
  smoke-scrollbars-harness
  smoke-code-folding-harness
  smoke-image-preview-harness
  smoke-hover-harness
  smoke-layout-harness
  smoke-tabs-harness
  smoke-find-harness
  smoke-goto-definition-harness
  smoke-clipboard-frame-boundary-harness
  smoke-panel-split-harness
  smoke-diagnostics-harness
  smoke-completion-harness
  smoke-workspace-tabs-harness
  smoke-field-caret-harness
)

FAILED=()
for SMOKE in "${SMOKES[@]}"; do
  bun "scripts/harness/${SMOKE}.ts" >"${LOG_DIRECTORY}/${SMOKE}.log" 2>&1
  EXIT_CODE=$?
  echo "${EXIT_CODE} ${SMOKE}"
  if [ "$EXIT_CODE" -ne 0 ]; then FAILED+=("$SMOKE"); fi
done

if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "FAILED: none"
else
  echo "FAILED: ${FAILED[*]}"
fi
