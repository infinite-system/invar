# READY — #149 scheduling-derived scroll bounds

Commit: `1d72df0cecd3d86fa0fbf6734b02a0c9f45810fc`

Branch: `fix-scheduling-bound-contracts`

Worktree: clean

## Result

Both scroll canaries now use the scheduling mechanism they actually run
under.

- Scale travel is bounded by one maximum animation integration step:
  `ceil(220 rows/s * 0.1 s) = 22 rows`. The former 8-row value divided by
  target FPS, but `src/modules/app/Bootstrap.ts` permits a delayed animation
  step up to 100 milliseconds. Target FPS is a cadence goal, not a maximum
  frame duration.
- Continuation input is placed after observed live one-row motion beyond 6,
  10, and 14 moving frames. Delivered time is recorded as evidence but no
  longer controls placement.
- Continuous-input cases now report delivered duration, the per-frame
  row-crossing sequence, and maximum per-frame crossing.
- Fold-dense cadence now reports `SKIP` when glide-smoothness aborts before
  producing its 100k top-FPS reference. It no longer emits a second,
  misleading missing-input error.
- `scroll.invariants.md`, `scroll.lattice.md`, and `project.tools.md` record
  the derived reasoning.

## Reproduction before the change

Load values below are the 1/5/15-minute averages before and after each
measurement.

### Instance 1 — scale travel

Every case applied exactly 150 of 150 impulses. The sequence is
`editor 2k/100k; diff 2k/100k` rows.

| Run | Load before → after | Row-travel sequence |
| ---: | :--- | :--- |
| 1 | 0.43/0.45/0.64 → 0.54/0.47/0.64 | 405/406; 397/401 |
| 2 | 0.54/0.47/0.64 → 0.49/0.46/0.64 | 412/406; 402/402 |
| 3 | 0.49/0.46/0.64 → 0.57/0.48/0.64 | 406/412; 401/395 |
| 4 | 0.57/0.48/0.64 → 0.59/0.49/0.64 | 406/406; 402/400 |
| 5 | 0.59/0.49/0.64 → 0.46/0.47/0.63 | 405/405; 394/401 |
| 6 | 0.46/0.47/0.63 → 0.54/0.48/0.63 | 406/405; 395/402 |
| 7 | 0.54/0.48/0.63 → 0.86/0.56/0.65 | 406/406; 402/402 |
| 8 | 0.86/0.56/0.65 → 0.89/0.59/0.66 | 413/405; 402/399 |
| 9 | 0.89/0.59/0.66 → 0.84/0.59/0.66 | 405/413; 407/403 |
| 10 | 0.84/0.59/0.66 → 0.93/0.63/0.67 | 413/405; 401/402 |
| 11 | 0.93/0.63/0.67 → 0.79/0.62/0.67 | 406/405; 396/402 |
| 12 | 0.79/0.62/0.67 → 0.82/0.63/0.67 | 406/405; 403/407 |

The reported 9-row red did not recur in these 12 pre-change attempts; the
largest scale difference was 8. The premise still failed directly once
per-frame motion was recorded: post-change real drives repeatedly observed
18–20-row diff frames and 9–10-row editor frames. The old claimed maximum of
8 rows was therefore false even when the aggregate canary happened to stay
green.

The 900 ms requested input producer also delivered its 150 events over
roughly 1,014–1,052 ms in these runs. That is additional evidence that a
requested duration cannot define the motion phase.

### Instance 2 — continuation delay

Sequence entries are `delivered milliseconds: pre→boundary rows`.

| Run | Load before → after | Boundary |
| ---: | :--- | :--- |
| 1 | 0.30/0.43/0.64 → 0.27/0.43/0.64 | 208.5: 2→3 |
| 2 | 0.27/0.43/0.64 → 0.27/0.43/0.64 | 209.5: 2→3 |
| 3 | 0.27/0.43/0.64 → 0.27/0.43/0.64 | 211.9: 2→3 |
| 4 | 0.27/0.43/0.64 → 0.25/0.42/0.64 | 209.7: 2→3 |
| 5 | 0.25/0.42/0.64 → 0.25/0.42/0.64 | 208.7: 2→3 |
| 6 | 0.25/0.42/0.64 → 0.25/0.42/0.64 | 209.6: 2→3 |
| 7 | 0.25/0.42/0.64 → 0.23/0.41/0.63 | 209.0: 2→3 |
| 8 | 0.23/0.41/0.63 → 0.23/0.41/0.63 | 212.6: 3→2 RED |
| 9 | 0.23/0.41/0.63 → 0.23/0.41/0.63 | 211.0: 2→3 |
| 10 | 0.23/0.41/0.63 → 0.29/0.42/0.63 | 214.2: 2→3 |
| 11 | 0.29/0.42/0.63 → 0.29/0.42/0.63 | 219.6: 2→3 |
| 12 | 0.29/0.42/0.63 → 0.29/0.42/0.63 | 211.6: 3→2 RED |

