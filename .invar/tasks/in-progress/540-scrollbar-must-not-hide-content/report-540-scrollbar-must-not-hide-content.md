# READY report — #540 (scrollbar must not hide content)

Branch: `fleet/540-scrollbar-must-not-hide-content`

Commit: `560a168c54c6c6561ae1d0d366e23050e49f79c8`

## In plain words

The horizontal scrollbar used the same row as the last line of text. It could
cover the text while leaving the line number visible. The bar now takes one
row for itself, and the cursor line moves up when that row appears.

## Result

[ScrollbarGeometry.ts](../../../../src/modules/ui/ScrollbarGeometry.ts) now
states how many content rows and columns each visible bar occupies. A hidden
bar returns no geometry and reserves no cells.

[RootView.ts](../../../../src/modules/ui/RootView.ts) asks that geometry source
whether the editor has a horizontal bar. It subtracts the returned row from
the content viewport. [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts)
still paints the bar at the raw region edge, so the content and bar no longer
move onto the same row.

[Editor.ts](../../../../src/modules/editor/Editor.ts) now keeps the cursor at
the nearest visible edge after a real viewport resize. This moved line 52 up
one row when the bar appeared. It did not snap ordinary wheel scrolling back
to the cursor.

## Driven evidence

Before the change, the default 100,000-line fixture showed line 52 on row 57.
Its gutter painted `52`, but lower-half blocks replaced its text on that same
row. The status projection reported `editorScrollTop=0` and
`editorMaximumScrollLeft=136`.

After the change, the same edit put line 52 on row 56 and the bar on row 57.
The viewport moved to `editorScrollTop=1`, so the cursor and its full line
stayed visible. Undo removed the bar, restored one content row, and kept
`editorScrollTop=1`. Redo restored the bar and kept the same top row.

The 10-line fixture kept its true last line readable while the bar occupied
row 57. Undo and redo changed the viewport from 51 rows to 52 rows and back.
`editorScrollTop` stayed at 0.

The full smoke also drove vertical and horizontal bars together at 500 and
100,000 lines. The horizontal track ended before the vertical track. The
vertical bar owned the corner cell, and the true horizontal tail remained
reachable. The vertical bar did not hide the rightmost content column.

## Permanent contract and positive control

[smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts)
now uses the shared 10-line and 100,000-line fixtures at 220 by 60 cells. Each
case edits a visible line wide, undoes the edit, and redoes it. After every
step, it checks bar visibility, readable tail text, viewport height, and
`scrollTop`.

The planted original defect set `reservedContentRows` to 0. The new smoke
turned red with this exact failure:

```text
FAIL 10-line bar removal restores exactly one row without moving scrollTop
(52 to 52, top 0)
```

I removed the plant. The focused smoke and the final full smoke then passed at
both scales.

## Invariants in scope

- **One generator owns each scroll position:** upheld. The change does not add
  a scroll writer. Viewport convergence uses the editor's existing reveal
  generator after a size change.
- **Every wheel event becomes one impulse:** upheld. The full scrollbar smoke
  retained its wheel and thumb-drag coverage.
- **Scroll frame cost is document-length independent:** upheld by structure.
  The new geometry calculation is constant work. The same drive passed at 10
  and 100,000 lines.
- **Live motion defines gesture continuation:** untouched. The momentum path
  did not change.
- **Same-direction impulses accumulate to the ceiling:** untouched. The
  momentum path did not change.
- **The glide tail is bounded and effective:** untouched. No timer, velocity,
  or tail setting changed.
- **Driven scroll contracts derive their quantities:** upheld. The smoke
  derives the one-row difference from the geometry result. Its planted defect
  proved the check can fail.

These records are in
[scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md).

## Contract proposal

Do not add a new scroll record. Refine **A scrollbar track is derived per frame
from its region rect** in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md). Add that a
visible bar reports its occupied content cells. State that the content
viewport reserves those same cells. Add this impossibility: a bar and readable
content cannot paint in the same cell.

The mechanism should name `BarGeometry.reservedContentRows`,
`BarGeometry.reservedContentColumns`, and `RootView.editorViewportHeight`.
The verification should name the new 10-line and 100,000-line edit, undo, and
redo drive. I made no contract-file edit because the brief requested a
proposal only.

## Neighbor proposal

Simplify the #531 (scrollbars grid timeout sighting) approach predicate in
[smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts).
Line 401's gutter can now prove vertical visibility by itself. The viewport
cannot place a content line on the horizontal bar row. The added line 402
check remains safe, but it now scrolls one row farther than the real condition
requires.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: 2,510 passed, 0 failed, 72,926 expectations across 389 files.
- `bun scripts/harness/smoke-scrollbars-harness.ts`: `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  1,436 annotations and 287 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: `PASS`.
- `bun run build`: compiled `dist/iv` successfully.
- Task-file diff check: no whitespace errors.

I did not run `scripts/behavioral-contracts.sh`. The repository primary loop
forbids it during iteration, and the final task-specific PTY smoke covered the
changed surface.

## Bycatch

- Instrument issue, seen once: `bun run drive -- --reload --size 10` kept the
  server's original 100,000-line workspace. The screen still showed
  `scale-100000.txt`. Stopping the server and starting a new `--size 10`
  server produced the correct fixture. I did not change the driver.
- No other runtime, contract, comment, generator, or plain-nonsense bycatch
  was observed.

## Tree state

Commit `560a168c54c6c6561ae1d0d366e23050e49f79c8` contains all task changes.
The task paths are clean after the commit. Dispatch-owned changes remain in
[AGENTS.md](../../../../AGENTS.md) and untracked
[BUILDER-FUNDAMENTALS.md](../../../worktrees/540-scrollbar-must-not-hide-content/BUILDER-FUNDAMENTALS.md).
I did not edit, stage, or commit them.
