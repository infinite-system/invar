# Glide continuation READY

Branch: `fix-glide-continuation`

Commit: `87d25d0 Keep live glide velocity continuous across notches`

Worktree: `/tmp/conductor-glide`

## Outcome

`Momentum.addImpulse` now treats a same-direction impulse as a continuation
when either:

- physical velocity is still at or above `stopVelocity`; or
- the existing input-cadence proxy is still inside 150 ms.

The live motion is authoritative. The clock remains useful before motion can
establish continuation. The contrary-direction branch still returns early,
halts the glide, and applies the reversal notch from rest.

The existing `Fling gain comes from the current gesture` contract was a
clock-defined false boundary. It was refined and renamed to
`A same-direction notch never slows a live glide`, with the required
Impossible-if-true boundary and resolving annotations.

## Real-path reproduction and positive control

The PTY instrument now sends a 12-notch first gesture, waits past the 150 ms
input window while completed frames prove the glide is live, then sends one
same-direction notch immediately after a completed frame. It compares the
row crossings in that pre-boundary frame with the first completed boundary
frame. It uses row counts, not FPS.

A broad clock-only sweep requested delays of 151, 175, 200, 225, 250, 300,
350, 450, and 600 ms. The requested 200, 250, 300, and 450 ms trials
reproduced:

| Requested | Actual | Clock-only boundary |
| ---: | ---: | ---: |
| 200 ms | 212.7 ms | 4 → 3 rows |
| 250 ms | 276.6 ms | 3 → 2 rows |
| 300 ms | 307.2 ms | 3 → 2 rows |
| 450 ms | 454.3 ms | 2 → 1 rows |

The named window is: after the 150 ms cadence proxy expires, but before the
physical glide reaches its halt threshold.

Required positive control: after the fix, I temporarily restored
`gestureContinues = inputCadenceContinues` and ran the new default assertion.
It exited 1 and named every boundary:

- frame 14 at 210.3 ms: 4 → 3 rows;
- frame 23 at 271.9 ms: 3 → 2 rows;
- frame 33 at 305.4 ms: 3 → 2 rows.

The motion-aware implementation was restored before all final verification.
Its final isolated measurement was:

| Requested | Actual | Fixed boundary |
| ---: | ---: | ---: |
| 200 ms | 212.9 ms | 4 → 4 rows |
| 250 ms | 275.5 ms | 3 → 3 rows |
| 300 ms | 308.7 ms | 2 → 3 rows |

Three additional isolated fixed-form repetitions also passed every boundary.

## Gate repair

`scripts/harness/measure-scroll-smoothness.ts` now:

- records requested and actual delays;
- records pre-boundary and boundary frame numbers;
- records per-frame row-crossing counts;
- fails with the exact boundary frame when any same-direction notch reduces
  the count;
- runs the three-delay sweep only on the 2k flat editor baseline.

`scripts/behavioral-contracts.sh` requires exactly three delayed live-glide
trials beyond 150 ms, asserts a nonnegative row-count margin, and prints the
actual delay range and minimum margin.

The targeted 2k editor instrument measured 5,970.876 ms with the sweep and
3,574.106 ms without it: 2,396.770 ms added wall-clock (about 2.40 s).

## Exact verification results

| Command | Exit/result |
| --- | --- |
| `bun install --frozen-lockfile` | 0 |
| `bunx tsc --noEmit` | 0; post-commit 0 |
| `bun test` | 0; 1,632 pass, 0 fail, 67,113 expectations, 247 files; post-commit identical |
| `bash scripts/conventions-gate.sh` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0; 863 annotations, 45 lattice links, 0 problems; post-commit 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0; 307 files, no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` run 1 | 0, ALL-PASS; continuation margin 0 |
| `bash scripts/behavioral-contracts.sh` run 2 | 0, ALL-PASS; continuation margin +1 |
| `bash scripts/behavioral-contracts.sh` run 3 | 0, ALL-PASS; continuation margin 0 |
| focused `Momentum.test.ts` + `Workspace.scroll.test.ts` x3 | 0 / 0 / 0; 16 pass each |
| `bun scripts/harness/smoke-editor-harness.ts` x3 | 0 / 0 / 0; ALL-PASS each |
| `bun scripts/harness/smoke-scrollbars-harness.ts` x3 | 0 / 0 / 0; ALL-PASS each |
| clock-only positive control | 1 as required; frames 14, 23, and 33 named |
| `bash -n scripts/behavioral-contracts.sh` | 0 |
| `bunx prettier --check` on edited TypeScript | 0 |
| `git diff --check` / committed diff check | 0 |

The coverage ratchet reported only the intentional assertion-text replacement
in `Momentum.test.ts`; assertion and wait counts did not decrease.

## Handoff state

The worktree is clean at `87d25d0`. `origin/main` advanced by one
documentation-only conductor commit during the build, so this branch is
ahead 1 and behind 1; I did not merge it because the task reserves integration
for the conductor.

I did not run `scripts/merge-gate.sh`, push, merge, tag, delete a branch, or
retune momentum constants.
