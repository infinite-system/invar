# 534 — workspace search backend

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

Build the engine that finds text across the whole workspace: streaming
results, include and exclude filters, a match cap, cancellation, and
live open-file overlays. No visible panel yet — that is milestone 4.

## Source of truth

project-find-replace-design.md Milestone 3 (section 13) + sections 4
(workspace Search surface backend parts), 14. Milestones 1 (#521) and 2
(#532) are landed; share their seams (query compilation with
FindInBuffer; the arena/patch layer for later replacement).
