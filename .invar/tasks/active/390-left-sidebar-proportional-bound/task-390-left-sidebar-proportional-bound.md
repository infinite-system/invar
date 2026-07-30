# #390 — the left dock group gets the same proportional bound

State: ACTIVE
Priority: performance-behaviour
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Origin

Bycatch from #383 (right panel proportional). Builder's evidence: at 80x24
the LEFT dock group takes 37 of 80 cells — more than the editor — on every
drive, before and after the right-dock fix. User-visible on small terminals.
The generator is the same `LayoutModel.resolve`; the same two-bound shape
(percent-of-row cap + never-exceed-editor-share) applies. #383's new record
"The right dock stays a bounded minority of the row" is the model; this task
likely generalizes it to both docks or adds the left sibling.
