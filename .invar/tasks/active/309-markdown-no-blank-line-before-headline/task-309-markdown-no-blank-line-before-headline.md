# 309 — markdown preview: no injected blank line before headlines

Status: active
Engine: codex
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> in markdown now the "css" improvement adds 1 blank line before
> headline, it should not do that

## Design

- The markdown preview's heading styling currently injects a blank line
  (spacing row) ABOVE headings; remove that injected row. Headings
  render flush with the preceding content row, exactly as the source
  spacing dictates — source blank lines still render, only the
  synthetic one goes.
- Both polarities: heading preceded by content renders with NO extra
  row (planted spacer goes red); a source blank line before a heading
  still renders as exactly one blank row (no over-correction that
  swallows author spacing).
- All heading levels; both scales; check the first heading of the
  document too (no leading blank at the top).

## Acceptance

PTY frame quotes: `text / # Heading` adjacency with zero injected rows;
`text / <blank> / # Heading` keeps exactly one; document-top heading on
row 1 of the preview body.
