# 248 — PaneContent.interface.ts header contradicts itself since #219/#220

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: contract-hygiene

## Outline

Bycatch of #35, which could not fix it (the proof task was forbidden host
edits — the collision between "no host edits" and "fix drift where you see
it" is itself recorded in the report).

`src/modules/ui/PaneContent.interface.ts`: the first header paragraph still
says the seam is "Deliberately NOT retrofitted onto the existing
editor/git/tree/markdown panes yet" while the second paragraph — and reality
since #219/#220 — says the tree and the editor ARE citizens. Two paragraphs
of one comment disagree.

Surgical: rewrite the header to state the current truth (which panes are
citizens, which are not, as of #220's manifest). Read the manifest first;
do not guess the citizen list. Nothing else in the file changes.

## Invariants in scope

- `src/modules/ui/ui.invariants.md` — if any record cites the header's
  claim, repoint it; lattice links stable after.

## Bycatch expected

Per AGENTS.md's taxonomy — comment drift especially: you are reading a file
whose header rotted once already; check its neighbors. The READY report
carries `## Bycatch` even if it reads `None observed`.

## Sources

- `report-35-structure-navigator-plugin-pane.md`, Bycatch item 4.
