# #392 — layout contract hygiene: member-name drift + missing lattice

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #383 bycatch (contract layer)

1. COMMENT DRIFT: "Default panel height scales with the viewport" in
   layout.invariants.md names `defaultBottomPanelProportion`; the member is
   `DEFAULT_BOTTOM_PANEL_PROPORTION`. Fix the citation.
2. LATTICE GAP: src/modules/layout now holds 10 records (pure SplitterModel
   + whole-viewport LayoutModel, incl. two width/height sibling records)
   with no layout.lattice.md. scroll.lattice.md in src/modules/ui is the
   model. Author it (derived, never legislative).

## Folded in from #387 round 4 (2026-07-30)

ui.invariants.md cites the DELETED PanelSeparatorRow in three places:
Mechanism near line 372, Evidence near line 389, Verification near line
400 (names a test file that cannot run). Repair citations to PanelTabBar
equivalents.

## Folded in from #391 bycatch (2026-07-31)

Sibling record "Only a drag in progress moves the size"
(layout.invariants.md) has wording narrower than its mechanism:
construction and explicit host synchronization (the #391 seam,
88e01cc9) also move the stored report. Refine the record's scope to
cover all three movers.
