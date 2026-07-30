# #363 — six settings-row walkers collapse into one shared helper

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #337 (distillation + a contract wrinkle)

Six near-copies of "walk the settings selection to a named published row":
smoke-plugin-manifest-harness.ts (selectSetting),
smoke-settings-applied-harness.ts:170, smoke-pixel-preview-harness.ts:107,
smoke-activitybar-harness.ts:95 (selectSettingByLabel),
smoke-tasks-dashboard-harness.ts:89, smoke-breadcrumb-harness.ts:144.
Seam at the shared generator (one helper in the harness library); shared
seam changes verify every consumer.

Wrinkle to fix in the same pass: each walker opens with a wait whose
predicate (typeof settingsSelectedLabel === 'string') is pre-satisfied —
shape (b) of the wait record's forbidden list. The honest form is one
readStatus, not a wait.
