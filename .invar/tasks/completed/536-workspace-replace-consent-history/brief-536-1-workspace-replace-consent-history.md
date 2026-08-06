# Brief 536-1 — replace, consent, drift, and history (milestone 5)

## In plain words

The Search panel can find; now it must replace. One match at a time,
or the whole workspace behind a counted consent dialog. Undo and redo
restore everything through the transaction layer. If a file changed
after the search, the replace must say so per item instead of guessing.

## The deliverable, twice

CODE: per-match replace and workspace Replace All through the landed
#532 transaction layer (TextPatch/arena/coordinator — no second undo
path); every dialog copy exactly per design section 6; Undo/Redo
commands through the coordinator; per-item drift detection (exact
context verification at the acting boundary) and partial-failure
reporting; final PTY contracts only after the live behavior is correct.
VISUAL (conductor will drive before landing): a replace affordance per
match row and a Replace All control; Replace All opens the shared
consent dialog with the exact counted copy ("Replace N matches in M
files?"-family per section 6), safe focus, Escape, selection and copy;
after consent the results and files change; one undo (with its consent
dialog) restores every file exactly; redo re-applies; a drifted file is
reported per item with the design's copy, not silently skipped and not
silently replaced.

## Source of truth

[project-find-replace-design.md](../../../../project-find-replace-design.md)
sections 6, 7, 13 (Milestone 5), 14. Compose through the landed seams:
#532's WorkspaceUndoCoordinator + arena (the ONLY undo path), #534's
backend (replacement expansion already shared), #535's panel (add to
it — no parallel surface). ui-design chapters for dialogs and buttons.

## Scope (Milestone 5 verbatim)

- Add per-match replace and workspace Replace All.
- Add every dialog copy from section 6.
- Add Undo and Redo through the coordinator.
- Add per-item drift and partial-failure reporting.
- Add final PTY contracts only after the live behavior is correct.

## The bar

DRIVE ADVERSARIALLY: reproduce the whole flow by driving before
contracts; drift arm BOTH ways (edit a file after search, replace must
flag exactly that item; unchanged files still replace); partial failure
(one read-only file among many) reported without aborting the rest;
scale parity 10 and 100,000 lines; open-buffer edits go through the
editor delta path (the #521 seam) while closed files go through disk
patches — prove BOTH; neighbor sweep (in-file find bar replace, editor
undo of ordinary typing, dirty markers). Both polarities everywhere.
The four proposed records in design section 12 remain proposals.

## Invariants in scope

- "Undo records deltas not whole-document snapshots"
  ([editor.invariants.md](../../../../src/modules/editor/editor.invariants.md)).
- [search.invariants.md](../../../../src/modules/search/search.invariants.md)
  record by record.
- "Input overlays share one modal slot"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
