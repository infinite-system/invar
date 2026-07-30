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
