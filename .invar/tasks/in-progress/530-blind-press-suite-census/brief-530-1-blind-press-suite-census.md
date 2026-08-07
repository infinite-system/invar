# Brief 530-1 — the blind-press census

## In plain words

Three drives have now lost a mouse press by clicking where a control
used to be before the app redrew. Two were found one at a time, in
expensive gate rounds. Sweep the whole smoke suite once, find every
remaining press with no hover proof on a target that layout can move,
and fix the class.

## End state (mechanically checkable)

A report newer than dispatch containing the census table: EVERY
`press` gesture in scripts/harness/smoke-*.ts, each classified
STATIC-TARGET (safe: the target cannot move between aim and press) or
MOVED-TARGET (class C: layout can shift it), with file:line; every
MOVED-TARGET member fixed with the hover-verified aim pattern (park
off, await hover-tone drop, hover the target, await the reveal, press);
each fixed smoke green solo and under 3x contention.

## Prior art (reuse, do not reinvent)

- #529: fixed smoke-panel-chrome's two splitter edge drags; committed
  probes on its branch; the three-clocks diagnosis.
- #538 (just landed, 0cd8aab6): fixed the rapid-expand double-click;
  its smoke shows the current canonical hover-verified aim form.
- The census idea and classification rule are in
  .invar/tasks/active/530-blind-press-suite-census/task-530-*.md.

## The bar

The census must be COMPLETE (an AST or structural grep over every
smoke, not a spot check — name the query used); classification
evidence per row (why can/cannot the target move); no timeout widening;
a fixed smoke's positive control is the old blind form failing under
the probe loop (the #538 probe pattern). If a MOVED-TARGET press is
genuinely safe for a named reason (e.g. the press itself is what moves
it), argue it in the table instead of fixing blind.

## Invariants in scope

"Rendering is one coarse frame effect"
([app.invariants.md](../../../../src/modules/app/app.invariants.md)) —
context only; this task changes no app code. If the census reveals an
APP surface with no hover reveal (making hover-verified aim impossible
there), that is bycatch for the instrument asks in #522/#530 notes,
not scope.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
