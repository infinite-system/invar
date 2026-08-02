## In plain words

The shortcut list sometimes read a half-painted screen and thought its last row was missing. I made that check read only a finished screen, and I separated four checks whose answers really change under heavy machine load. Five full gate runs now give the same green answer at both tested worker counts.

## Outcome

READY on commit `246405c3c8ada0413d71655be10b9a1c1687211c` in branch `fleet/457-serial-tail-lacks-quiet-retry`. The worktree is clean.

The original observation premise in the [round 1 brief](brief-457-1-serial-tail-lacks-quiet-retry.md) was only partly correct. [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) already retained each completed synchronized frame. However, `scrollUntilVisible` in [smoke-shortcut-help-harness.ts](../../../../scripts/harness/smoke-shortcut-help-harness.ts) read the live emulator through `snapshot()`. That live grid can contain the start of the next synchronized frame.

Six shortcut runs under deliberate contention failed `3/6` before the fix. The failing grid claimed `119-149 of 149`, but its cells mixed the prior completed paint with the unfinished next paint. It therefore reached the final range without a complete `Toggle Word Wrap` row.

The fix adds an explicit completed-grid wait. Each PageDown now returns the completed observation that proved the range advanced. The smoke carries that observation into its next decision. It no longer rereads the live in-progress grid. I also removed its three-delivery chord retry and the fixed `200 ms` sleep. One real Ctrl+Shift+H delivery now waits for state and a completed sheet.

After the fix, six concurrent shortcut runs passed `6/6` at load `0.43 0.98 1.88`. The focused PTY regression proves that raw bytes can expose `INCOMPLETE NEXT FRAME` while the completed-grid wait still returns `COMPLETE FRAME`.

## Determinism measurement

The definitive runs used unchanged commit `246405c3c8ada0413d71655be10b9a1c1687211c`. The measurement ran while #459 (panel surfaces) and #451 (media work) were the designated live builders. Each durable line records the worker count and end-of-run load average.

| Run | Workers | Blocking verdict | Blocking retries | Contention result | Total | Load average |
| --- | ---: | --- | --- | --- | ---: | --- |
| 1 | 3 | all-pass | none | 4 passed, 0 failed | 296 s | `0.77 1.33 1.51` |
| 2 | 6 | all-pass | none | 4 passed, 0 failed | 252 s | `1.40 1.85 1.74` |
| 3 | 3 | all-pass | bounded-list popup passed on retry | 4 passed, 0 failed | 302 s | `1.23 1.75 1.77` |
| 4 | 6 | all-pass | none | panel-chrome failed; 3 passed | 255 s | `1.07 1.87 1.88` |
| 5 | 3 | all-pass | none | panel-chrome failed; 3 passed | 298 s | `0.88 1.75 1.88` |

Result: five consecutive full gates produced five identical blocking verdicts. Changing the worker count between `3` and `6` did not change the verdict. The panel contention result did change and remained visible without changing the blocking answer.

The append-only line in `.perf-history/gate-retries.ndjson` now records:

- commit;
- worker count;
- blocking verdict;
- failing blocking steps;
- retry passes and retry failures;
- contention passes and contention failures;
- total seconds;
- load average.

## Planted defect

I planted the real pre-fix defect by making the completed-grid wait read `snapshot()`, which includes an in-progress synchronized frame. I ran the gated regression test five consecutive times. Exit statuses were `1, 1, 1, 1, 1`. Every run failed on `INCOMPLETE NEXT FRAME`. After I restored the completed observation, the same test passed.

This is the unit-test arm used by the full gate, not a synthetic always-red gate hook.

## Blocking and contention tiers

No coverage was deleted. The final gate registers `70` jobs. It runs `67` jobs in the loaded pool and keeps three jobs in the serial tail.

I moved four measured load-dependent product paths to the report-only contention tier:

- `panel-chrome`: it passed only on retry twice, later failed both attempts, and changed between pass and fail on the final unchanged commit. The active owner is #459 (panel surfaces).
- `scrollbars`: the deep widest-line wheel drive passed, then passed only on retry, then timed out on both attempts on an unchanged commit.
- `git-watch`: its state wait passed only on retry under the acceptance load.
- `plugin-manifest lifecycle`: only this panel lifecycle failed inside the otherwise green behavioral contract suite. [behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh) stays blocking and skips only this independently registered loaded job.

Contention jobs run in the same loaded pool. They get no retry. Their results appear in the log and durable line, but they cannot set the blocking verdict.

I did not move shortcut-help. The sighting was not load-only product behavior after diagnosis. It was a deterministic consumer error that load made easier to expose. Its completed-frame state claim now stays blocking.

I did not move bounded-list popup. One final run passed only on retry, but I did not reproduce the timeout a second time. That is bycatch, not enough evidence to weaken a deterministic correctness claim.

## Timing classifier

[check-smoke-timing-classification.ts](../../../../scripts/check-smoke-timing-classification.ts) replaces the narrow text pattern with a TypeScript syntax-tree check. It flags:

- frame-silence helper calls;
- clock subtraction that feeds an assertion;
- a filtered completed-frame collection whose length is asserted as zero.

The mandatory two-arm control runs inside every check:

