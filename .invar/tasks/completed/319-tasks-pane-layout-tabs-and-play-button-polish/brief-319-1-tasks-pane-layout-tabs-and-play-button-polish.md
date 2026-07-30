# Brief — #319: tasks pane polish (live two-line, play tooltip/off, tab highlight+active, one-line items, capitalized sections)

USER-DIRECTED. Read first:
[task-319-tasks-pane-layout-tabs-and-play-button-polish.md](task-319-tasks-pane-layout-tabs-and-play-button-polish.md)
— his verbatim words GOVERN; the record's five arms are the work.

## Work discipline

- ONE COMMIT for #319 (`tasks-pane: <summary> (#319)`), full gate
  through the enforcing hook, NO SKIP_GATE product commits.
- Arm 1 (live rows two-line): quote real `bun tasks:watch` output in
  the report and mirror its shape — that terminal layout is the visual
  target the user named.
- Arm 2 (play tooltip + off): CENSUS the existing tooltip seam first
  (breadcrumb toggle? status bar? overlay hints?) — if none exists,
  report the seam finding BEFORE building one; the off semantic you
  choose must be recorded and discoverable.
- Arm 3 (tabs): highlight extends exactly 1 cell left+right as bg
  padding; persistent active state; theme-derived tones only, never a
  literal where a token exists; assert across a live theme switch.
- Arms 4-5: one-line completed/active rows with the SHARED truncation
  treatment (derive, don't copy); capitalized section headers.
- Both polarities on every arm (new state asserted AND old state
  absent), frame quotes before/after, both scales (--size 10 and
  --size 100000) where the surface renders at scale.

## Invariants in scope

tasks-pane records, theme records, tab/chrome records, FrameProbe
conventions (code-point indexing, truecolor).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with per-arm evidence + the commit hash, GATE_EXIT=0
through the enforcing hook. The conductor gates at landing and
completes the record.
