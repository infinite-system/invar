# Brief 532-1 — workspace undo transaction core (Find/Replace milestone 2)

## In plain words

Build the data layer that lets a multi-file replace be undone safely:
exact reverse patches, one shared text arena, and an undo coordinator
that stays correct when files are open, closed, or changed midflight.
No UI in this task — it proves the hard data boundary first.

## Source of truth

[project-find-replace-design.md](../../../../project-find-replace-design.md)
sections 8 (reverse-patch transaction design), 9 (open-buffer undo
coherence), 13 (Milestone 2), 14 (verification matrix). Milestone 1
landed as #521: FindInBuffer returns TextEdits, the editor applies
batches through one delta undo step — build on those seams, do not
parallel them (seams at the shared generator).

## Scope (Milestone 2 verbatim)

- Add `TextPatch`, `TextArena`, and exact context verification.
- Add `WorkspaceUndoCoordinator` and external undo references.
- Add the history byte and count bounds.
- Prove one-copy memory behavior with a positive control.
- Test open, closed, detached, and reopened documents.

## The bar

DRIVE ADVERSARIALLY where surfaces exist (open-document undo through the
real editor); for the pure data layer, both polarities on every claim:
the context-verification must FAIL on a planted drift; the memory bound
must FAIL on a planted second copy; the byte/count bounds must evict
observably. Test the document lifecycle matrix (open, closed, detached,
reopened) as named states, not incidentally. The design's four proposed
records are NOT law — do not write them into contracts.

## Invariants in scope

- "Undo records deltas not whole-document snapshots"
  ([editor.invariants.md](../../../../src/modules/editor/editor.invariants.md))
  — the coordinator must compose with it, not bypass it.
- [search.invariants.md](../../../../src/modules/search/search.invariants.md)
  — answer record by record.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
