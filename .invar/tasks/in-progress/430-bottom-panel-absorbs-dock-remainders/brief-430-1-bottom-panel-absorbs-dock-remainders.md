# Brief 430-1 — bottom panel absorbs every dock remainder

Read the task file: user's verbatim ruling + the conductor's probe
table are the spec. The rule: a dock that ends at the panel yields
its columns to the panel below; blank remainder slots must not exist.

Work order:
1. Reproduce by DRIVING with the conductor's probe
   (tmp/probe-430-preset-spans.ts on main; note the press/release
   mouse gotcha recorded in the task file). Confirm the before table.
2. Find the composition seam: where LayoutModel/RootView compute
   primaryDockRemainder and rightDockRemainder and where bottomPanel
   width is set to the editor span. Make the panel absorb each
   remainder whenever the corresponding dock ends at the panel —
   for every preset AND hand-set span combination (leftSpan/rightSpan
   are independent; cover all four combinations).
3. The panel splitter, tab row, and panel content all follow the new
   width (bottomPanelSplitter/bottomPanelTabs spanned W54 in the
   probe — they must track the absorbed width; hit geometry from the
   same projection).
4. Drive again: all four span combinations, before/after table in
   the report. Centered panel: bottomPanel spans L4 W116 at 120
   columns. Default: panel extends under the right dock. Total
   tiling still exact (the smoke's area assertions).
5. Ratchet: extend smoke-layout-harness.ts per-preset span
   assertions: no remainder slot has nonzero area while its dock
   ends at the panel; panel width equals viewport minus full-height
   flanks. Condition waits; planted-defect red proven.
6. Update [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md): refine or add the record for the
   rule ("a dock that ends at the panel yields its columns to the
   panel"); keep the #391 record upheld (report==paint at the new
   widths).
7. Verification: tsc, focused tests, layout smoke, checker
   --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
with both tables.

## Invariants in scope
- [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md): "Layout slots derive from one configuration", "Default panel height scales with the viewport", "Each dock stays a bounded minority of the row", and the #391-refined bounds record — answer each.
- "Splitter paint and hit testing share one geometry" ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
