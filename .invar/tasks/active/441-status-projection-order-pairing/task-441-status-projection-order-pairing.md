# Task #441 — panelContentIds and panelContentLabels can disagree

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: ACTIVE

## What

`AppStatusProjection` publishes `panelContentIds` from the raw
persisted order and `panelContentLabels` from live ordered contents.
With an unregistered ID in the order, the arrays differ in length and
index (#439 report, Bycatch GENERATOR DRIFT). Consumers pairing them
by index read wrong labels.

## Wanted

One generator for both arrays (live ordered contents), or a single
array of {id, label} objects. Audit status consumers for index
pairing before choosing.
