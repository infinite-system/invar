# #344 — breadcrumb hover highlights the segment with one-cell side padding

State: ACTIVE
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## The request (user, 2026-07-30, verbatim intent)

Hovering a breadcrumb folder segment shows a background highlight that
extends ONE cell beyond the text on the left and ONE on the right. The
highlight must not shift segment positions, with one deliberate exception:
the whole breadcrumb row moves one cell right, because the FIRST segment
gains a left padding cell (today it sits tight against the left edge, so
there is no room for its left highlight cell).

His notation: for [invar]>[subfolder]>[sub2], hovering a segment highlights
from [ to ] INCLUDING the cells behind [ and ]. The separators (>) between
segments stay unhighlighted and unmoved.

## Boundaries

- Layout shift is exactly ONE column for the whole row (the new leading
  pad), applied always (not only during hover) so hover never reflows text.
- Hover highlight follows the existing hover/hit-testing model: renderer and
  hit-tester share one geometry (no parallel math). Hit area may include the
  padding cells.
- Theme both light and dark: use the existing hover background token, not a
  hardcoded color.
- Drive it: mouse-move over each segment; assert highlight span = segment
  text span + 1 cell each side, first segment included; assert click
  behavior unchanged.
