# Task 505 — Quick Open does not open while a comparison holds focus

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## In plain words

With the git comparison view focused, Ctrl+P does nothing: Quick Open
never opens. Reproduced by #371 in loaded AND solo sequenced probes
(same final state both ways). Related but distinct: #498 deliberately
left Ctrl+P pane-owned for TERMINALS (readline byte); a comparison
view is not a terminal — it has no child to feed, so the chord dying
there is a hole, not a design.

## Evidence

- #371 report Bycatch (completed folder): "Control+p did not open
  Quick Open after the node_modules comparison gained focus."
- #498's decisions table (completed folder) documents the Ctrl+P
  terminal reasoning — use it to draw the boundary: pane-owned only
  where a child consumes bytes.

## Also sweep (same shape, one sighting)

#498 bycatch: Ctrl+Shift+O did not open the folder picker while
Files held focus (seen once). Verify and fix or refute in the same
pass — it is the same "frame chord dies on a focused surface" family.
