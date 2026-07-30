# Brief #393 round 3 — user evidence: hidden tasks pane still burns

After your merge round lands its gate, take this before READY.

## The evidence (user, verbatim)

"also invisible tasks pane still draws cpu in same workspace, if you
switch to another pane it does decrease, but on the workspace even if
you hide tasks it doesn't stop the CPU, it keeps polling or rendering
or whatever"

## The hypothesis (conductor, from reading the code — verify, then fix)

TasksDashboardOverview gates BOTH timers on dependencies.isObserved()
(onObservationChanged + in-tick checks — the #380 fix). So the hole is
likely in what isObserved DERIVES FROM: selected-content vs painted.
Suspected state: the tasks pane is the selected content of its dock and
the user HIDES the dock (or otherwise makes it unpainted) — isObserved
stays true, the 1s data heartbeat keeps polling (readTaskRecords + tmux
probes — cost scales with the REAL task tree: 250 folders here, tiny in
our fixtures, which is why the round-1 matrix was quiet), and switching
to ANOTHER pane is what finally flips it false. Matches all three
clauses of the user's sentence.

## Work

1. Enumerate the hide paths for the pane that hosts tasks (dock toggle,
   panel collapse, tab switch, workspace switch) and for each, drive it
   and record isObserved + timer state + CPU delta with a REAL-SHAPED
   fixture (hundreds of task folders, a few tmux-probed sessions — build
   the fixture, do not use this repo's live tree as a workspace).
2. Fix at the derivation: observed = painted (the same generator the
   panel uses to decide painting), not selected. All hide paths must
   flip it.
3. Extend the idle contract: for EACH hide path, hidden tasks pane =
   zero dashboard timers, with the real-shaped fixture. Positive control
   per path class.

## Invariants in scope

- Dashboard motion exists only while observed — src/modules/tasks-dashboard/tasks-dashboard.invariants.md — REFINES: "observed" must mean painted; propose the wording.
- Cost tracks the actively observed set — project.invariants.md.
- Others unchanged from round 1.

## Bycatch expected

Per AGENTS.md's taxonomy; carry the section even when it reads None
observed.

## Addendum (user, same day, VERBATIM)

"yes, it should not be polling at 30% CPU lmao, that's too much"

Two requirements, not one: (1) hidden = zero, as briefed; (2) even when
VISIBLE, a 1-second data tick costing ~30% CPU on a real tree is a
defect in the tick itself — profile WHERE the tick spends (readTaskRecords
full-tree re-walk? tmux probes per session? row rebuild?), then make the
observed-cost proportional: watch/mtime-guarded incremental reads, probe
only sessions whose rows are painted, rebuild only changed rows. Target:
a visible idle dashboard on a 250-folder tree stays low single digits.
