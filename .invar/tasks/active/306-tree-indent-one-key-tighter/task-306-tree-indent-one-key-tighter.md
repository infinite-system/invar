# 306 — file tree + structure: each sublevel indents 1 key less (more compact)

State: active
Engine: codex
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> not sure if i told you this, but file tree indent of each sublevel
> should move left by 1 key to be more compact, same for Structure

## Design

- Per-level indent width shrinks by 1 column in BOTH the file tree and
  the structure pane — one shared indent generator if one exists; if the
  two panes compute indent separately, that duplication is in scope
  (seam-at-shared-generator).
- Deep nesting must remain distinguishable: adjacent levels still differ
  visibly; expand/collapse affordances and selection hit-targets keep
  working at the tighter indent (pointer coordinates included).
- Both scales; frame quotes before/after at 3+ nesting levels.

## Acceptance

Sublevel N starts one column left of today's position per level in both
panes; glyph density rule (#304 family, one glyph per row) unaffected;
tests pin the indent arithmetic both polarities (a planted old-width
render goes red).
