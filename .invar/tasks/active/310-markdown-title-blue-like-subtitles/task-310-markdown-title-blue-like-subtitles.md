# 310 — markdown preview: title (H1) blue like the subtitles

Status: active
Engine: codex
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> make title in preview also blue like subtitles in markdown

## Design

- The preview's H1 currently renders in a different colour than the
  lower-level headings (subtitles), which are blue. H1 takes the SAME
  blue — one heading colour token shared by all levels, derived from
  the theme (derive-don't-copy; if the subtitle blue is already a
  semantic token, H1 reads that token — no new literal).
- Both polarities: H1 foreground equals H2+ foreground (truecolor cell
  assert, COLORTERM=truecolor); the old H1 colour no longer appears on
  the title row; live theme switch keeps them equal.
- Both scales; whatever weight/underline styling H1 has beyond colour
  stays unchanged unless the records say otherwise.

## Acceptance

PTY drive with H1+H2+H3 fixture: identical heading fg across levels in
dark and live-switched light themes; planted divergent H1 colour goes
red.
