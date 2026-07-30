# 307 — markdown preview toggle moves to the breadcrumb row, right side

State: active
Engine: codex
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> move markdown toggle preview button down to where the breadcrumbs are
> but on the right side

## Design

- The markdown preview toggle leaves its current position and renders on
  the BREADCRUMB ROW, right-aligned.
- Both polarities: control present + clickable at the new position for
  markdown documents; ABSENT from the old position; breadcrumb path
  never collides with the right-aligned control (long paths truncate on
  the path side, the control keeps its columns — pin with a
  narrow-width drive).
- Any keyboard shortcut for the toggle keeps working unchanged; pointer
  hit-target verified at the new coordinates.
- Non-markdown documents: whatever today's visibility rule is, it moves
  with the control unchanged.
- Note #298 just landed on this row (nav arrows removed, separators
  dim) — build on current main; #306 (indent) does not touch this row.

## Acceptance

PTY drive quotes the breadcrumb row with the toggle right-aligned,
toggles preview by click at the new position and by the existing
shortcut, both scales; old position shows no control; narrow-pane
truncation contract green.
