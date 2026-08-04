# Brief 499-1 — smokes must not hide their failure evidence

## In plain words

Two smoke-output defects destroy diagnosis. First, the terminal smoke
runs unit tests in a child and discards its output — a failure prints
one label and nothing else. Second, the keyboard smoke silently
reuses artifacts/home, so profile-dependent failures look like code
bugs (a false green cost the #356 stack a full round). Fix both, then
sweep every smoke for the same two patterns.

## The work

1. smoke-terminal-harness.ts (~line 715): the Bun.spawnSync unit run
   pipes stdout/stderr and never prints them — on nonzero exit, print
   both before failing.
2. scripts/smoke-keyboard-invariant.sh (via tui-harness.sh): print
   the resolved harness home and the starting panelContentOrder at
   the top of the run, so fixture-dependent results self-describe.
3. SWEEP: grep all smokes for (a) spawned children whose output is
   piped and dropped on failure, (b) reused persistent homes with no
   self-description line. Fix each site the same way. Report the
   sweep table (file, pattern, fixed/clean).

## Evidence

- [Task #499 file](task-499-terminal-smoke-hides-unit-failure-output.md) — the gate-493 red whose
  identity was destroyed (log preserved), and the #356 r4 companion
  ask.

## End state

Both named smokes show the new output lines in a bare run; a planted
child-test failure prints the child's actual output (positive
control); sweep table in the report; full smoke set untouched
otherwise.

## Invariants in scope

- Every wait names itself; Harness waits observe conditions
  ([scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)) — output hygiene only, no
  wait semantics changes. Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; your worktree commits skip the full
gate by the planted policy (or SKIP_GATE=1 if absent); the conductor
gates and lands.
