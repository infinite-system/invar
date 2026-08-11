# 547 — bounded list popup wheel flake

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The bounded-list-popup drive times out on its wheel-scroll wait under
gate load, on branches that never touch the popup. Two sightings in one
contention window; a third dispatches this (the #531 evidence-hold rule).

## Evidence (2026-08-11, one 3-gate window)

- gate-522 window (/tmp/merge-gate-failures.868b1bb114d9a50b.1638619/):
  "wheel scrolling changes the visible popup list or reveals its tail",
  retried and still red. #522's builder proved by byte-census this is
  NOT its diff (18 clean solo+3x runs; chord change added forms only).
- Same window, #543 branch (/tmp/merge-gate-failures.e2e6c1b3c871edfe.1638618/):
  SAME smoke, different step (popup never opened).
- Earlier: #542 branch (/tmp/merge-gate-failures.6085f6c39f70467b.1521848/):
  the identical wheel wait — a branch with none of the above code.

## Outline (when third distinct sighting confirms)

#529/#531 method: loop the wheel step solo with an autopsy probe (which
clock each side reads), reproduce under 3-4x contention, fix wait or
publisher, never the timeout. Note: the log dirs above already give
three sightings — this is dispatch-ready.
