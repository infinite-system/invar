# 243 — ui contract sibling rot, round two: three more drifted citations

State: COMPLETED — 44d8def4 — five citation repairs AST-verified; 1027/217/0; rot NOT exhausted — systematic sweep filed
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #239 (which fixed the six sites #230 found, then read the
neighborhoods and found three more):

1. `ui.invariants.md:1777-1787` cites `src/modules/workspace/GitPanel.ts` and
   its test; both live under `src/modules/git/` now.
2. `ui.invariants.md:1522` says `RootView` owns the editor code renderable and
   `applySelection`; `SourceTextPaneContent` constructs the renderable and
   `EditorPane` applies the selection since #219.
3. `ui.invariants.md:1411` places palette-list rendering in `RootView`;
   the `commandPalette` projection identifiers live in `OverlayLayer`.

Same method as #239: read each replacement owner before the edit, AST-verify
ownership, positive control (planted wrong path, checker names it), zero
problems and stable lattice-link count after. Consider whether a THIRD round
is likely — if your neighborhood reading finds more, the report should say
whether rot is now exhausted or whether a systematic sweep (every citation in
the file verified by AST) is the honest next step; that sweep may be its own
task.

## Invariants in scope

- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the three sites.
- [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) — links stable (217) after.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-239-...md` in #239's folder, Bycatch (exact lines).
