# Task #437 — gesture mechanics live only in the CLI table

Priority: architecture-hygiene
Engine: claude
Environment: any
Model: fable-5
Effort: medium
State: ACTIVE

## What

`Drive.ts` defines `openPanel`/`closePanel` mechanics only in its CLI
gesture table. `PtyTestDriver.ts` has no shared named helper, although
AGENTS.md (as amended 2026-08-01) requires CLI and smokes to share one
gesture implementation. Bycatch from #435 (code inspection).

## Wanted

Move the gesture mechanics (key chord + condition wait) into a shared
driver-layer helper; the CLI table entry becomes the binding. Seed the
shared layer with the next real mouse gestures when a task needs them
(openInstancesList, splitInstance, closeInstance) — locate by VISIBLE
affordance, hover before click, per the ui-task skill. Do not build
speculative vocabulary beyond what a task drives.
