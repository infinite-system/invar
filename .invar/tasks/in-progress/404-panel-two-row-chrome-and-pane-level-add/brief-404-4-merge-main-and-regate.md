# Brief #404 merge round — merge main forward and re-gate the combined tree

Main landed AFTER your base: #390 (BOTH docks now share one proportional
bound in LayoutModel — the right-only record became "Each dock stays a
bounded minority of the row"; RootView wires live maximums for both
splitters; painted-width consumers read the resolved viewport), #402
(Invar Monitoring plugin — ApplicationContributions.activate wraps every
contributor's requestRender for per-plugin attribution; a new right-dock
'monitoring' content), #384 (quit dialog restyle), #389 (watch autowrap).
Your overlap: LayoutModel(.test), layout.invariants.md, RootView, the
layout and panel-chrome smokes.

Merge main into your branch; resolve BOTH SIDES' intents semantically:
- your two-row chrome heights + #390's dock bounds both hold in
  LayoutModel and its record file;
- RootView keeps #390's live dock maximums AND #402's render-attribution
  wrap AND your two-row wiring;
- the panel-chrome smoke keeps your new families plus main's;
- verify your panel rows did not break the monitoring dock content or
  the #390 bounded-minority arms.
Full gate on the combined tree, GATE_EXIT read from the hook, new report
with the merge hash and one line per conflict. Worktree clean; no push,
no land.

## Invariants in scope

Round-1 set plus: Each dock stays a bounded minority of the row —
[src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md); Render load is attributed at
the contribution boundary — [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
