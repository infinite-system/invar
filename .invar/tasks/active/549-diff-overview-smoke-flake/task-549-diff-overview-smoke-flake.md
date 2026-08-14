# 549 — diff overview smoke flake

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The diff-overview smoke (added by #546) times out under gate load on
branches that never touch diff code. It passes on main and on solo
manual runs. A new smoke with a latent load-sensitive wait.

## Evidence (2026-08-11)

- gate-354-r4 (/tmp/merge-gate-failures.46dec6e442ec4080.2479805/):
  smoke-diff-overview-harness timed out at awaitGridCondition
  (PtyTestDriver.ts:483), retried and failed. 354 touches only welcome
  text + move-line smoke — no diff code.
- Conductor ran smoke-diff-overview-harness on main directly: ALL-PASS.

## Outline (when a second distinct sighting confirms)

#529/#531 method: loop the failing step solo with an autopsy probe
(which clock each side reads), reproduce under 3-4x contention, fix the
wait or publisher, never the timeout. This is a NEW smoke — its own
race, not the panel/scrollbar/popup families.

- gate-553-r2 (2026-08-14, /tmp/merge-gate-failures.6c717759369dd38e.566755/):
  same timeout ("unstaged comparison labels the staged text as base and
  working as current"), branch adds only the new iv-harness/ directory —
  no diff code touched. Solo in the same worktree: green. Third sighting,
  all under gate load, never solo.

- gate-564 r1 (2026-08-14): fifth sighting, same timeout class, branch
  touches only iv-harness shapes/cli. Frequency now 5 gates in 3 days —
  priority case for the wait-census fix.
