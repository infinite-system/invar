# Brief 518-1 — the live tasks pane matches tasks:watch

## In plain words

The in-app live tasks pane is inadequate next to `bun run
tasks:watch` — make them IDENTICAL, ideally through one shared
rendering generator, and bring the pane up to doctrine: hover-only
buttons, whole-group hover, full-line row coloring, scrolling, and
copyable text. [The task file](task-518-live-tasks-pane-matches-tasks-watch.md) carries the four verbatim
items + the design constraint.

## Reproduce by DRIVING first

Drive BOTH renderings before changing anything: the pane (open the
tasks module in-app) and tasks:watch (a terminal pane running it) —
capture both layouts, diff them, and screenshot the uncolored
end-of-line cell (cell-color read) and the split hover (name row
highlights, sibling row does not). Those sightings are your baseline
and your report's before/after.

## The work

Per the task file. The bar: side-by-side identical layouts; ONE
rendering generator (fork = coherence-negative; justify whatever
seam you cut); ui-design chapters 1 (one geometry per control,
hover grammar), 5 (scroll), 6 (copy) — cite them per surface in the
report. Adversarial protocol: hover sweeps across every row and the
gap rows; scroll at 10 and 100k fixture scales; select+copy verified
via clipboardEmissions; fast hover-in-out repeats; rows
appearing/disappearing while hovered (tasks state changes live —
what happens to your hover target when the row moves?).

## Invariants in scope

- Panel controls share paint and hit geometry; A pane is a
  self-contained scrollable viewport ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) / [project.invariants.md](../../../../project.invariants.md))
- One generator owns each scroll position ([src/modules/ui/scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md))
- Copy reaches the host terminal ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md))
- Tasks module records ([src/modules/tasks/tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md)) if implicated.
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
