# 257 — the last visible editor row sometimes drops its right border cell

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: flake-evidence

## Outline

Bycatch of #236, reproduced in BEFORE and AFTER frames at 80x40 and 120x40
(pre-existing, outside markdown): on the LAST visible editor row (row 20 in
a 40-row grid), the source pane's right border cell is sometimes blank
where a long line truncates. Neighbouring rows paint `…l│`; that row paints
`…t  │` — the truncation ellipsis/border interaction differs on the final
row only.

Reproduce deterministically first (which line contents, which widths).
Last-row-only defects usually mean an off-by-one in the visible-window
clamp or a final-row early exit in the paint loop — find the generator, fix
it, lock with a frame assertion comparing the last row's border column to
its neighbour's.

## Invariants in scope

- The editor pane painting records (SourceTextPaneContent /
  EditorPane geometry, post-#219); the geometry-aggregates record (#217's
  subject) if the clamp is the cause.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-236-...md`, Bycatch item 3.
