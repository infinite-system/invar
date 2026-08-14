# READY — 557 graph miss did you mean

## In plain words

Asking the graph for a path that almost exists now suggests the real
one: get tasks.count answers "Did you mean 'tasks.counts'?" with the
full corrected path, ready to copy. Far misses stay suggestion-free
and just list the keys, so a wild guess never misleads.

## Delivered

- HarnessGraph.nearestKey: containment match first (count/counts),
  edit distance <= 2 fallback (lst/last), nothing beyond that.
- Suggestion carries the full corrected dotted path. Identical
  attached and cold (shared missMessage).
- Tests: suggest arm (3 shapes) + no-suggest arm; 26 total green.

## Invariants in scope (answered)

- All iv-harness records upheld; no store, arrow, or cache change —
  this refines the existing miss behavior only.

## Verification

Driven on the real CLI: tasks.count -> counts, task -> tasks,
lanes.dirt -> lanes.dirty; far miss shows keys only. Gate GREEN
(GATE_EXIT=0, /tmp/gate-557.log, 0 FAILs).

## Bycatch

None observed.
