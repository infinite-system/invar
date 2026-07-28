# Task 142 — bounded list popup flake — READY

## Result

Fixed the recurring bounded-list-popup smoke race in
`scripts/harness/smoke-bounded-list-popup-harness.ts`.

The popup production path was not changed. The flaky wheel loop sent one wheel
event, waited for the next synchronized frame, and sampled the grid. Under
renderer coalescing, an already in-flight momentum frame could satisfy that
wait while the new wheel repaint was absorbed into the same frame. A later
iteration could then wait forever for a frame that had no remaining visible
work.

The smoke now sends wheel input without declaring that the next frame belongs
to it and waits on a named visible condition: the popup list viewport changes
or the painted `file-100.txt` tail appears. A timeout now includes the final
terminal grid.

## Drive evidence

Baseline solo sequence before the change:

`0,0,0,0,0,0,0,0,0,0`

Gate-sized six-worker contention sequence before the change:

`0,0,0,0,0,0,0,0,0,0`

The companion completion and field-caret smokes both exited `0`.

The current checkout did not reproduce in those twenty runs. Preserved gate
evidence did reproduce the mechanism repeatedly: attempt-one failures from
03:44 through 06:31 all stopped in the wheel section while waiting for the
next complete synchronized frame, at completed-frame counts 231–235. The old
wait captured no frame, which was itself the diagnostic defect.

The timeout waited on no semantic outcome; it waited only for the next DEC
2026 synchronized-frame end marker. Wheel input does change terminal cells,
so this was not a status-only publication race. `ScrollableTextViewport`
requests the first render for the queued impulse and the animation cadence
continues the glide; neither is a second scroll-state writer. The defect was
the smoke attributing an arbitrary coalesced frame to one input.

The drive covers the 103-item popup and the small breadcrumb and branch
adapters in the same real-PTY run.

## Positive control

Temporarily reversing the tested wheel direction exited `1` with:

`Timed out waiting for grid condition: wheel scrolling changes the visible
popup list or reveals its tail`

The captured 120×40 final grid showed the popup still at its head, painting
`a-ordinary.txt` through `file-029.txt`; `file-100.txt` was not visible. The
downward direction was restored and the smoke returned to ALL-PASS.

## Invariant review

Derived scope: the root movement/seam contracts, the UI bounded-popup
contracts, and the harness wait contracts.

- Strengthened `Harness waits observe conditions not frame ordinals`.
- Upheld `Bounded list popups share paint and hit geometry`.
- Upheld `List interactions inspect only visible rows`; the comparison scans
  only the bounded painted viewport, independent of item count.
- Upheld `Wheel impulses start their own frame sequence` and the one-writer
  scroll discipline; no production owner changed.

Mechanical result: 870 annotations resolved, 45 lattice links resolved,
0 problems.

## Final verification

- Smoke 10× exit codes, in order:
  `0,0,0,0,0,0,0,0,0,0`
- `bunx tsc --noEmit`: exit `0`
- `bun test`: exit `0` — 1,651 pass, 0 fail, 67,367 expectations
- `bash scripts/conventions-gate.sh`: exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit `0`
- `bun scripts/check-coverage-ratchet.ts`: exit `0` — popup smoke
  46 assertions / 69 waits → 46 assertions / 70 waits

`scripts/merge-gate.sh` was not run.

## Commit

- Branch: `fix-bounded-list-popup-flake`
- Commit: `bec9bca64079eaafd754508be961591491a53036`
- Worktree: clean

## Bycatch

None observed.
