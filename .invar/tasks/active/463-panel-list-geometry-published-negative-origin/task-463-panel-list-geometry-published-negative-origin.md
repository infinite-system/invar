# Task 463 — panel list geometry published negative origin

Priority: architecture-hygiene
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
Source: bycatch from #459 (panel reachability), reported 2026-08-02

## The sighting

In one expanded-panel state a diagnostic tasks drive published:

```text
panelListGeometry: left=-24, top=0, width=24
```

while `+ Terminal` actually painted at screen column 108 and the
`Displaced: Claude` row painted at screen row 30. The published origin is
negative and disagrees with every painted cell.

#459 made the shared close gesture follow painted cells, so nothing
currently consumes the wrong origin. That is why this is hygiene and not a
live defect — but a status projection that publishes an impossible origin is
a trap for the next consumer, and status projections are how agents drive
this app.

## The job

Find the seam that computes `panelListGeometry` and make it publish the
geometry that was painted, or publish nothing when it cannot. A negative
left origin for a visible list is the `Impossible if true` a record should
already forbid — check whether one does, and propose it if not.

Both arms: the published geometry must match painted cells in the expanded
state AND in the collapsed state.