This reproduced twice under low load. The delivered-delay distribution was
208.5–219.6 ms for a requested 200 ms.

## Direct instruments after the change

### Continuation — 10 runs

All exits were 0. Entries are
`minimum@observed moving frames: delivered milliseconds: pre→boundary`.

| Run | Load before → after | Sequence |
| ---: | :--- | :--- |
| 1 | 0.63/0.54/0.57 → 0.98/0.61/0.60 | 6@8: 308.6: 1→2; 10@10: 374.4: 1→2; 14@14: 607.1: 1→1 |
| 2 | 0.98/0.61/0.60 → 0.99/0.62/0.60 | 6@8: 308.5: 1→2; 10@11: 447.3: 1→1; 14@14: 579.1: 1→1 |
| 3 | 0.99/0.62/0.60 → 0.99/0.62/0.60 | 6@8: 313.9: 1→2; 10@11: 446.4: 1→1; 14@14: 610.9: 1→1 |
| 4 | 0.99/0.62/0.60 → 0.91/0.61/0.60 | 6@8: 315.2: 1→2; 10@10: 381.0: 1→1; 14@14: 579.9: 1→1 |
| 5 | 0.91/0.61/0.60 → 0.91/0.61/0.60 | 6@8: 310.3: 1→2; 10@11: 446.9: 1→1; 14@14: 579.4: 1→1 |
| 6 | 0.91/0.61/0.60 → 0.83/0.60/0.60 | 6@8: 311.9: 1→2; 10@11: 417.1: 1→1; 14@14: 583.0: 1→1 |
| 7 | 0.83/0.60/0.60 → 0.77/0.59/0.59 | 6@8: 314.9: 1→2; 10@11: 443.1: 1→1; 14@14: 607.4: 1→1 |
| 8 | 0.77/0.59/0.59 → 0.79/0.60/0.59 | 6@8: 310.8: 1→2; 10@10: 381.5: 1→1; 14@14: 511.3: 1→1 |
| 9 | 0.79/0.60/0.59 → 0.96/0.64/0.61 | 6@8: 313.1: 1→2; 10@11: 449.2: 1→1; 14@14: 540.6: 1→1 |
| 10 | 0.96/0.64/0.61 → 0.89/0.63/0.60 | 6@8: 308.7: 1→2; 10@11: 448.3: 1→1; 14@14: 612.2: 1→1 |

### Scale travel — 10 runs

All exits were 0 and all cases applied 150/150 impulses. Entries are
`rows/max-frame-crossing/delivered-ms`; order is editor 2k, diff 2k, editor
100k, diff 100k.

| Run | Load before → after | Sequence |
| ---: | :--- | :--- |
| 1 | 0.84/0.63/0.61 → 1.24/0.73/0.64 | 399/8/1006.9; 402/17/1039.8; 405/8/1020.9; 402/19/1023.3 |
| 2 | 1.24/0.73/0.64 → 1.09/0.73/0.64 | 406/8/1029.4; 395/18/1019.2; 406/8/1032.1; 398/20/1038.4 |
| 3 | 1.09/0.73/0.64 → 1.08/0.75/0.65 | 406/8/1031.6; 397/18/1031.9; 405/10/1023.7; 402/20/1029.6 |
| 4 | 1.08/0.75/0.65 → 0.91/0.73/0.64 | 405/9/1038.8; 399/18/1026.1; 406/8/1022.0; 402/19/1025.7 |
| 5 | 0.91/0.73/0.64 → 0.86/0.73/0.64 | 406/8/1040.8; 399/18/1042.3; 404/8/1038.9; 404/20/1027.6 |
| 6 | 0.86/0.73/0.64 → 0.68/0.69/0.63 | 406/8/1033.9; 402/18/1048.1; 406/8/1032.3; 409/20/1024.8 |
| 7 | 0.68/0.69/0.63 → 0.53/0.66/0.62 | 405/8/1038.8; 403/17/1039.9; 406/8/1030.2; 402/20/1023.4 |
| 8 | 0.53/0.66/0.62 → 0.68/0.69/0.63 | 406/8/1036.5; 403/18/1032.2; 405/8/1034.4; 395/20/1023.4 |
| 9 | 0.68/0.69/0.63 → 1.09/0.79/0.67 | 405/9/1036.1; 393/18/1020.9; 413/8/1045.5; 401/20/1031.0 |
| 10 | 1.09/0.79/0.67 → 1.07/0.80/0.67 | 405/8/1044.0; 402/18/1048.5; 405/10/1037.7; 402/20/1030.9 |

