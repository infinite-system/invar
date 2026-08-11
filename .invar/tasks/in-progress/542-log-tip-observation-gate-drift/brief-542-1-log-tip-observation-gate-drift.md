# Brief 542-1 — restore the git log-tip observation gate

## In plain words

The contract promises a hidden git panel costs nothing. The code lost
that promise: with a non-checked-out branch selected in the log view, a
hidden panel runs one git subprocess every five seconds. Put the gate
back and update the contract's stale state name.

## The specification

[tmp/TASK-log-tip-observation-gate-drift.md](../../../../tmp/TASK-log-tip-observation-gate-drift.md)
is the finding, verbatim. The conductor picks RESOLUTION 1 (restore the
gate): "Cost tracks the actively observed set" is a project record —
the contract was right, the code drifted. Do not take resolution 2.

## The deliverable, twice

CODE: an early return in `GitWorkspace.reconcileLogTip` on the current
git-panel observation predicate (find what replaced `sidebarView` — the
spec suggests the dock host's painted-content check, same shape as
DatabaseConsumerWorkspace's isObserved; verify by reading BOTH sites);
the record "The commit log follows repository reality" updated to name
the CURRENT state (a refines-with-evidence, declared record-by-record
in your report); its impossible ("hidden panel spawning tip probes")
becomes true again.
VISUAL: no visible change (the visible git panel behaves identically).

## The bar

- Reproduce FIRST by driving: select a non-checked-out branch in the
  log view, hide the panel, count `git rev-parse` spawns over ~15s
  (process census or spawn-seam instrumentation) — the leak must be
  SEEN before fixed, then seen dead after.
- Positive control: with the panel VISIBLE and a non-HEAD branch
  selected, the probe must still fire (the gate must not over-close) —
  drive the log staying correct when the branch moves.
- Both scales not required (no per-line cost) but drive the panel
  hide/show cycle and workspace switch.
- Full bun test + the git smokes green.

## Invariants in scope

- "The commit log follows repository reality"
  ([git.invariants.md](../../../../src/modules/git/git.invariants.md))
  — the drifted record; refines with the code fix.
- "Cost tracks the actively observed set"
  ([project.invariants.md](../../../../project.invariants.md)) — the
  parent rule being restored; answer it.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
