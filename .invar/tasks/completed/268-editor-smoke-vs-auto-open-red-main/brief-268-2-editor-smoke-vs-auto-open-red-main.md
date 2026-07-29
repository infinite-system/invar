# Brief — #268: MAIN IS RED — fix the editor smoke under #237's auto-open default

Read first:
`.invar/tasks/in-progress/268-editor-smoke-vs-auto-open-red-main/task-268-*.md`
— it carries the full mechanism and the candidate fix shapes.

The one-paragraph version: main (d42f2af0) fails `smoke-editor-harness`
deterministically — "wrap-off keeps consecutive logical lines on consecutive
terminal rows". The smoke tree-walks into `fixtures/README.md`; since #237,
opening markdown auto-opens the preview split, the editor pane narrows, and
the smoke's row/gutter assertions — written against a full-width editor —
displace. The smoke is stale, not the feature.

The law: **the smoke must hold under the app's real defaults.** Do not
disable auto-open globally to make the smoke pass; do not weaken the
wrap-off property. Prefer deriving expectations from the actual viewport at
assert time (measure, don't assume); walking to a non-markdown fixture is
acceptable if markdown is incidental to the wrap-off arm. If split-layout
wrap-off deserves its own coverage, add an arm, don't swap.

Verify by DRIVING: reproduce the red on unmodified main first, then green
after your change, then a positive control — deliberately break wrap-off
and confirm your assertion still catches it. Run the FULL editor smoke, not
the one step. Never widen a timeout; a wait must be a condition.

Out of scope: the retry-flakes (git-watch, panel-chrome, agent-cancel) seen
in the same gate — known classes, do not touch.

## Invariants in scope

- The editor smoke's own records (`scripts/harness/` contracts the smoke
  cites) — the wrap-off property must survive with its citation intact.
- #237's auto-open record in the markdown module — read it; do not weaken
  the default it protects.
- `scripts/harness/harness.invariants.md` — the settled-frame contract, if
  you touch waits.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`. Especially watch for OTHER smokes that hard-code
full-width editor geometry — name them, do not fix them here.

## Verification

Full `smoke-editor-harness` green on your branch; the red reproduced and
quoted from main in your report; the positive control quoted.

## End state (mechanical)

Your READY report at
`.invar/tasks/in-progress/268-editor-smoke-vs-auto-open-red-main/report-268-editor-smoke-vs-auto-open-red-main.md`
with `## Bycatch` (even if "None observed"). Main goes green when this lands
— that is the whole point of the task.
