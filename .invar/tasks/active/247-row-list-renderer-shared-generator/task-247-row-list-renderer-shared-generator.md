# 247 — three pane renderers share one "listed rows with item-anchored selection" generator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: distillation

## Outline

Bycatch of #35. `TreePaneRenderer`, `StructurePaneRenderer`, and (by family
resemblance) `GitPaneRenderer` share the row loop: window slice, indent,
mark, width-clamp, pad, selection-over-hover background, focus-dimmed
intensity. One generator likely underlies all three.

ANALYSIS FIRST, then a small extraction only if the analysis proves one
generator. The seam-at-shared-generator rule cuts both ways: if the three
loops differ in load-bearing ways (the tree scrolls horizontally, the
outline does not; git rows carry status glyphs), the honest deliverable is a
recorded SHAPE (like #230's lattice recurring-shapes section), not a forced
base class. The report must name which parts are the generator and which are
per-pane geometry.

Done-test if extraction happens: the three renderers consume the shared row
generator; no renderer re-rolls the selection/hover/dim policy. If analysis
says stop: the recorded shape names all three sites and the divergences.

## Invariants in scope

- ui records naming row rendering/selection; [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md);
  filetree and git domain records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- [report-35-structure-navigator-plugin-pane.md](../../completed/35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md), Bycatch item 3.
