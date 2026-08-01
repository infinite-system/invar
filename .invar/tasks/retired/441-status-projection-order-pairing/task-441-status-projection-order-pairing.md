# Task #441 — panelContentIds and panelContentLabels can disagree

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: RETIRED — folded into #452, 2026-08-01

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

## Retired: folded into #452

USER RULING 2026-08-01: fold into #452 (pane identity collides by
name). Same root — identity carried by name and position instead of by
a stable id. Fixing the pairing without fixing the identity would
treat a symptom of the same defect twice.

Every requirement moved verbatim into #452's task file. No branch was
ever cut for this task.
