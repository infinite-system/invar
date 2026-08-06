# Task 504 — structure uninstall does not withdraw its pane

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words

Uninstalling the Structure Navigator through Extensions sometimes
leaves its pane and status projection in place: the smoke times out
at "uninstall removes the structure pane and withdraws its
projection". This is the real defect behind the plugin-manifest
contention residual that has stained gates for days. It reproduces
SOLO on plain main now.

## Evidence (2026-08-04, conductor)

- bash scripts/smoke-plugin-manifest.sh on MAIN, solo: exit 1 at the
  named assertion (log /tmp/pm-main-solo.log).
- Same assertion inside behavioral-contracts on the #461 worktree,
  twice solo.
- History: #356 rounds proved this red at merge base twice
  ("Structure Navigator uninstall timeout" / "dirty manifest editor
  focus"); the contention tier has flagged plugin-manifest in nearly
  every gate since 2026-08-03.

## Wanted

Reproduce by driving Extensions uninstall of Structure Navigator;
read the graph at the timeout (contributor disposer state, pane
registry, projection registration); establish whether withdrawal is
racing, leaking a disposer, or the smoke's wait is watching the wrong
condition. Fix product or instrument per the evidence; ratchet.

## Companion chore from #494 (2026-08-04)

While in the monitoring/system area: MonitoringStats.writeLogLine
enforces "Observability never crashes the app" with prose only — add
the invariant: annotation, and the record's Scope should name the
monitoring log writer alongside StatusChannel (a refines; propose).
