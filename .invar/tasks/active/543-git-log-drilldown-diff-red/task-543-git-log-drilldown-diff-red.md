# 543 — git log drilldown diff red

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

Clicking a file inside an expanded commit should open its
before-and-after view. The smoke shows it does not open, and this was
already broken before #542 touched anything.

## Evidence (from #542 premise correction, 2026-08-11)

- scripts/smoke-git-log.sh RED at base a57067e5 (pre-#542; reproduced
  by stashing the diff): Down+Enter on a file inside an expanded commit
  leaves showingDiff false; the diff content assert fails.
- Two candidate causes named: the Enter-to-open-diff path regressed, or
  the smoke's row arithmetic drifted. Separate by driving first.
