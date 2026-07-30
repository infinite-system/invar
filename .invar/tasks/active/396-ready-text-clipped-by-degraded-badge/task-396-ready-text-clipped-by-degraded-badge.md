# #396 — dashboard READY text clips when a DEGRADED badge fills the bounded dock

State: ACTIVE
Priority: performance-behaviour
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #346 round-2 bycatch (reproduced 3x: twice in hook, once standalone)

With the right dock at its new bounded width (#383), the tasks dashboard's
"! DEGRADED" badge can consume the remaining row width so the final READY
text lands outside the visible grid. Display defect in the dashboard row
renderer (no truncation/priority rule for badge + status on a narrow row).
Fix with a row-budget rule: status text survives, the badge truncates or
abbreviates. The #346 smoke observation change (scroll-transition wait) is
already on that branch; this task fixes the RENDERER.
