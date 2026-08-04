# READY report 494-1 — hidden-monitor log-line race under load

Branch: `fleet/494-hidden-monitor-log-line-race-under-load`. Commit: `0fe36251`.

## In plain words

The test counted the log lines while the sampler was still allowed to write one. It then
turned logging off, hid the pane, and expected the count to match. On a busy machine the
turn-off takes longer than one sampler tick, so one more line landed and the test went red.
Now the test counts the lines only after the app says logging is off. From that moment the
file cannot grow, so the count is stable and the hidden-pane check compares against it.

## The in-flight window, named with evidence

The sampler writes one JSON line per tick while logging is on. The default cadence is one
second ([MonitoringPlugin.ts:77](../../../worktrees/494-hidden-monitor-log-line-race-under-load/src/modules/monitoring/MonitoringPlugin.ts), `defaultValue: 1`).
The old smoke read its baseline (`lineCountWhileOn`) BEFORE driving the multi-step palette
command that turns logging off. Every tick inside that drive appends a line. Solo the drive
beats the next tick. Under gate load it does not.

Proof by instrumented run (a temporary 2.5 second delay between the baseline read and the
toggle, simulating gate-load latency):

- Old assertion: EXIT=1, `FAIL a hidden monitor writes no log line either` — the exact
  gate-487 message. Baseline was 3 lines, the file had grown past it.
- Fixed assertion under the SAME delay: EXIT=0, and the new pass line names the window:
  `the log only ever grows while logging is on (3 at the on-read, 5 at rest)`. Two ticks
  landed inside the window and the at-rest baseline absorbed them.

Why the at-rest count is race-free: `MonitoringStats.takeSample` checks `this.logging.value`
synchronously before every write, and the status file publishes `monitoringLogging === false`
only after the model flipped. JavaScript is single-threaded here, so once the status wait
resolves, no code path can append another line.

## What changed

One file, [smoke-monitoring-harness.ts](../../../worktrees/494-hidden-monitor-log-line-race-under-load/scripts/harness/smoke-monitoring-harness.ts) (lines 340-395):

1. After the named status wait `logging turns back off`, the smoke snapshots
   `lineCountAtLoggingOff` from the file (line 348). A comment names the race so the next
   editor does not move the snapshot back.
2. A new assertion pins monotonicity: `the log only ever grows while logging is on`, printing
   both counts (line 352).
3. The hidden-monitor assertion now compares against the at-rest baseline across the same
   quiet window the sample counter already held: `a hidden monitor writes no log line either
   (held at N)` (line 390). No timeout widened. No sleep added.

App code is untouched. The two temporary plants (repro delay, positive-control write) were
reverted before the commit. `git diff` on the branch shows only the smoke and the verifier
script below.

## Verification

- Solo before the fix: EXIT=0 (the flake needs load).
- Instrumented repro on the OLD assertion: EXIT=1, same failure as gate-487 (see above).
- Instrumented run on the NEW assertion: EXIT=0 with the 3-vs-5 window named.
- Positive control: a planted write in the hide path (`onObservationChanged` appending one
  last line) turned the smoke red at exactly the target assertion:
  `FAIL a hidden monitor writes no log line either (held at 3)`. Every earlier logging check
  stayed green, so the red is attributable. Plant removed after the quote.
- Loaded runs: `verify-494-loaded-runs.sh` (in this task folder) runs the smoke 5 times with
  two busy-loop burners alive. All 5 runs EXIT=0.
- Final solo run of the committed tree: EXIT=0, 28 PASS lines.
- `bunx tsc --noEmit` → 0. Invariants checker `--all` and `--refs` → 0 problems, 1378
  annotations resolved.

## Invariants in scope, record by record

- **Harness waits observe conditions not frame ordinals**
  ([harness.invariants.md](../../../worktrees/494-hidden-monitor-log-line-race-under-load/scripts/harness/harness.invariants.md)):
  upheld, and the fix strengthens it. The defect was a snapshot racing a live producer. Both
  endpoints of the no-growth claim are now anchored to named status conditions
  (`monitoringLogging === false`, then `monitoringObserved === false &&
  monitoringSamplingAtRest === true`). One flag for the record itself: the pre-existing
  3-second quiet window in this smoke is an absence-claim window, not a transition wait, yet
  the record's shape (c) wording ("a fixed sleep between an action and an assertion") reads
  as if it forbids it. See Bycatch.
- **Every wait names itself**
  ([harness.invariants.md](../../../worktrees/494-hidden-monitor-log-line-race-under-load/scripts/harness/harness.invariants.md)):
  upheld. No new wait was added. The new assertion labels carry the counts they judged, so a
  future red names its own numbers.
- **Observability never crashes the app**
  ([system.invariants.md](../../../worktrees/494-hidden-monitor-log-line-race-under-load/src/modules/system/system.invariants.md)):
  untouched — the diff is smoke-only. Verified in reading: `MonitoringStats.writeLogLine`
  swallows append failures, so the log path cannot crash the app. One annotation gap found,
  see Bycatch.

## Bycatch

- **Annotation gap + record scope drift**: `MonitoringStats.writeLogLine`
  ([MonitoringStats.ts:352](../../../worktrees/494-hidden-monitor-log-line-race-under-load/src/modules/monitoring/MonitoringStats.ts))
  enforces "Observability never crashes the app" with a prose comment only, no
  `// invariant:` annotation. The record's Scope names only `StatusChannel.flush/settle` and
  `Logging.write`, while `GraphChannel.ts` is already annotated against it and this site
  enforces it de facto. The Scope enumeration has rotted narrower than the enforcement set.
  Not fixed (contract layer).
- **Record wording refines-candidate (suspect)**: the "Harness waits observe conditions not
  frame ordinals" record forbids shape (c), "a fixed sleep between an action and an
  assertion". [project.conventions.md](../../../worktrees/494-hidden-monitor-log-line-race-under-load/project.conventions.md)
  blesses the counter-holds-over-a-window pattern for quiescence, and this smoke's 3-second
  quiet window (line 371) is that blessed shape. The record could name the absence-claim
  window as a third legitimate exception so the two documents stop disagreeing at the edge.
  Reproduced only as a reading, so marked suspect.

## Instrument feedback

- EASY: `HarnessSmoke.awaitStatus` with named conditions, and reading file-side evidence
  beside published counters. The status projection made the rest condition one predicate.
- CONFUSING: nothing blocking.
- MISSING: an at-rest verb for counters. Every absence claim hand-rolls "snapshot, sleep a
  window, re-read, compare". A helper like `awaitCounterHold(field, windowMilliseconds)` (or
  a count-based settle) would make quiet-window claims uniform and give them one audited
  implementation. This is an ask.

## Rules followed

Never ran `scripts/merge-gate.sh`. Committed with `SKIP_GATE=1` acknowledged by the
pre-commit hook. Tree left clean apart from the pre-existing untracked
[dispatch fundamentals artifact](../../../worktrees/494-hidden-monitor-log-line-race-under-load/BUILDER-FUNDAMENTALS.md),
which is not mine to remove.
