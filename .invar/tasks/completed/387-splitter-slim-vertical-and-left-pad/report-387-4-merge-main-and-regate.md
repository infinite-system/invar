# READY #387 round 4 (merge main forward, re-gate)

- **Merge commit:** `974e1754`
- **Task commit (survives):** `9496aa8a`
- **Boot-fix commit:** `6601193c`. Its CONTENT does not survive. See below.
- **Branch:** `fleet/387-splitter-slim-vertical-and-left-pad`
- **GATE_EXIT:** `0`
- **Gate verdict:** GREEN on the combined tree. No `SKIP_GATE` this round.
- Tree clean. No push, no merge to main, no tag.

## 1. The boot fix resolves to main's side

Main's `c325bb41` wins. Both files are byte-identical to main after the merge:

```
git diff main -- src/modules/tasks-dashboard/TasksDashboardOverview.ts \
                 scripts/tasks/tasks-status.ts     (empty)
```

My `6601193c` restored the pre-#380 values, which is the paint-count
semantics task 348 removed. Main keeps task 348's wall-clock exports and makes
the heartbeat interval `TASKS_MOTION_STEP_MILLISECONDS` itself, so one tick is
one step. That is the correct rule: a motion step is a duration, not a frame
count, and it survives any future paint rate. The commit stays in history so
the branch reads honestly, but nothing it wrote is in the tree.

## 2. Merge forward: the pad moved to the new row owner

`src/modules/ui/PanelSeparatorRow.ts` is DELETED on main and replaced by
`PanelTabBar.ts`. Git raised it as a modify/delete conflict, which is the
classic invitation to resurrect a deleted file. I did not. I removed the file
and ported my two additions into `PanelTabBar`:

- `PanelTabBar.DRAG_LEADING_PAINT_PAD_CELLS`
- `dragLeadingPaintPadCells` on `PanelTabBarProjection`, with the same clamp
  `min(1, max(0, dragWidth - 1))`

The row order is now tabs, actions, pad, drag span, controls. Driven at
120x40:

```
22 |...│┃ Terminal  Database  ↵  ↕  ━━━━━━━━━━━━━━━━━━ +  ↗  ×
```

The blank pad cell sits between the last action icon and the first mark, which
is what the brief asked for. Cell-level read: `22,63` is a space, `22,64`
starts `━` at fg=1052692.

The slim vertical mark is unchanged by the merge and still paints on every
splitter, including the two visible in that same frame:
`rightDock 3,91 ┃ fg=1052692 bg=1710886`.

## 3. The hard constraint, re-measured on the new row

[probe-387-splitter-grab-columns.ts](probe-387-splitter-grab-columns.ts) at
100x32:

```
published drag strip: left=57 width=34 pad=1 row=17
  column 56  no grab   <- negative control
  column 57  GRAB      <- the pad cell
  column 58  GRAB
  column 74  GRAB
  column 89  GRAB
  column 90  GRAB      <- the last cell
  column 91  no grab   <- negative control
```

The GRAB run is 57 through 90, which is 34 columns, exactly the published
width, and it starts on the pad cell. The pad still costs no hit area.

The run now starts exactly at the published `left`. Main removed the one-based
column offset that round 1 measured (bycatch 4, filed as task 398), so the
published columns and the emulator grid agree again. I updated the probe header
so it does not keep asserting a stale offset.

## 4. Both assertion families kept, on main's structure

Main rewrote the section my assertions lived in and dropped its drag-resize
proof. I kept MAIN's structure and re-applied both families to it:

- PAINT: the published drag span reads `' '.repeat(pad) + '━'.repeat(width -
  pad)`, plus `pad === (width > 1 ? 1 : 0)`.
- GRAB: a drag begun on the pad cell and on the span's last cell each resize
  the panel. The edges are addressed through the PAINTED mark run, not a
  published rectangle, because a one-cell edge has no slack for a
  coordinate-space disagreement. The two drags move in opposite directions, one
  row each, so neither asks the panel to pass a bound it already sits on.
- The grab pair is guarded by `drag.width > 1`. At 88 columns the span is one
  cell, so the pair is skipped and the pad assertion still runs. Both polarities
  are covered.

`PanelTabBar.test.ts` gained one unit contract: the pad is 1 on a wide row and
0 when the span is one cell, and `leadingWidth + dragWidth + controlWidth`
still equals the row width, which is what proves the pad came out of the
glyphs and not out of the geometry.

### Positive controls, re-run on the merged tree

The assertions were rewritten, so the old controls do not transfer. All three
were run again and all three went RED:

1. Pad forced to zero in the painter: the paint assertion FAILS.
2. Pad subtracted from the renderable rectangle: FAILS, but at the PAINT
   assertion, because shrinking the rectangle also moves paint.
3. Hit rectangle shrunk by the pad while paint is compensated to stay
   identical: the paint assertion PASSES and the GRAB assertion FAILS. This is
   the one that proves the grab family is a real instrument and not a shadow of
   the paint family.

## 5. Gate

Green, `GATE_EXIT=0`, read from the pre-commit hook output.

The round-1 red is CURED, as the brief predicted. `behavioral-contracts (felt
invariants)` and its `the large fixture shows only held READY rows after
scrolling` wait both pass on current main.

