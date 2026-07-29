# 246 — the settings→MomentumOptions mapping is re-rolled; unify at the shared generator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: distillation

## Outline

Bycatch of #35. `FileTreeWorkspace.flingMomentum`
(`src/modules/filetree/FileTreeWorkspace.ts:40`) and
`StructureWorkspace.flingMomentum`
(`src/modules/structure/StructureWorkspace.ts:44`) build the same
MomentumOptions record from the same five settings, line for line. The
generator is one: settings-sourced fling physics. A third copy arrives with
the next scrolling pane (#235's dashboard is already queued).

Per the seam-at-shared-generator rule: draw the seam AT the generator —
one settings→MomentumOptions mapping in the momentum (or settings) module,
both call sites consume it. Reject over-unification: if the two sites
genuinely diverge in any option, the report must say so and stop instead of
forcing them together. Mind #224 (Momentum ambient clock) — do not absorb
its scope; coordinate if the seam touches the same lines.

Done-test: one mapping site; both workspaces consume it; a grep census for
the five setting names in workspace files returns only the generator.

## Invariants in scope

- The momentum/scrolling records that name fling physics; the filetree and
  structure domain records if they cite the mapping.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- [report-35-structure-navigator-plugin-pane.md](../../completed/35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md), Bycatch item 2.
