#!/usr/bin/env bash
# verify-494-loaded-runs.sh — proves the hidden-monitor log-line assertion holds under load.
#
# WHAT IT FINDS OUT: whether scripts/harness/smoke-monitoring-harness.ts stays green when the
# machine is busy. Gate-487 flaked this smoke under full gate load (task #494): the log-line
# baseline was snapshotted while the sampler could still write a line. The fix snapshots the
# baseline only after logging reports off. This script re-creates the load and repeats the smoke.
#
# HOW TO RUN: bash .invar/tasks/in-progress/494-hidden-monitor-log-line-race-under-load/verify-494-loaded-runs.sh [RUNS]
# RUNS defaults to 5. Run it from the repo root.
#
# HOW TO READ THE OUTPUT: one "run N: EXIT=X" line per iteration. Every X must be 0. The final
# line says "ALL N RUNS GREEN" on success or "RUN N WENT RED" with the log path on failure.
# A non-zero exit from this script means the race (or another load-bound defect) is back.
set -u
RUNS="${1:-5}"
LOG_DIR="$(mktemp -d /tmp/verify-494-loaded-runs.XXXXXX)"

# Load: two busy loops per run, alive only while the smoke runs. Bounded and owned by this
# script; they are killed on exit whatever happens.
BURNER_PIDS=()
cleanup() {
  for pid in "${BURNER_PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

for _burner in 1 2; do
  bun -e 'let spin = 0; while (true) { spin = (spin + 1) % 1000000; }' &
  BURNER_PIDS+=("$!")
done

for run in $(seq 1 "$RUNS"); do
  LOG_FILE="$LOG_DIR/run-$run.log"
  bun scripts/harness/smoke-monitoring-harness.ts >"$LOG_FILE" 2>&1
  EXIT_CODE=$?
  echo "run $run: EXIT=$EXIT_CODE"
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "RUN $run WENT RED — log: $LOG_FILE"
    exit 1
  fi
done
echo "ALL $RUNS RUNS GREEN — logs: $LOG_DIR"
