# 532 — workspace undo transaction core

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

Build the data layer that lets a multi-file replace be undone safely:
exact reverse patches, one shared arena, and an undo coordinator that
stays correct when files are open, closed, or changed midflight. No UI in
this task.

## Source of truth

project-find-replace-design.md, Milestone 2 (section 13) + sections 8
(reverse-patch transaction design), 9 (open-buffer undo coherence), 14
(verification matrix). Milestone 1 landed as #521 (2b633367).

## Scope (Milestone 2 verbatim)

- Add `TextPatch`, `TextArena`, and exact context verification.
- Add `WorkspaceUndoCoordinator` and external undo references.
- Add the history byte and count bounds.
- Prove one-copy memory behavior with a positive control.
- Test open, closed, detached, and reopened documents.
