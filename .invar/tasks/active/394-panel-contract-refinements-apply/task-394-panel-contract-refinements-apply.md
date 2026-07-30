# #394 — apply the panel record refinements the tab-bar redesign proved

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #346 report (propose-only; apply after #346 lands)

Three ui.invariants.md records need the proposed rewordings from the #346
report (management-list mirror + count chip; per-workspace space order and
pane order sequences; pane regions inside the active space with the tab row
as the only persistent chrome). Plus the named gap: no record states that a
content space is a multi-pane container, or distinguishes space order from
pane order. Take wordings from the #346 report verbatim, re-run the checker
and the annotation coverage for the touched records.
