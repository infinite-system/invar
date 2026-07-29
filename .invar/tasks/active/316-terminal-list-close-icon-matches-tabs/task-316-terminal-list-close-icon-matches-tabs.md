# 316 — terminal list close control: use the proper close icon, not "x"

Status: active
Engine: codex
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> close icons on terminal list of terminals is x but should be actual
> close icon like we have on tabs or even the lower bottom panel close
> button is proper icon

## Design

- The per-terminal close control in the panel's terminal list renders a
  literal "x"; it must render the SAME close glyph the editor tabs and
  the bottom-panel close button already use — ONE close-glyph source
  (seam-at-shared-generator: if tabs and panel each carry their own
  glyph constant today, that duplication is in scope; all three read
  one shared token, nerd-tier and plain-tier variants included).
- Both polarities: terminal-list rows show the shared glyph (nerd and
  plain tiers); the literal "x" no longer appears in that slot; click
  hit-target still closes exactly that terminal.
- Sweep the same list for any sibling controls using ad-hoc glyphs
  while there — report, fix only close unless trivial.

## Acceptance

Frame quotes of the terminal list before/after in both glyph tiers;
close-by-click still works per row; one glyph token shared by tabs,
panel close, and terminal-list close (planted divergent glyph goes
red).
