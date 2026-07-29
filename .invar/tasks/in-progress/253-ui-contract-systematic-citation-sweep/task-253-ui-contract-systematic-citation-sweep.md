# 253 — the systematic sweep: every ui.invariants.md citation AST-verified

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

The verdict from two rounds of spot repair (#239: six sites; #243: five
more, plus a fourth dead path found by a mere path census): the
neighborhoods keep yielding, so rot is NOT exhausted and spot repair has hit
its limit. This task is the sweep both reports asked for.

Enumerate EVERY citation in `src/modules/ui/ui.invariants.md` — Mechanism,
Evidence, Scope, and Verification sections — and verify each named path
exists AND each named symbol is owned by the cited file (AST, via
`bun scripts/ast-query.ts identifiers <name> --tests`; existence checks
cannot validate ownership). Repair what fails, with #239/#243's method:
read the owner before the edit, positive control, stable lattice counts.

Known seeds from #243's bycatch, fix them inside the sweep:

- `ui.invariants.md:767` cites the missing
  `src/modules/keybindings/__tests__/registry.test.ts`; the current test is
  `src/modules/keybindings/KeybindingRegistry.test.ts`.
- `src/modules/ui/SelectableText.ts:7` still claims rows equal
  `documentLine - scrollTop` (folding/wrap need
  `EditorPane.visualRowsWindow`); `:10` claims `setLocalSelection` applies
  the selection (current: `lastLocalSelection` + `refreshLocalSelection`).
- `src/modules/ui/RootView.ts:1716`/`:1738` cite the short form
  `(ui.invariants.md)`; convention requires root-relative. ALSO: the checker
  ACCEPTS the short form — evaluate making it refuse (a checker that accepts
  a form the convention forbids is a gap in the instrument; if you change
  the checker, both control arms per the apparatus rule).

Report shape: a table — citation, kind, verdict (valid / repaired /
removed), evidence pointer. The exhaustion claim this time must be earned:
"every citation verified" is checkable from the table.

## Invariants in scope

- `src/modules/ui/ui.invariants.md` — the whole file.
- `src/modules/ui/ui.lattice.md` — 217 links stable, counts quoted.
- The checker itself if the short-form decision changes it.

## Bycatch expected

Per AGENTS.md's taxonomy — the contract-boundary gap especially: #243 found
the header's claimed scope (`src/modules/ui/`) no longer matches owners in
editor/filetree/git; that evidence belongs to #241 (the user's split
decision), report anything more you find toward it.

## Sources

- `report-243-...md` — "Is the rot exhausted?" and Bycatch.
- `report-239-...md` — the method precedent.
