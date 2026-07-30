# #335 — gate smoke intermittents: scrollbars wrap-off thumb + tasks:watch motion row

State: IN-PROGRESS
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## What happened

Two blocking smokes failed twice each on 2026-07-30, on code content that also
gated GREEN the same night. Both sightings are recorded. Neither has an open task.

Sighting 1 (~01:2x): a gate run under dual-writer load, killed by a 2m shell
timeout mid-run. Both smokes showed FAIL. Recorded in
[project.briefing.md](../../../../project.briefing.md) anchor 13.

Sighting 2 (01:52): a mostly quiet gate run (pre-commit hook on a doc-only
commit, main = 56b4b377 + landed #322 content, 6-worker pool, no builders
live). Both smokes failed again. The identical code content (combined tree
813bc7f3) gated GREEN at 00:55 in #322's own gate.

## The two failures

1. `smoke-scrollbars-harness.ts` arm "wrap-off vertical thumb remains present
   in every scroll frame" (throw at line ~1466). Contradiction worth noting:
   the SAME run passed "wrap-off vertical thumb length is byte-identical
   through the document (extent 2 across 70 frames)". So the thumb was present
   with stable extent in the 70-frame drive, then a later observation found a
   frame without it. The DIAG column dump is in the preserved log.
2. `smoke-terminal-harness.ts` arm "real tasks:watch advances a live motion
   row without a ledger change" — timed out on BOTH the first attempt and the
   quiet retry (timeout-class retry). This is #329's area (tasks:watch
   animation tick restored, landed b8cfdc62 tonight). The motion row never
   advanced without a ledger change during the wait window.

## Evidence in this folder

- `smoke-scrollbars-harness-.log` — full failing run with DIAG column dumps.
- `smoke-terminal-harness-.log` and `-.attempt1.log` — both timeouts.

## Brief shape (when dispatched)

Reproduce by DRIVING first, per the primary loop. Rank rival hypotheses; do
not confirm one cause:

- scrollbars: (a) a real transient frame where the thumb is not painted
  (product defect at a paint boundary), (b) the assertion observes a frame the
  drive did not settle (instrument), (c) pool-load-only timing that a quiet
  solo run cannot reproduce (ordering/environment).
- tasks:watch: (a) #329's tick fix does not tick under pool load (product),
  (b) the wait's condition ("advances without a ledger change") is
  pre-satisfied or unreachable under some ordering (instrument — the
  unreachable-wait family), (c) the harness child process starved by the
  6-worker pool (environment).

A solo green does NOT clear either red. Use deliberate contention as a probe.
Judge with counts, never widened timeouts.

## Invariants in scope

To be derived at dispatch. Candidate: scroll records in
src/modules/ui/scroll.invariants.md (thumb presence), the watcher-clock
record gap noted in #330.
