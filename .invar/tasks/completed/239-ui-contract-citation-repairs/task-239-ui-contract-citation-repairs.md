# 239 — repair [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md): dead symbols, wrong paths, duplicated paragraph

State: COMPLETED — 83695510 — six citation repairs, AST-verified owners, duplicated paragraph removed; 993/217/0 stable; three more rots found reading neighborhoods -> #243
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #230, one contract-only pass, ~6 edits, all evidence exact in its
report:

1. Three symbols cited by records exist nowhere in `src/`:
   `renderEditorStyled`, `renderTree`, `renderGitPanel` (grep-verified). The
   behaviors hold — the work moved into `FileTreePaneContent` /
   `TreePaneRenderer` / the pane-content extraction; only citations rotted.
   Repoint the Mechanism/Evidence text of *Only the visible window is
   rendered*, *A scrollable pane height is an input not an output*, and
   *Selection is item-anchored click-set keyboard-moved and stays* at the
   current owners.
2. Two wrong module paths: `ui/EditorPaneRenderer.ts` and `ui/EditorPane.ts`
   at `ui.invariants.md:719`, `:720`, `:1822` — both live under
   `src/modules/editor/`; line `:1390` already cites the correct path. One
   contract, two answers; make it one.
3. Delete the duplicated selection paragraph at `:1531-1545` (the mouse
   addendum restated ~15 lines later — an editing artifact, not two rules).

Checker at zero problems after; the lattice ([ui.lattice.md](../../../../src/modules/ui/ui.lattice.md)) must still
resolve every link — run `--all --refs` and quote counts before/after.

## Invariants in scope

- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the subject.
- [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) — must stay fully woven after the edits.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-230-...md` in #230's folder — exact lines and grep evidence.
