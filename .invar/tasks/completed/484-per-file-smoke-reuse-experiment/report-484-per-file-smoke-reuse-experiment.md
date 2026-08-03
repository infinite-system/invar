## In plain words

The busiest smoke file starts Invar eight times. Four starts prove that a setting survives closing and reopening the app. One shared app cannot run those checks, so I did not remove coverage to force the experiment.

## Result

#484 (per-file smoke reuse experiment) is BLOCKED by the existing smoke contracts. I made no harness or product behavior change.

Commit `80fe8990` adds two task instruments. The [source census](484-smoke-runtime-boot-census.ts) finds direct driver constructions. The [runtime counter](484-runtime-boot-counter-preload.ts) counts actual app starts during a smoke process.

## Runtime boot population

The source census found 120 direct `PtyTestDriver.Class` constructions in 73 live smoke files. Runtime execution changed the top order because some helper functions run more than once.

| Smoke file | Runtime boots | Solo result | Why the count exceeds direct sites |
|---|---:|---|---|
| [pixel preview](../../../../scripts/harness/smoke-pixel-preview-harness.ts) | 8 | ALL-PASS | The same-home persistence scenario runs at small and large geometry. Each geometry boots twice. |
| [Markdown](../../../../scripts/harness/smoke-markdown-harness.ts) | 7 | ALL-PASS | Theme and scale helpers run more than once. |
| [activity bar](../../../../scripts/harness/smoke-activitybar-harness.ts) | 6 | ALL-PASS | The glyph-tier helper runs twice. The final arm also restarts the app. |
| [panel chrome](../../../../scripts/harness/smoke-panel-chrome-harness.ts) | 6 | ALL-PASS | The geometry helper runs at two sizes. |
| [scrollbars](../../../../scripts/harness/smoke-scrollbars-harness.ts) | 6 | FAIL | The scale helper runs twice. The third boot hit the existing wrap-off width timeout. |
| [terminal follow](../../../../scripts/harness/smoke-terminal-follow-harness.ts) | 6 | ALL-PASS | The backend helper runs for completed and error outcomes. |

Four files tie at six boots for three remaining positions after the 8-boot and 7-boot files. The task does not give a tie-break. Therefore, “the five heaviest files” is not a unique population when boot count is the only rank.

## Fatal constraint

The [pixel preview smoke](../../../../scripts/harness/smoke-pixel-preview-harness.ts) lines 340-540 proves same-home restart persistence twice. Each scale does this sequence:

1. Start the first app.
2. Change the graphics tier through Settings.
3. Quit the app.
4. Start a second app with the same home.
5. Require the persisted tier after restart.

The second app is the subject of the assertion. A shared instance cannot generate a restart of itself.

The [activity bar smoke](../../../../scripts/harness/smoke-activitybar-harness.ts) lines 1097-1135 has the same constraint. It quits and starts a new app to prove the dragged order survives restart.

The task permits a fresh boot after a dirty reset mismatch. These restart arms are not reset failures. Calling them failures would make the reset instrument lie.

A new app-rebootstrap feature would not solve the stated churn problem. It would still destroy and allocate the 236MB app graph between scenarios. It would also expand the task into product lifecycle work.

Dropping the restart arms would reduce assertion coverage. It would violate the [coverage ratchet](../../../../project.invariants.md#coverage-may-fall-but-never-silently) and remove the behavior these smokes exist to prove.

## Why I stopped before implementation

The requested end state and the existing assertions cannot both be true. A partial reuse helper would either recycle on every incompatible scenario or report several apps as one app.

I did not add an unused reset seam. I also did not run after-change measurements against an unchanged tree. Either action would manufacture progress instead of testing the hypothesis.

The runtime count changed the earlier 119-site and 72-file estimate in [task #472 (one warm app serves the harness)](../../active/472-one-warm-app-serves-the-harness/task-472-one-warm-app-serves-the-harness.md). The current tree has 120 direct sites in 73 files.

## Invariants

- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md#harness-app-homes-are-complete-and-isolated): upheld because no launch behavior changed. Per-file reuse would need the record to define one file as the isolated run.

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals): untouched. No reset wait was added.

- [Shared seam changes verify every consumer](../../../../scripts/harness/harness.invariants.md#shared-seam-changes-verify-every-consumer): the brief's invariant map missed this record. A shared reset seam would require every registered smoke, not only five files.

The three baseline gates ran every registered consumer and passed their blocking verdicts. No contract edit is proposed because no behavior changed.

## Positive controls

The runtime preload counted six starts in the activity bar smoke and eight in pixel preview. The direct source census found only five sites in each file. This difference proves the runtime counter detects repeated helper calls that the source census cannot count.

The scrollbar smoke failed twice at the same third-boot condition. This proves the solo drive could report red instead of only producing a count.

No reset positive controls ran. No reset exists because the restart constraint blocks the design before that seam can be honest.

## Verification

- `bunx prettier --check` passed for both task instruments.

- The runtime counter recorded pixel preview 8, Markdown 7, activity bar 6, panel chrome 6, terminal follow 6, tasks dashboard 5, terminal stage 5, layout 5, and media 4.

- Three full timing gates ran with `INVAR_GATE_WORKERS=6 bash scripts/merge-gate.sh`. All three blocking verdicts passed.

- Gate runs 1, 2, and 3 had zero retry-passes. Each run reported the same two non-blocking contention failures.

- Commit `80fe8990` used `SKIP_GATE=1` as required by the [brief](brief-484-1-per-file-smoke-reuse-experiment.md). The three timing gates were the measurement passes.

## Bycatch

- [Scrollbar smoke](../../../../scripts/harness/smoke-scrollbars-harness.ts): `the wrap-off editor reclaims the concealed dock's columns` timed out twice during solo baseline drives. It reproduced in all three gate runs as a report-only contention failure. I did not fix it.

- Contract map: the [brief](brief-484-1-per-file-smoke-reuse-experiment.md) names two harness records. A shared reset seam also implicates `Shared seam changes verify every consumer`. I added it to this report and did not edit the brief.

## Instrument feedback

EASY: The mutable `PtyTestDriver.Class` slot made a runtime counter possible without tracing child syscalls. The graph guidance clearly separates settled reads from experimental writes.

CONFUSING: Bun rejected `--preload PATH` for the task preload. The working form was `--preload=./PATH`.

MISSING: The harness has no standard runtime-boot census. It also has no reset fingerprint or reset gesture seam. The task assumed both existed.

## Rollout

No rollout decision is made. There is no after implementation to roll out.

## Measurement table

| Arm | Workers | Run | Wall clock | Parallel pool | Blocking retry-passes | Report-only contention failures | Outcome |
|---|---:|---:|---:|---:|---:|---:|---|
| Before | 6 | 1 | 5m58s | 1m50s | 0 | 2 | ALL-PASS |
| Before | 6 | 2 | 5m21s | 1m19s | 0 | 2 | ALL-PASS |
| Before | 6 | 3 | 5m25s | 1m20s | 0 | 2 | ALL-PASS |
| After | 6 | 1-3 | Not run | Not run | Not run | Not run | Blocked by restart coverage |
| After | 9 | 1-3 | Not run | Not run | Not run | Not run | Blocked by restart coverage |
