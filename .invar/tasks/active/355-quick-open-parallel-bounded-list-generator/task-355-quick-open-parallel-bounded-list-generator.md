# #355 — quick open duplicates the bounded list popup generator

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #351 (suspect generator drift, 2026-07-30)

Quick Open implements its own query, window, row clipping, and hit mapping
in src/modules/ui/OverlayLayer.ts and QuickOpenRenderer.ts. The record
"Bounded list interactions live in one popup" (src/modules/ui/ui.invariants.md)
says bounded searchable list behavior belongs in BoundedListPopup.

## Work

Seam decision first, migration second. Quick Open also owns asynchronous
file enumeration and project navigation — decide where the seam sits (per
the seam-at-shared-generator rule: draw at the shared generator; reject
duplication AND over-unification). Propose the design in the report before
migrating; the #351 fix deliberately did not broaden into this.

## Note

Also log: one starvation-class retry in smoke-panel-split-harness
(panelContentOrder/panelCellIds wait, first attempt timeout, quiet retry
green, not reproduced). Flake evidence only; file separately if it recurs.
