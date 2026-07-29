# 299 — the structure filter is not a real input: no selection, no Alt+Backspace — use the shared generator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: USER-DIRECTED (2026-07-29 ~17:1x, verbatim)

## Outline

User, verbatim: "search in structure is not selectable and not alt +
backspaceable, should use the shared input text generator."

The structure pane's filter field is a bespoke text row: text cannot be
selected, Alt+Backspace word-delete does nothing. The one-painter law
already names the fix: the SHARED single-line text-field generator
(the same seam #267 is using for the go-to-line prompt) owns
selection, word-wise editing, and paint.

Arms:

1. Replace the bespoke filter input with the shared single-line
   text-field component; the filter's live-filtering behavior, its
   placement next to the ⛭ depth gear (#281), and its clear-on-escape
   semantics (whatever the current contract says — locate it) survive
   unchanged.
2. Driven: selection works (shift+arrows + copy), Alt+Backspace
   deletes a word, plain Backspace a char — in the structure filter
   specifically, both themes, real PTY.
3. Census: any OTHER bespoke single-line input still not on the shared
   generator (the seam-at-shared-generator law: name them in the
   report; fix only the structure filter here unless another is a
   one-liner).

Both polarities: the filter still filters as-you-type; a selection
delete removes only the selection.

## Invariants in scope

- The one-painter/single-line-field records; structure records
  (#274/#281 — filter + gear row); #267's prompt work (SAME shared
  seam — coordinate, land after or rebase on it if it lands first).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:1x (verbatim above).
