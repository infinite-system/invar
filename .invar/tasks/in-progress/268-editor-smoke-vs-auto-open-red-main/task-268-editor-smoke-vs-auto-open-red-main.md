# 268 — MAIN IS RED: editor smoke's wrap-off rows displaced by #237's auto-open

State: IN-PROGRESS
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Priority: URGENT — main is red

## Outline

Main (d42f2af0) fails `smoke-editor-harness` deterministically, solo:
"FAIL wrap-off keeps consecutive logical lines on consecutive terminal
rows", exit 1. Mechanism already identified by the conductor: the editor
smoke's tree-walk opens `fixtures/README.md`; since #237 landed, opening a
markdown file AUTO-OPENS the preview split by default, which narrows the
editor pane and displaces the `gutterNumber(snapshot, typedPosition.row + 1)`
row assertions. The smoke's expectations were written against a full-width
editor.

This is the same defect class as #35's smoke-order fix: a smoke hard-coding
geometry that a legitimate default changed under it. Your judgment on the
fix, but the invariant is: **the smoke must hold under the app's real
defaults** — do not disable the auto-open globally, do not weaken the
wrap-off assertion. Candidate shapes:

1. Derive the expectations from the actual editor viewport at assert time
   (measure, don't assume width) — strongest, survives future defaults.
2. Have the smoke walk to a non-markdown fixture for the wrap-off arm, if
   markdown is incidental to what the arm proves.
3. If the wrap-off arm SHOULD prove behavior in the split layout too, add
   that as a second arm rather than losing the wide arm.

Verify by DRIVING: run the full smoke on main, red before, green after,
and confirm the wrap-off property still fails if you deliberately break it
(positive control — an assertion that cannot fail proves nothing).

Also confirm the three retry-flakes seen in the same gate (git-watch,
panel-chrome, agent-cancel) are NOT touched by your change — they are
known flake classes, out of scope.

## Invariants in scope

- The editor smoke's records; #237's auto-open record; the harness
  settled-frame contract. Never widen a timeout — a wait must be a
  condition.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- Gate log red on d42f2af0; `report-237-...md`; conductor's solo repro:
  the smoke fails deterministically on unmodified main.