- The pre-#436 (tasks:watch convergence) absence-over-observed-frames form produces one finding.
- The current convergence form produces zero findings.

The final gate inspected `66` blocking sources. It excludes the four named contention sources because timing-sensitive findings in that tier are reported, not allowed to decide a merge.

## Gate labels

The [round 2 brief](brief-457-2-2-labels-must-resolve.md) identified one known bad label: `animated-media harness` did not name [smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts). The final census covers all `70` registered jobs and finds `0` unresolved labels.

[merge-gate.sh](../../../../scripts/merge-gate.sh) now derives the exact source path from each registered command and appends it to the friendly label. A deliberately wrong friendly label still prints the runnable media script path. Therefore, a friendly name can be imperfect, but it can no longer hide the command a reader must run.

No invariant record specifically covers gate registration labels. I did not invent one inside this task.

## Scale and verification

The shared drive passed at both ends of the required scale under load `0.71 1.49 1.78`:

- `bun run drive --size 10 --key Down`: pass.
- `bun run drive --size 100000 --key Down`: pass.

The final verification pass was green:

- `bun test`: `2309` passed, `0` failed, `71928` expectations across `349` files.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: `1339` annotations and `266` lattice links resolved, `0` problems.
- Shortcut contention after the completed-frame fix: `6/6` passed.
- Registration self-check: `70/70` labels resolved to their source paths.
- Timing classifier: `66` blocking sources inspected; both control arms passed.

## Proposed invariant refinement

The conductor map missed the existing `Blocking gate verdicts use ordering and counts` record in [harness.invariants.md](../../../../scripts/harness/harness.invariants.md). I propose refining that record instead of adding a duplicate.

**Invariant:** A blocking gate verdict does not depend on machine speed.

**Mechanism:** Blocking checks use completed atomic observations, state, order, and work counts. Wall-clock values remain report-only. Product behavior that changes only under deliberate contention runs in a recorded non-blocking tier.

**Generates:** The gate registry distinguishes blocking and contention jobs. Each run records commit, worker count, verdict, failures, retries, contention results, and load. Atomic self-generated output is judged from completed synchronized frames.

**Impossible if true:** An unchanged commit changes its blocking verdict only because the worker count or machine load changed; an elapsed-time threshold blocks a merge; or a partial synchronized frame satisfies an atomic output claim.

**Verify:** Run five unchanged-commit gates across worker counts `3` and `6`, then plant a real covered defect and require five red results.

I did not edit the invariant record because the [round 1 brief](brief-457-1-serial-tail-lacks-quiet-retry.md) asked for a proposal.

## Commits

- `4e30ffeac814c85096a85bdf6e052789d27dcec2` — Make gate observations deterministic (#457).
- `229c70151ea01eeebe7df02bb9838fb708df3ace` — Publish final PTY state on process exit (#457).
- `973669c5cb26ec7892f3ac2c069d3dba3c981b3f` — Scope complete-frame reads to atomic checks (#457).
- `0d3b09e35a8531a3663bad2f23d060a587bb6f40` — Retain shortcut sheet wait coverage (#457).
- `dfbb4d1abd69af2ee0273647a7471f1ce91f472d` — Report load-dependent panel smoke separately (#457).
- `246405c3c8ada0413d71655be10b9a1c1687211c` — Split loaded product checks from blocking gate (#457).

The intermediate process-exit change was narrowed by the later atomic-check commit. The final diff keeps live `snapshot()` behavior for existing consumers and adds the completed-grid path only where atomic output requires it.

## Bycatch

- **Panel-chrome load defect:** The panel smoke passed only on retry in two earlier acceptance runs and failed both attempts in another. In the definitive series it failed as a report-only contention job in runs 4 and 5. Reproduced more than once. It belongs to #459 (panel surfaces).
- **Plugin-manifest panel geometry defect:** The wait for `the structure scrollbar publishes its settled dock-height geometry` timed out on both attempts of the first FAST gate and later caused behavioral-contract retries. Reproduced more than once. The lifecycle now has an independent contention rate; the product fix remains with #459 (panel surfaces).
- **Scrollbar deep-wheel defect:** The wait for `the deep widest line is visible during the wheel drive` first passed only on retry and later failed both attempts. Reproduced more than once. The final contention samples passed `5/5`; the earlier red rate remains in the ledger history.
- **Git-watch timeout:** The git-watch harness passed only on retry once during acceptance. I did not reproduce it a second time. Its loaded result now remains visible without a blocking retry.
- **Bounded-list popup timeout:** Definitive run 3 passed only on retry. I did not reproduce it a second time, so it remains blocking and needs follow-up evidence before reclassification.
- **FAST slowest-table output:** A FAST gate with zero parallel jobs printed an empty ranked row, `1. 0m00.000s —`. Observed once. I did not change this unrelated reporting defect.
- **Contract map gap:** The [round 1 brief](brief-457-1-serial-tail-lacks-quiet-retry.md) said the machine-speed invariant was written nowhere, but [harness.invariants.md](../../../../scripts/harness/harness.invariants.md) already contains `Blocking gate verdicts use ordering and counts`. The record needs refinement, not duplication.
