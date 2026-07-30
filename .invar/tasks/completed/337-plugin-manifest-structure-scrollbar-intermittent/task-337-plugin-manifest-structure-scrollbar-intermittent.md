# #337 — plugin-manifest smoke: structure scrollbar settled-geometry intermittent

State: COMPLETED — 64ca4df5 — ordinal settings drive repaired to label walks; gate red root-caused to #340's contributed row
Priority: verification-integrity
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## What happened (bycatch from #335, 2026-07-30)

During #335's mandatory commit-hook gate (worktree
fleet/335-gate-smoke-intermittents-scrollbars-thumb-tasks-watch-motion,
commit d0c8deae), the behavioral-contracts step timed out ONCE at
[smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts)
on "the structure scrollbar publishes its settled dock-height geometry".

The builder reports the final 150x40 grid VISIBLY showed the structure thumb.
The quiet retry passed. One occurrence; did not reproduce a second time. The
gate's RETRY TALLY recorded it: "behavioral-contracts (felt invariants)"
appended to `.perf-history/gate-retries.ndjson`.

## Why filed

- The gate's own words: a retried pass is a FLAKE, not a green.
- The shape matches #335's repaired scrollbars defect exactly: a settled-
  geometry wait against a grid that already shows the subject. #335 proved
  that class is usually the instrument (a rediscovery/wait helper missing
  what the screen oracle contains), not the paint.
- Single sighting, so no dispatch urgency. Accumulate: if the RETRY TALLY
  ndjson shows this line again, dispatch with #335's repair pattern
  (discover geometry once after settle, then assert exact cells) as the
  starting hypothesis.

## Evidence pointers

- #335 report, Bycatch section
  ([report](../../completed/335-gate-smoke-intermittents-scrollbars-thumb-tasks-watch-motion/report-335-gate-smoke-intermittents-scrollbars-thumb-tasks-watch-motion.md)
  — path valid pre-landing; after landing the folder moves to completed/).
- `.perf-history/gate-retries.ndjson` in the #335 worktree/branch — the
  recorded retry.
- Rollout with the full gate output:
  `~/.codex/sessions/2026/07/30/rollout-2026-07-30T01-59-40-019fb19b-*.jsonl`.

## Third sighting (2026-07-30 ~02:5x, #339's hook gate)

behavioral-contracts step: plugin-manifest structure-outline drive timed out
TWICE (attempt 1 and the retry) in /tmp/merge-gate-failures.3937812/. Same
settled-geometry wait family. Third sighting tonight; now recurring across
gates. Dispatch when a lane frees, with #334's status-AND-grid wait repair
and #335's discover-once pattern as the starting hypotheses.
#339 bycatch 2026-07-30: plugin-manifest structure-outline drive timed out TWICE in #339's hook gate (attempt logs preserved in report). Second night sighting — per this task's own trigger rule, dispatch-ready.

## Fourth sighting (#342's hook gate, ~03:2x)

behavioral-contracts timed out once, passed the immediate retry (report
bycatch, #342). Same family. Also one single-retry scrollbars timeout there
(post-#335-repair arm; distinct smoke, note only).

## Escalation (2026-07-30, #350 gate)

The plugin-manifest drive step is now DETERMINISTIC red on the base tree:
bash scripts/smoke-plugin-manifest.sh fails identically with and without
the #350 media diff — "Timed out waiting for the first Git setting is
selected". Previously intermittent; a deterministic base-tree failure
means either the defect hardened or a recent landing moved it. Raises
priority: this class now blocks every gate deterministically.
