# 536 — workspace replace consent history

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

Make the Search panel replace things: per-match replace, workspace
Replace All behind a counted consent dialog, undo and redo through the
transaction coordinator, and honest per-item drift and failure
reporting. Milestone 5 of the Find/Replace design.

## Source of truth

project-find-replace-design.md Milestone 5 (section 13) + sections 6
(dialog copy), 7 (workspace replace flow), 8-9 (transactions/undo,
landed as #532), 14. Milestones 1-4 landed.
