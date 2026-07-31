#!/usr/bin/env bash
#
# The release gate for the Invariable representation instrument.
#
# Run from the repository root:  bash tools/invariant-field-v2/release-gate.sh
#
# It runs the tool's own checks and then drives the real thing once:
#   1. types            — vue-tsc over the tool
#   2. unit tests       — parser parity against the canonical checker, rank
#                         determinism and range, playout, code lens, tokens,
#                         and the absence guards
#   3. contract         — the instrument's own contract parses and its
#                         annotations resolve
#   4. stylesheet       — no unreachable and no silently overridden rule
#   5. calibration      — planted rot must move a record away from R
#   6. driven smoke     — one real Chromium pass proving the formula, the
#                         geometry, one focus fold, and self-measurement
#
# This is not a second merge gate. The repository's conventions gate and merge
# gate still cover this tree; this command answers one question only: is the
# instrument fit to release? Exit 0 means yes. Every step prints PASS or FAIL,
# and the last line is RELEASE-GATE PASS or RELEASE-GATE FAIL with the count.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2

PORT="${FIELD_RELEASE_GATE_PORT:-4319}"
FAILURES=0
SERVER_PID=""

report() {
  local status="$1" name="$2"
  if [ "$status" -eq 0 ]; then
    printf '  PASS  %s\n' "$name"
  else
    printf '  FAIL  %s\n' "$name"
    FAILURES=$((FAILURES + 1))
  fi
}

step() {
  local name="$1"
  shift
  printf '== release-gate: %s ==\n' "$name"
  "$@"
  report $? "$name"
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap stop_server EXIT

step "types (vue-tsc)" bunx vue-tsc --noEmit -p tools/invariant-field-v2/tsconfig.json
step "unit tests (bun test)" bun test tools/invariant-field-v2
step "contract structure" node .claude/skills/invariants/scripts/check_invariants.mjs \
  tools/invariant-field-v2/invariant-field.invariants.md
step "annotations resolve" node .claude/skills/invariants/scripts/check_invariants.mjs --refs
step "stylesheet census" bun tools/invariant-field-v2/check-stylesheet.ts
step "planted-rot calibration" bun tools/invariant-field-v2/calibrate.ts

printf '== release-gate: driven smoke (real Chromium) ==\n'
bun tools/invariant-field-v2/server.ts --port="$PORT" >/tmp/field-release-gate-server.log 2>&1 &
SERVER_PID=$!
SERVER_READY=1
for _ in $(seq 1 600); do
  if curl -sf -o /dev/null "http://localhost:${PORT}/"; then
    SERVER_READY=0
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$SERVER_READY" -ne 0 ]; then
  printf 'the server never answered on port %s; log:\n' "$PORT"
  tail -20 /tmp/field-release-gate-server.log
  report 1 "driven smoke (real Chromium)"
else
  bun tools/invariant-field-v2/smoke-field.ts "http://localhost:${PORT}/"
  report $? "driven smoke (real Chromium)"
fi
stop_server
SERVER_PID=""

if [ "$FAILURES" -eq 0 ]; then
  printf 'RELEASE-GATE PASS (0 failures)\n'
  exit 0
fi
printf 'RELEASE-GATE FAIL (%s failure(s))\n' "$FAILURES"
exit 1
