# TASK — #188: #168 regressed three harnesses. Main is RED. Find which conversion is wrong.

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh` as your own verification — it is red
for the reason you are fixing. Do NOT push, merge, tag or delete. Report to
[/tmp/188-frame-wait-regressions-READY.md](../../../../../../../../../../../tmp/188-frame-wait-regressions-READY.md). `export PATH=$HOME/.bun/bin:$PATH`, then `bun install`
FIRST — a fresh worktree has no `node_modules`.

## The population separation is already done. Start from it.

| commit | `smoke-settings-applied-harness` | `not a child of __root__` errors |
|---|---|---|
| `4e7abd0` — before #168 and #170 | **exit 0, ALL-PASS** | **0** |
| `d9e66e5` — **#168 only** | **exit 1, FAIL** | **10** |

**#168 caused this.** Not pre-existing, and #170 is not implicated for that harness.

Method that produced it, because it is cheap and you will reuse it: one scratch worktree
(`git worktree add --detach`), `bun install` ONCE, then `git checkout <commit>` between runs reusing
`node_modules`. Two minutes per data point.

## The gate on `715c980`

    RETRIED AND STILL FAILED:  smoke: editor harness
                               smoke: reserved chord harness   <- #170's new smoke, passed standalone
                               smoke: settings-applied harness
    PASSED ONLY ON RETRY:      smoke: shortcut-help harness
    total 4m56s (parallel 2m19s / 60 jobs, serial 2m12s)

Both named failures have the same shape — **an opened file never renders**:

- `reserved-chord`: `Timed out waiting for Quick Open selects small.txt from the typed query`
- `settings-applied`: `Timed out waiting for grid condition: w.txt is rendered before its setting
  snapshot`, preceded by ten `Renderable with id <x> is not a child of __root__, skipping remove`
  naming `root-column`, `bounded-list-popup`, `bounded-list-popup-backdrop`,
  `bounded-list-popup-close`

## Eliminated already — do not re-derive

- **Not a semantic merge conflict.** `grep -E 'awaitQuiescence|awaitNextCompletedFrame|awaitNextCompletedFrameSnapshot'`
  in `smoke-reserved-chord-harness.ts` finds nothing, so #170's smoke does not use a primitive #168
  deleted.
- **Not contention.** All three were retried and still failed. A pool-load artefact rescues on the
  quiet retry.
- **Not pre-existing** for settings-applied, per the table.

## Step 1 — separate the other two

Run `smoke-editor-harness.ts` and `smoke-reserved-chord-harness.ts` at `4e7abd0`, `d9e66e5` and
`715c980`. Report an ordered table. `reserved-chord` does not exist before `715c980`, so for it the
comparison is: does it pass on #170's branch tip alone (`finished/170-ctrl-comma-swallowed`) but fail
once #168 is present?

## Step 2 — find the wrong conversion among #168's 75

#168 replaced 75 frame-ordinal waits with named result conditions. That was the right change and the
original deterministic red it fixed must stay fixed. But at least one conversion is now **narrower
than the claim it replaced** — a wait that returns before a render it was implicitly covering.

The failures cluster on "a file opens and renders", so start there:

- `awaitScreenChange` (the replacement for `awaitQuiescence`) — its claim is "the grid/native-caret
  signature changed after this input". Opening a file may change the signature at the tab bar before
  the editor body paints, satisfying the wait early.
- `sendKeysAndAwaitGridConditionByteArrival` — now searches already-observed snapshots for its
  predicate. If the predicate is satisfiable by an intermediate frame, it stops too soon.

**The renderable-tree message is your best clue.** Something removes renderables from a parent that
does not own them. Establish whether that is CAUSE (a corrupted tree prevents the render) or SYMPTOM
(teardown noise after the real failure) — those need different fixes, and #159/#161/#172 all turned
on exactly that distinction.

## Constraints — the important one first

- **DO NOT restore a broader wait to make these pass.** That reverts #168 and re-hides a
  deterministic red. `behavioral-contracts` is ALL-PASS on `d9e66e5` and must remain so — verify it
  after every change and quote the exit code.
- **Do not re-add the deleted primitives.** A structural check must keep reporting zero
  `awaitNextCompletedFrame` / `awaitQuiescence` identifiers under `scripts/harness`.
- If a conversion genuinely needs a condition the app cannot express, **ADD THE OBSERVABLE.** #168 set
  that precedent by publishing `contributedSurfaceAnimationAtRest` when a diff's painted cells could
  not reveal whether momentum was active. That is the right move, not a timeout.
- Never widen a timeout or frame budget.
- Ordered pass/fail SEQUENCES, never rates. #168 found its own root cause from a `FAIL, PASS, FAIL,
  PASS` fingerprint that a percentage would have hidden.
- Positive control per repair: break it again, quote the red, restore, quote the green.

## Not yours to fix here

`shortcut-help` passed only on retry — that is #177's one-retry-per-gate-different-smoke pattern, a
separate open hypothesis. Report if you see it; do not fix it.

## The lesson this task exists to close

#168 reported these failures as *"candidates for defects the old over-broad waits were absorbing"* —
plausible, and wrong. It ran them only against its own worktree, which already contained its changes.
**An observation made only on the changed tree cannot distinguish "I revealed this" from "I caused
this."** One run at the merge base settles it. Apply that to your own findings before reporting them.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt because it mutates in place. Invariant records live
at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full descriptive
identifier names. 80 columns.

## BYCATCH

Report every defect you SEE; fix only what you were SENT for, under a `## Bycatch` heading with exact
reproduction, repetition count, commit — **and state for each whether you verified it at the merge
base.**

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 918
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh` (must stay ALL-PASS), plus the three named harnesses green and
the separation tables.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
