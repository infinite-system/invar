# 299 — the structure filter is not a real input: no selection, no Alt+Backspace — use the shared generator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
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

## Scope extension (user, 2026-07-29 ~17:1x, verbatim)

"it is also not copyable but should be copyable everywhere, also
shift + arrows should allow selection like editor, so i think we have a
primitive but it must be applied everywhere in all text inputs to make
uniform, like breadcrumb search also is not copyable thought you can do
alt+backspace to delete, also I like the active search state of
structure better, it should be ported to the breadcrumb search but with
input capabilities extended/fixed"

This RAISES the census arm from name-them to FIX-THEM-ALL:

4. **One primitive, applied everywhere.** Every single-line text input
   in the app (structure filter, breadcrumb search, find, go-to-line
   prompt, settings edit fields, quick open — census finds the full
   set) rides the ONE shared generator and therefore uniformly has:
   selection via Shift+arrows (editor-like), copy of the selection,
   Alt+Backspace word-delete, plain edit keys. The capability set is
   asserted ONCE at the generator's contract and each input's driven
   arm proves wiring, not re-implementation.
5. **Breadcrumb search specifically**: currently Alt+Backspace works
   but copy does not — it joins the generator. AND the user prefers
   the structure filter's ACTIVE SEARCH STATE (its engaged visual
   state); port that state to the breadcrumb search while extending
   its input capabilities. One visual vocabulary for "search is
   active" across both.

Both polarities everywhere: copy copies exactly the selection;
inputs that legitimately differ (multi-line editor) are OUT of the
single-line census.