Maximum observed crossing: 20 rows. Derived bound: 22 rows.

## Positive controls

Scale bound planted red:

> editor rapid-input travel changed with document scale: 2000 lines travelled
> 400 rows, 100000 lines travelled 423 rows; one-frame budget is 22 rows from
> 220 rows/s * 0.1s maximum animation step

Continuation planted red:

> live-glide continuation boundary failed: frame 15 3->2 rows at 200.0ms
> after 6 moving frames (minimum 6); invalid placement: pre-boundary crossed
> 3 rows

Staged cascade planted upstream failure:

> FAIL glide-smoothness instrument did not complete
>
> SKIP fold-dense cadence because glide-smoothness aborted before the 100k
> top FPS reference

No `SMOOTHNESS_DEPTH_REFERENCE_FPS` error appeared. The planted process was
terminated after the skip was observed; exit 143 was expected from that
termination. The plant was removed before all green verification and commit.

## Verification

Exact exit codes:

- `bash scripts/behavioral-contracts.sh` run 1: exit 0; load
  0.71/0.74/0.65 → 1.02/0.85/0.71; 42 PASS, 0 FAIL, 0 SKIP.
- `bash scripts/behavioral-contracts.sh` run 2: exit 0; load
  1.02/0.85/0.71 → 0.50/0.73/0.69; 42 PASS, 0 FAIL, 0 SKIP.
- `bash scripts/behavioral-contracts.sh` run 3: exit 0; load
  0.50/0.73/0.69 → 0.44/0.64/0.66; 42 PASS, 0 FAIL, 0 SKIP.
- Direct continuation instrument 10x: exits
  `0,0,0,0,0,0,0,0,0,0`.
- Direct scale/coalescing instrument 10x: exits
  `0,0,0,0,0,0,0,0,0,0`.
- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0; 1,665 pass, 0 fail, 67,501 expectations across
  250 files.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 877 annotations and 67 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0; 310 files inspected, no
  undeclared decrease against `5efc870`.
- `git diff --check`: exit 0 before commit.
- Commit command: exit 0.

## Invariant review

Derived scope:

- `scroll.invariants.md` by the `glide-input-coalescing`,
  `glide-continuation`, motion, scale, and derived-quantity terms.
- `scripts/harness/harness.invariants.md` by changes under
  `scripts/harness/` and the timing/condition-wait behavior.
- `project.invariants.md` by the root behavioral contract and
  *Cost tracks the actively observed set*.

Verdicts:

- **Driven scroll contracts derive their quantities — strengthened.**
  Scale travel now derives from the configured ceiling and production
  integration cap; continuation placement derives from observed motion.
- **Live motion defines gesture continuation — upheld and strengthened.**
  The production mechanism is unchanged; its PTY proof no longer depends on
  timer precision.
- **Every wheel event becomes one impulse — upheld.** Every direct scale run
  applied exactly 150/150 impulses in all four cases.
- **Harness waits observe conditions not frame ordinals — strengthened.**
  Continuation placement now waits on moving-frame count plus a visible
  one-row crossing.
- **Timing-sensitive smokes run on a machine-wide quiet lock — upheld.**
  All direct and behavioral measurements acquired and ran serially under the
  existing quiet lock.
- **Cost tracks the actively observed set — upheld.** Small and large cases
  retain the same event/impulse mechanism; the task changes only canary
  calibration and diagnostics.

No downgrade converted a violation into a pass. The mechanical invariant
checker reports zero problems.

## Bycatch

None observed.
