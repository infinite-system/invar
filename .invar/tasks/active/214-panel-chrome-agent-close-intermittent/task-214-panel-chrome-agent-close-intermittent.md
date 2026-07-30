# 214 — panel-chrome intermittently red at the Agent 2 list-close assertion

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

Bycatch from #114 Wave B (one red in seven runs, then six greens).
`smoke-panel-chrome-harness` timed out once at
`the Agent 2 list close removes only that instance`. Evidence:
`/tmp/v3-smoke-panel-chrome-harness.log`.

The assertion sits in the AGENT instance-close path. Wave B does not touch that
path: agent panes are not runtimes, and their creation, registry, and close
handling are unchanged. The builder flagged it so a gate red is not blamed on
that branch.

First question, per the wait doctrine: is the close-confirmation wait a
condition the close action can always make true, or does it race the list
re-render? One-in-seven at the same assertion smells like a wait racing an
async list update, not load. Related standing task: #164
(panel-chrome ASCII-tier timeout) — check whether they share a wait site
before treating them as two defects.

## Sources

- [/tmp/114-wave-b-READY-v2.md](../../../../../../../../../../../tmp/114-wave-b-READY-v2.md) — Bycatch section (copied into
  `.invar/tasks/completed/114-.../` at #114's landing).

## Census tally 2026-07-29 (#295 gate)

- panel-split smoke timed out in #295's commit gate pool run; quiet retry
  passed; not reproduced solo. 4th pool-only occurrence today (also #277,
  #281-adjacent, #290 rounds). Same class: pool-load timeout, solo green.
- input-byte timing gate p50 9.748 ms vs report-only warning 6.406 ms during
  the same pool gate; all five ordering sessions passed. Load-bound metric —
  normalise before tolerating (gate-what-humans-cannot-see rule).
- 2026-07-29 #298 amend gate: scrollbars smoke + panel-split smoke both
  starvation-timeout, both passed on retry (5th/6th pool-only today).
- 2026-07-29 #296 gate: panel-chrome (pool starvation) + overlay-dialog
  (serial tail) each timed out once, quiet retry passed (7th/8th today).
- 2026-07-29 #299 gate: scrollbar + panel-chrome timeout-class, both passed
  built-in retry (9th/10th today).
- 2026-07-29 #313/#315 gates: bounded-list-popup + git-watch + panel-chrome
  retry-passes (mouse gate); scrollbar markdown-border derive miss once then
  clean full rerun + one panel-chrome starvation retry (color gate). Census
  11th-15th pool events today.
- 2026-07-29 #312 gates: panel-split timed out INCLUDING built-in retries in
  two hook runs overlapping several worktree gates; isolated run ALL-PASS;
  later hooks green. Retried-and-still-failed under pool overlap = strongest
  starvation datapoint yet (16th-17th today).
- 2026-07-29 #308 bycatch commit gate: editor smoke one starvation-class
  retry (18th today). ALSO: broken claude symlink (313 probe) failed agent
  smokes across several gate attempts before repair — env-caused, not census.
- 2026-07-29 #317 gates: panel-chrome starvation retry-pass in TWO parallel
  runs + panel-split retry-pass in the final gate + one tasks-dashboard
  Extensions-reach miss that did not reproduce (19th-22nd today).
- 2026-07-29 #301 gates: tasks-dashboard Extensions-reach miss in first hook
  attempt (same class as #317's), unchanged second attempt green; one
  panel-chrome starvation retry-pass; input-byte p50 9.045ms vs 6.406ms
  report-only line under pool load (23rd-24th today). ALSO: the FAILED hook
  left 3 test app instances live ("starting with 3 test app instance(s)
  live") — failed-gate cleanup does not reap children; instrument defect,
  not census.
- 2026-07-29 #320/#321 gates: concurrent hook runs timed out in panel-split,
  panel-chrome, shortcut-help, scrollbar smokes; panel-chrome passed alone in
  ~1s; failures moved between harnesses, clean-start hooks green (25th-28th
  today; builder kept /tmp/merge-gate-failures.* examples).
- 2026-07-29 #319 gate: panel-split + panel-chrome + overlay-dialog first-attempt
  timeouts, all quiet-retry green (29th-31st today).
- 2026-07-30 post-rename control gates: first full gate ALL-GREEN (validated the
  tui-editor->invar rename, 5eb10e69); an aborted duplicate run minutes later on
  the SAME tree had git-watch retry-then-fail (1m11s, starvation-shaped) +
  markdown previewRowContaining miss — same-tree green/red pair is a clean
  pool-flake datapoint (32nd-33rd).
- 2026-07-30 #329 hooks: first hook starvation-class retry-passes in
  scrollbars, Git watch, and panel-split smokes; each passed without retry in
  the unchanged second hook (34th-36th). Final hook input-byte canary p50
  13.187 ms vs 6.406 ms report-only threshold (prior hook 5.167 ms) beside two
  live test app instances — load-bound metric, report-only. ALSO one-shot:
  #321 diagnostic probe classified a partly typed shell command as a partial
  child frame once at 100x30, clean immediately after, not reproduced.
- 2026-07-30 #323 gates: one run overlapping #329's root gate had the
  plugin-manifest contract unable to reach the Markdown extension row; did
  not recur without the overlap (37th). Final hook: git-watch smoke +
  behavioral contracts one timeout-class first attempt each, both passed the
  gate's quiet retry, gate named both as flakes (38th-39th).
- 2026-07-30 #322 hooks: round-1 full hook failed twice while the panel-chrome
  smoke closed "Terminal 2"; the same harness passed alone immediately after
  and passed without retry in the green hook (40th). Round-2 merge hook first
  attempt reproduced the exact #214 shape: the "Agent 2" list close timed out
  twice; the next complete hook passed panel chrome without retry (41st).
  Round-1 green hook also recorded starvation-class retry-passes in the
  scrollbars and panel-split smokes, each on the gate's one allowed retry
  (42nd-43rd). Round-2 green hook input-byte p50 13.050 ms against the
  4.928 ms reviewed baseline — load-bound metric, report-only, two builders
  plus gates live on the machine.