The first attempt on the combined tree was red with three steps. All three are
resolved:

| step | cause | resolution |
|---|---|---|
| `coverage ratchet` | my two new assertions and two new waits exceeded main's declared decrease for the panel-chrome smoke | declaration updated to `assertions 25 → 12, waits 46 → 26` with the reason |
| `smoke: scrollbars harness` | load inside the six-worker pool | passes standalone, ALL-PASS |
| `smoke: paste harness` | REAL, and mine | fixed, see Bycatch 1 |

## Invariants

- **Splitter paint and hit testing share one geometry**
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)). Re-refined
  for the merge. The pad clause now names the tab-row order and points at
  `PanelTabBar.project` instead of the deleted `PanelSeparatorRow.project`.
- **One scrollbar painter gives each axis equal visual weight**
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)). Rides the
  merge unchanged. The scrollbars smoke is ALL-PASS standalone and green in the
  gate.
- **Tab bars share paint and hit geometry**
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)), task 346's
  record, re-answered as the brief asked. It HOLDS for the pad cell. Its subject
  is `TabBarRenderer`'s workspace and buffer strips, and its rule is that one
  column walk produces both the styled chunks and the hit segments. The pad
  touches neither. It adds no chunk and no segment: `PanelTabBar.project`
  returns the same `leadingWidth`, `dragWidth`, `controlWidth`, `tabs`,
  `editorActions` and `controls` it returned before, and the pad is a separate
  count the SPLITTER's painter consumes. The one column walk in the panel row is
  therefore still the only source of its segments. The pad is also not a gap
  chunk: it is unpainted cells inside the splitter's own rectangle, not width
  the tab bar walks past.
- **Layout slots derive from one configuration**
  ([layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)).
  HOLDS. Unchanged by the merge. The pad still derives no edge and moves no
  rectangle.
- **The right dock stays a bounded minority of the row**
  ([layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)).
  UNTOUCHED.

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
1233 annotations resolved, 231 lattice links resolved, **0 problems**.

## Bycatch

1. **GENERATOR DRIFT CAUSED BY THIS TASK, FIXED in the merge commit.**
   `smoke-paste-harness.ts` read three pane windows by slicing a column range,
   joining the rows and removing whitespace. A pane window can include the
   splitter cell beside its pane. That cell used to be blank, so whitespace
   removal reached the payload through it. It now paints `┃`, and the surviving
   mark landed in the middle of a pasted payload and broke the contiguous
   match. This is the same class as round 1's terminal-smoke drift and it is the
   second instance, so I did not patch one site: the three readers are one
   generator and are now one `paneWindowText` helper that removes whitespace and
   both marks. Reproduced standalone before the fix and ALL-PASS after.
   I swept for further instances of the pattern. `check-map-coherence.sh:238`
   trims a box-drawing set, but it reads generated map text and never an app
   frame, so it is not exposed.

2. **COMMENT DRIFT ON MAIN, NOT FIXED.**
   [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) still cites the deleted
   `PanelSeparatorRow` in three places: the Mechanism at line 372, the Evidence
   at line 389 (`src/modules/ui/PanelSeparatorRow.ts` and
   `PanelSeparatorRow.test.ts`), and the Verification command at line 400,
   which now names a test file that cannot run. These are main's own lines, not
   mine, and they sit in a record I do not own (the panel controls record).
   The invariant checker does not read prose citations, so nothing catches
   them. My own citation of that file is repaired.

3. **NONE OBSERVED** beyond the above. The round-1 items are filed as tasks
   398, 399 and 400 and I did not touch them. Task 398's subject is already
   fixed on main, which the grab probe confirms; the conductor may want to close
   it against that evidence rather than re-dispatch it.

## Files changed by this round

- `src/modules/ui/PanelTabBar.ts`, `src/modules/ui/PanelTabBar.test.ts`. The
  pad constant, its projection field, and its unit contract.
- `src/modules/ui/PanelSeparatorRow.ts`, `src/modules/ui/PanelSeparatorRow.test.ts`.
  Deleted with main. Not resurrected.
- `src/modules/ui/RootView.ts`. The pad reads from the tab-bar projection.
- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md). The pad clause follows the new row.
- `scripts/harness/smoke-panel-chrome-harness.ts`. Both assertion families on
  main's structure.
- `scripts/harness/smoke-paste-harness.ts`. One pane-window reader.
- [project.coverage-deltas.md](../../../../project.coverage-deltas.md). The declaration matches the actual counts.
- `src/modules/tasks-dashboard/TasksDashboardOverview.ts`,
  `scripts/tasks/tasks-status.ts`. Resolved to main.
- The two probes in this folder, both rerun on the merged tree.

## For the conductor

- Merge `974e1754`, gate green, tree clean, nothing pushed.
- One scratch worktree of mine is still registered:
  `/tmp/claude-1000/387-base-check`, detached at `a9700d93`. My
  `git worktree remove` is refused by the sandbox. Remove with
  `git worktree remove --force /tmp/claude-1000/387-base-check`. There is also
  a plain copy at `/tmp/claude-1000/387-novglyph` to delete.
