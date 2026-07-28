# READY — glide deadline easing and user feel candidates

Branch: `fix-glide-soft-stop`

Commit: `85b4cc8 fix(scroll): ease momentum at the glide deadline`

The worktree is clean. Nothing was pushed, merged, tagged, or deleted, and
`scripts/merge-gate.sh` was not run.

## Result

`Momentum.stepMomentum` now integrates a linear velocity ramp over the final
150 milliseconds before the selected glide deadline instead of integrating at
full velocity and cutting to zero at the cap. The ramp is applied at the one
shared momentum seam, so it affects both axes and every surface.

The from-rest velocity floor now integrates decay plus the same easing ramp.
That preserves the minimum-duration guarantee: one accepted notch still moves
one visible row at the 100 millisecond setting.

The existing 900 millisecond default and the shared editor/diff 220-unit
profile were not changed.

## Before and after — real PTY fingerprints

Each value is the visible cell crossing between consecutive completed
synchronized frames for one 60-notch write.

| Axis | Lines | Before | After |
| --- | ---: | --- | --- |
| Vertical | 2,000 | `6,7,7,8,7,8,7,7,8,7,7,8,7,7,8,7,8,7,7,8,7,7,8,7,6` | `8,8,6,8,7,8,7,7,8,7,8,7,7,7,8,7,7,8,7,7,8,5,4,2,1` |
| Vertical | 100,000 | `8,8,7,7,7,8,7,8,7,7,7,8,8,7,7,7,7,8,7,7,8,7,7,8,6` | `8,7,7,8,7,8,7,8,7,7,7,8,7,7,8,7,7,8,7,7,7,6,4,2,1` |
| Horizontal | 2,000 | `8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,8,7,7,7,8,7,7,8,7` | `8,7,7,8,7,7,7,8,8,7,7,8,7,7,7,8,7,8,6,9,6,8,5,4,2,1` |
| Horizontal | 100,000 | `7,8,6,8,8,7,7,8,7,7,7,7,8,7,7,8,7,8,7,7,7,8,7,8,6` | `7,8,7,8,7,8,7,7,7,8,7,8,7,7,7,7,8,7,7,8,7,7,6,4,2,1` |

The old cap stopped at 6–8 cells per frame. The new cap visibly descends
through 5/4/2/1 or 6/4/2/1 before rest at both scales and on both axes.

## Gentle control

The ordinary 12-notch glide still uses its existing decay tail:

- 2,000 lines, before:
  `3,3,3,2,2,2,2,1,1,2,1,1,1,1,1,1`
- 2,000 lines, after:
  `3,3,3,2,2,2,2,1,2,1,1,1,1,1,1`
- 100,000 lines, before:
  `4,3,3,2,2,2,2,1,2,1,1,1,1,1,1,1`
- 100,000 lines, after:
  `4,3,3,2,2,2,2,1,2,1,1,1,1,1,1`

It became neither longer nor slower: the moving-frame count changed from 16
to 15 and the visible distance from 27–28 rows to 26–27 rows.

## User feel candidates

These are three real 2,000-line vertical drives of the same 60-notch flick.
The branch currently carries the 150 millisecond candidate as the working
recommendation; this is not being presented as the user's final feel choice.

| Final linear ramp | Fingerprint | Final row |
| ---: | --- | ---: |
| 150 ms | `6,8,7,7,7,8,7,9,6,7,8,7,7,8,7,7,8,7,7,8,7,5,4,2,1` | 181 |
| 200 ms | `9,5,8,7,7,8,7,7,8,7,7,8,7,7,8,7,8,7,7,7,5,4,3,2` | 175 |
| 250 ms | `6,8,7,7,8,7,8,7,7,7,7,8,7,8,7,7,8,7,6,6,3,4,2,2` | 170 |

Recommendation: 150 milliseconds. It fixes the abrupt boundary with the
smallest change to the successful glide, preserves the most travel, and gives
the cleanest terminal-cell tail (`5,4,2,1`). The 200 millisecond option is
noticeably softer but removes six more rows. The 250 millisecond option starts
braking earlier and its cell-quantized tail briefly rises `3,4`, so I do not
recommend it.

## Deadline and minimum-setting evidence

At 100, 900, and 2,000 milliseconds, one notch applied exactly once, moved one
visible row, and settled at both 2,000 and 100,000 lines. The deterministic
deadline test separately holds a ceiling-sustained glide through each of those
three settings and proves it is at rest no later than the selected deadline.

The cap-shape positive control is permanent:

- unsoftened deadline: `5,5,5,5` and the taper predicate is false;
- eased deadline: `5,4,2,1` and the taper predicate is true.

The gated rapid-drive bound now derives the linear-ramp area. Its final pass
measured exactly `181/181` required rows with tail
`…7,5,4,2,1`.

## Contract changes

`scroll.invariants.md` now states that `stepMomentum` integrates the final
linear ramp and that `addImpulse` includes the ramp when computing the
one-visible-row floor. The driven rapid-travel formula now integrates the full
tail plus the half-area of the easing window.

## Verification

- hard vertical PTY drive, 2,000 and 100,000 lines: exit 0;
- hard horizontal PTY drive, 2,000 and 100,000 lines: exit 0;
- gentle vertical PTY drive, 2,000 and 100,000 lines: exit 0;
- one-notch PTY drives at 100, 900, and 2,000 milliseconds, both scales:
  exit 0 for all three;
- `bunx tsc --noEmit`: exit 0;
- `bun test`: exit 0 — 1,673 passed, 0 failed;
- `bash scripts/behavioral-contracts.sh`: exit 0, `ALL-PASS`;
- `bash scripts/conventions-gate.sh`: exit 0;
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0 — 884 annotations and 67 lattice links resolved, 0 problems;
- `bun scripts/check-coverage-ratchet.ts`: exit 0 — 52 assertions / 20 waits
  in `Momentum.test.ts`, no undeclared decrease.

The commit hook formatted three staged files. The compile, full tests,
conventions, invariants, and coverage commands above were then re-run against
the exact committed tree and all exited 0.

## Bycatch

- `Momentum.defaultOptions` is not dead. Its only production read is
  `ScrollableTextViewport.tick`, where it drives the horizontal momentum
  (`src/modules/ui/ScrollableTextViewport.ts:189-193`). Most consumers disable
  horizontal scrolling, but `HoverCard` deliberately leaves it enabled and
  supplies real `contentColumns` / `viewportColumns`
  (`src/modules/ui/HoverCard.ts:224-237`). Therefore the 80-unit profile is the
  reachable hover-card horizontal profile; the editor and diff bypass it by
  feeding their shared settings-derived 220-unit profile to both axes
  (`Workspace.ts:625-643`, `DiffView.ts:542-552`). Reported only; unchanged.
- The Round 1 bycatch still stands: twice,
  `bun run drive --open bun.lock --wheel right` labeled the first expected
  post-input frame settled while `editorScrollLeft=1` and
  `workspaceScrollMomentumAtRest=false`. This wait does not observe its stated
  condition. Reported only; unchanged in this task.
