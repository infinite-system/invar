# Brief — #35: the structure navigator pane — THE PROOF TASK

Read first, in order:
1. [.invar/tasks/active/35-structure-navigator-plugin-pane/task-35-structure-navigator-plugin-pane.md](task-35-structure-navigator-plugin-pane.md)
2. `report-220-...md` in #220's completed folder — the contributor shape you
   follow (manifest, uninstall symmetry, named host ports, the
   EditorColumnDefault vs EditorSurfaceContents distinction).
3. `report-219-...md` — PaneContent + native-surface; #114's reports — the
   plugin kinds.

## Why this task is the proof

The whole modularity campaign claims: a NEW citizen lands with ZERO host
edits. You are the first new citizen since the seams were finished. If you
touch `src/modules/ui/`, `src/modules/app/`, or `src/modules/workspace/`
at all, STOP and report WHICH seam forced it — that report is more valuable
than the pane. The done-test is mechanical:

```sh
git diff --stat <your-base>..HEAD -- src/modules/ui src/modules/app src/modules/workspace
# must be EMPTY (invariant-record citations excepted, and prefer none)
```

## The pane

A structure navigator: the document's symbol outline (functions, classes,
sections), navigable, in the primary dock beside files/git/extensions. Sources
of structure: the LSP provider seam where a language server offers symbols;
degrade honestly where none does (say "no structure available", never a blank
— the empty-affordance precedent). Selection jumps the editor to the symbol
through existing seams (the source-text view contract). Scale parity: outline
build cost must be proportional to what is observed, driven at 10/100k/500k.
Uninstall symmetry from day one, with the reinstall arm — #220's fourth-verse
lesson: prove it can come BACK.

## Invariants in scope

- *The editor column's default occupant is a contribution* ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
  — read-only precedent; you are a DOCK contributor, not the column.
- *A pane content projects through exactly one surface* ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
- The plugin-kind records from #103/#114 (`plugins`/`ui` records) — you are a
  contributor consuming a provider.
- `src/modules/lsp/` provider records — the symbol source.
- Expect to AUTHOR [src/modules/structure/structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) — a new
  domain gets its record (contract-layer-gap rule).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories — generator drift especially:
you are the first consumer of every seam in sequence, and any seam you must
bend is exactly what this proof exists to find. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

Exact exit codes: tsc, bun test, conventions-gate, prettier, check_invariants
(at or above the current floor), coverage ratchet. Drive the real pane at all
three scales; smokes green before and after; positive controls including the
uninstall/reinstall arm. Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored. Scratch tooling in your task folder.
