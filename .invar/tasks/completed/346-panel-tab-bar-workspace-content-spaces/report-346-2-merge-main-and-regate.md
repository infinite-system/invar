# READY report #346 round 2 — merge main and re-gate

Merge commit: `c79f94ef7db7ac5de6ceb89b61901c17dad363a6`

Parents: `9ac75e4b16d540425b258888934e13d14c948112` and `b07b0564bde31c902d5af75acc62aa9b67aebfd8`

`GATE_EXIT=0`

## Result

I merged main into the task branch. I resolved the panel chrome overlap against
the merge base. I then ran the full commit-hook gate on the combined tree. The
gate passed without a retry-only pass. The worktree is clean.

I did not push or land the branch.

## Conflict resolution

### Panel chrome smoke

The task design removes the old separator row. It also removes the
`view.toggleWordWrap` and `editor.goToLine` actions from that row. The workspace
tab bar now publishes tab segments through `editorActions`.

I did not restore the removed surface. I adapted main's retained geometry checks
in [the panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts).
The smoke now proves all of these facts at 120 by 40 Unicode and 88 by 24 ASCII:

- The published actions are the Terminal and Database workspace tabs.
- The tab span, drag span, and three right controls have no gap.
- The drag span is nonzero.
- The drag span paints a centered heavy line.
- Keyboard cycling, tab clicks, Add, expand, and close still work.
- The row has no heading.

The targeted panel chrome smoke passed at both sizes.

### RootView auto-merge

I checked the auto-merged [RootView](../../../../src/modules/ui/RootView.ts)
semantically. One layout-options object supplies both layout resolution and the
live right-dock splitter maximum. The current row and column values update per
frame. The task's panel-tab changes remain present.

The targeted layout smoke passed. At 120 columns, the dock used 33 columns and
the editor used 44. At 80 columns, the dock used 18 columns and the editor used
19. The 80-column dock stayed at or below 30 percent. The requested dock size
also survived a narrow resize and a later expansion.

This preserves the right-dock bounded-minority invariant in
[the layout records](../../../../src/modules/layout/layout.invariants.md).
It also preserves the shared splitter paint and hit geometry in
[the UI records](../../../../src/modules/ui/ui.invariants.md).

### Combined-tree dashboard interaction

The first hook run exposed a combined-tree interaction in
[the tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts).
Main's bounded right dock made the `! DEGRADED` badge consume the remaining row
width. The later `READY` text was outside the visible grid. The original wait
therefore timed out even though the dashboard had reached rest and scrolled.

I changed the wait to observe the scroll transition: the building row leaves
the viewport while held scale rows remain visible. The prior status wait still
proves that the animation reached rest. I did not widen a timeout. The targeted
dashboard smoke passed, and the next complete hook run passed.

## Verification

- `bun scripts/harness/smoke-panel-chrome-harness.ts`: passed at both sizes.
- `bun scripts/harness/smoke-layout-harness.ts`: passed, including the
  proportional right-dock bound.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts`: passed.
- Coverage ratchet against merge base `f2cf3e26a20040e6f89adaf60d727f25b6a20cc2`:
  passed across 389 files.
- Full commit-hook gate: passed, including 65 parallel smokes and the serial
  behavioral contracts.
- Retry tally: no step passed only on retry.
- Final result: `GATE_EXIT=0`.

The input-byte timing probe reported a non-blocking warning. Its median was
6.561 ms against the 6.406 ms warning line. The gate records this as trend data,
not a failure.

## Bycatch

- The tasks dashboard can clip its final `READY` text when a `! DEGRADED` badge
  appears in the bounded right dock. The first hook reproduced this twice, and
  a standalone dashboard smoke reproduced it again. I did not change the
  renderer because that display defect is outside this task. I changed only the
  smoke observation described above.
- No other bycatch was observed.
