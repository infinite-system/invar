# Brief #390 round 1 — the left dock gets the same proportional bound

## Evidence (from the #383 builder, driven every 80x24 run)

At 80x24 the LEFT dock group takes 37 of 80 cells — wider than the
editor. The right dock was fixed in #383 with two bounds at
LayoutModel.resolve (at most 30 percent of the row; at most one column
under an even split of the shared columns; smaller wins; stored width is
a REQUEST, never rewritten). Same generator, same shape — generalize it
to the left dock group, or extract one bound helper both docks use
(prefer the shared generator if the code duplicates).

## Method

Drive 80x24, 100x30, 120x36 before/after with the #383 probe pattern
(the probe is in the completed 383 task folder — extend it to read both
docks). The editor must be the widest actor at every geometry. Dragged
widths inside the bound are granted in full; a narrow terminal clamps
without rewriting the setting; resize back restores the request. Extend
the layout smoke's proportional arms to the left dock. Positive control
proven red.

## End state

Commit BEFORE READY; report in the main checkout's in-progress folder;
header carries commit hash + GATE_EXIT from the hook.

## Invariants in scope

- The right dock stays a bounded minority of the row — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — likely REFINES into a both-docks record (propose wording; dependency ripple per the contract rules).
- Layout slots derive from one configuration — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md).
- A reported size never leaves its configured bounds — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — task 391 owns the known host-write gap; do not fix it here, but do not widen it.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
