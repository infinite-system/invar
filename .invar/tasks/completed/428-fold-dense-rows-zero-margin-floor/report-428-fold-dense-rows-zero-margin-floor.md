# READY — fold-dense row contract (#428)

## Result

The fold-dense checkpoint now blocks on an exact commanded row count. It no
longer blocks on a load-sensitive time-driven distance.

Commit: `068e8aa238e6369589459cad454036b618dfc638`

## Cause

The old drive stopped adding wheel impulses when the visible top line crossed
the 1,000-row threshold. It did not halt active momentum. The final sampled
frame therefore depended on scheduling and load.

The real PTY reproduction reported 1,002 rows at 30.0 FPS before the change.
The filed evidence had already recorded 995 and 1,004 rows with healthy FPS.
This confirmed that the row floor was inside the load jitter band.

## Change

- [measure-scroll-smoothness.ts](../../../worktrees/428-fold-dense-rows-zero-margin-floor/scripts/harness/measure-scroll-smoothness.ts)
  now halts momentum through a real editor click after the drive crosses its
  target. It then uses isolated one-notch wheel corrections until the visible
  end row is exactly 1,000 rows after the start.
- The driver requires both reported travel and measured end-minus-start travel
  to equal the commanded row count.
- [behavioral-contracts.sh](../../../worktrees/428-fold-dense-rows-zero-margin-floor/scripts/behavioral-contracts.sh)
  changed the fold-dense predicate from `rows >= 1000` to exact commanded
  travel. The 28 FPS value remains a report-only canary.
- The driver and shell predicate each reject a checkpoint truncated at 999
  rows.
- I refined [the project cost record](../../../worktrees/428-fold-dense-rows-zero-margin-floor/project.invariants.md),
  [the driven scroll quantity record](../../../worktrees/428-fold-dense-rows-zero-margin-floor/src/modules/ui/scroll.invariants.md),
  [the blocking gate record](../../../worktrees/428-fold-dense-rows-zero-margin-floor/scripts/harness/harness.invariants.md),
  and [the instrument guide](../../../worktrees/428-fold-dense-rows-zero-margin-floor/project.tools.md)
  to state the exact-row mechanism.

## Negative control

I temporarily changed the real PTY target from 1,000 rows to 999 rows. The
driver exited 1 with:

`measured depth-75000 checkpoint stopped after 999 rows and reported 999; commanded 1000`

I then removed the plant. The permanent driver positive control and the shell
predicate positive control report the same expected red.

## Verification

- Real fixed PTY drive: 1,000 rows exactly, two corrections, 30.0 FPS.
- Full `bun test`, concurrent with behavioral verification: 2,265 pass, 0
  fail, 71,494 expectations across 346 files.
- Full behavioral contracts, run 1: exit 0; fold-dense 1,000/1,000 rows at
  30.1 FPS.
- Full behavioral contracts, run 2: exit 0; fold-dense 1,000/1,000 rows at
  30.0 FPS.
- Full behavioral contracts, run 3: exit 0; fold-dense 1,000/1,000 rows at
  30.0 FPS.
- All three runs rejected the 999-row shell positive control.
- `bunx tsc --noEmit`: exit 0.
- Invariant checker `--all` and `--refs`: exit 0, 1,318 annotations and
  263 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: exit 0.
- The worktree is clean.
- The full merge gate did not run to completion. The pre-commit hook started it
  automatically, so I stopped it during its unit-test phase and used the
  documented `SKIP_GATE=1` commit bypass. This followed the
  [filed brief](brief-428-2-fold-dense-rows-zero-margin-floor.md#invariants-in-scope).

## Invariant review

The change strengthens the count-based blocking verdict and keeps every wait
condition-based. The exact-row correction waits for both published momentum
rest and a closer painted row. FPS does not control the exit status.

The implicated records are upheld:

- [Harness waits observe conditions not frame ordinals](../../../worktrees/428-fold-dense-rows-zero-margin-floor/scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals)
- [Blocking gate verdicts use ordering and counts](../../../worktrees/428-fold-dense-rows-zero-margin-floor/scripts/harness/harness.invariants.md#blocking-gate-verdicts-use-ordering-and-counts)
- [Driven scroll contracts derive their quantities](../../../worktrees/428-fold-dense-rows-zero-margin-floor/src/modules/ui/scroll.invariants.md#driven-scroll-contracts-derive-their-quantities)
- [Cost tracks the actively observed set](../../../worktrees/428-fold-dense-rows-zero-margin-floor/project.invariants.md#cost-tracks-the-actively-observed-set)

## Bycatch

None observed.
