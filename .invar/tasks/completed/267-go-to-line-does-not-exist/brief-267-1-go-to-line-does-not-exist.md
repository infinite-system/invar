# Brief — #267: build go-to-line (it never existed)

Read first: [task-267-go-to-line-does-not-exist.md](task-267-go-to-line-does-not-exist.md)
— the record governs. Background: a task file asserted "verify go-to-line
still works" for a feature that never existed; deliverable 1 builds it,
deliverable 2 (the premise lesson) is already recorded — nothing to do.

Build the IDE staple:

- Command `editor.goToLine` + default binding Ctrl+G through the
  commands/keybindings seams (respect existing binding conventions —
  check Ctrl+G is free first; if taken, report and pick the convention-
  consistent alternative).
- A small prompt through the SHARED single-line text-field painter (one
  painter law — no new input widget).
- Accepts `line` and `line:column`; clamps to the document; invalid
  input states the miss without jumping.
- Records BOTH jump ends for Back/Forward per the #35 jump convention.
- Works at 100k lines (driven).

Both polarities per arm: a valid jump lands (cursor + viewport in
reading view); an out-of-range line clamps; a malformed entry does not
move the cursor. Positive control each.

## Invariants in scope

The commands/keybindings records; the one-painter record (single-line
fields); the navigation/jump records #35 cited — locate their actual
contract homes, don't assume.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: the command + binding + prompt driven at 10 and 100k with
both polarities and positive controls, jump ends recorded and driven
through Back/Forward, green `bun test` + editor smokes. The conductor
gates at landing.
