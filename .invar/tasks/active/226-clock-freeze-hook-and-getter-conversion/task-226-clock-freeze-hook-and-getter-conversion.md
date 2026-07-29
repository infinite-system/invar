# 226 — Clock.freeze is a production test hook; convert Clock to the getter seam

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: architecture-hygiene

## Outline

Bycatch of #222, standalone even if #223 never happens. This is #222's Tier 1:
the only namespace that reaches zero bare sites in one sitting.

`src/modules/system/Clock.ts:14` ships `Clock.freeze`, called only from its
own test (`Clock.test.ts:6`, `:9`). A capability with a private test hook is a
capability with no seam. Convert the two consumers to seam getters
(`src/modules/editor/Editor.ts:507`, `src/modules/git/GitRepository.ts:132`),
port the test to getter substitution, DELETE `freeze`.

Two files, two getters, two sites, one deletion. If the proposed effect-seam
checker (`proposed-222-check-effect-seams.ts` in #222's folder) is adopted by
then, Clock's baseline rows go to zero; if not, note the counts in the report
for the future baseline. Positive control: a planted bare `Clock.Class.now()`
outside system/ must fail whichever check exists, or be quoted as a TODO for
the checker task.

## Sources

- `.invar/tasks/completed/222-provider-seam-analysis-and-convention/` — report
  Bycatch item 2 and `analysis-222-minimal-conversion-set.md` Tier 1.
