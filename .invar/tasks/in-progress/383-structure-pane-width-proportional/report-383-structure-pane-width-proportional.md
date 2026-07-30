# READY #383 — the right panel is proportional; the editor is prominent

Commit: `803c2b38` on `fleet/383-structure-pane-width-proportional`
Gate: `GATE_EXIT=0`, `merge-gate: ALL-PASS`, total 6m18s, through the pre-commit hook.
Report written by the builder. Not pushed, not merged.

## What was wrong

The right dock width came from one persisted number, `Settings.rightDockWidth`
(default 28 cells). Nothing bounded it against the row it had to fit. On a small
terminal the left dock group and that fixed 28 left the editor a sliver.

## Evidence per geometry

Driven with the real app through
[the probe](probe-383-right-panel-width.ts), which reads the published
`layoutSlots` key. Command:
`bun .invar/tasks/in-progress/383-structure-pane-width-proportional/probe-383-right-panel-width.ts`

Before the fix:

```
200x50  editor=134 rightDock=28 ratio=0.14 OK
160x48  editor=94  rightDock=28 ratio=0.17 OK
120x36  editor=54  rightDock=28 ratio=0.23 OK
100x30  editor=34  rightDock=28 ratio=0.28 OK
80x24   editor=14  rightDock=28 ratio=0.35 INVERTED
1 geometry(ies) inverted
```

After the fix:

```
200x50  editor=134 rightDock=28 ratio=0.14 OK
160x48  editor=94  rightDock=28 ratio=0.17 OK
120x36  editor=54  rightDock=28 ratio=0.23 OK
100x30  editor=34  rightDock=28 ratio=0.28 OK
80x24   editor=22  rightDock=20 ratio=0.25 OK
0 geometry(ies) inverted
```

At 64x20, below the brief's range, the dock takes 12 and the editor 14. The rule
holds there too.

## The chosen proportion and why

Two bounds apply and the smaller one wins.

1. At most 30 percent of the whole terminal row.
2. At most one column less than an even split of the columns the editor center
   and the dock actually share. That share is the row minus the left dock group,
   the right-dock splitter, and the right activity bar.

Bound 1 is the "less prominent" rule the user asked for. I picked the top of the
25-30 band because the pane holds tree labels, and 25 percent truncates them
harder for no gain at the widths where bound 1 is the binding one.

Bound 1 alone is not enough. At 80 columns the left dock group takes 37 cells,
so 30 percent of the row (24) still beats the editor's 18. Bound 2 is what makes
"never exceeding the editor's share" true at every geometry. Bound 2 alone would
allow a 40-column dock on a 200-column terminal, which is prominent again. Each
bound covers the other's blind spot.

The floor stays 1 column, so the bound can never produce a negative or zero slot.

## Where the fix lives

At the right-panel layout generator, not per pane:
[`LayoutModel.resolve`](../../../../src/modules/layout/LayoutModel.ts) clamps the
requested `rightDockColumns` through the new
`LayoutModel.maximumRightDockColumns` before it places any slot. Structure,
tasks, and any later right-dock occupant inherit the rule with no pane-specific
width code. `resolve` runs on every frame, so a terminal resize re-applies the
bound with no extra path.

[`RootView`](../../../../src/modules/ui/RootView.ts) now builds ONE
`LayoutModelOptions` object per question and passes it to both `resolve` and the
right-dock splitter's live `maximumSize`. The fixed `maximumSize: 70` is gone.
The divider now stops where the painted dock stops. This also removed the
duplicated options literal that the two `resolve` call sites carried.

## Drag and persistence

The stored `rightDockWidth` is a REQUEST, not the answer. The layout clamps what
it paints and never rewrites the setting. Consequences, all proven live in the
smoke:

- A drag inside the bound is granted in full. 33 requested, 33 painted at 120
  columns.
- The same session resized to 80 columns paints 18 and leaves the setting at 33.
- Resized back to 120 columns, the dock returns to the user's 33 with no second
  gesture.

If the setting were rewritten on the narrow terminal, a resize would silently
destroy a dragged width. That is the rejected alternative recorded in the new
invariant.

## Verification chain

- `bunx tsc --noEmit` → `TSC=0`.
- `bun test src/modules/layout src/modules/ui src/modules/structure` → 331 pass,
  0 fail.
- `bash scripts/conventions-gate.sh` → PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` →
  1238 annotations resolved, 0 problems.
- `bun scripts/harness/smoke-layout-harness.ts` → ALL-PASS, including the new
  arms:
  - `the 120-column layout grants the dragged width in full (33 of 33 requested)`
  - `an 80-column row keeps the editor wider than the right dock (dock 18, editor 19)`
  - `an 80-column right dock claims at most 30 percent of the row (18 of 80)`
  - `the clamp bounds the painted dock without rewriting the user width setting`
  - `an 80-column boot opens the right dock narrower than the editor (dock 20, editor 22)`
- Full merge-gate through the pre-commit hook → `GATE_EXIT=0`, ALL-PASS.

### Positive controls

The clamp was replaced with `Number.MAX_SAFE_INTEGER` and both tiers were run
again.

- `bun test src/modules/layout/LayoutModel.test.ts` → 10 fail (was 0). Sample:
  `expect(received).toBe(expected) — Expected: 20, Received: 33`.
- `bun scripts/harness/smoke-layout-harness.ts` → exit 1:
  `FAIL an 80-column row keeps the editor wider than the right dock (dock 33, editor 4)`.

The plant was removed and both went green again.

### Gate flakes

The gate's own retry tally recorded 2 arms that passed only on retry:
`smoke: panel-split harness` and `behavioral-contracts (felt invariants)`. Load
average 2.03. These are the known flaky classes named in the brief. I name them
and did not chase them.

## Invariants answered

New record, in
[layout.invariants.md](../../../../src/modules/layout/layout.invariants.md):
**The right dock stays a bounded minority of the row**. It is the width sibling
of *An unexpanded bottom panel leaves one editor row*, and it is annotated at the
three load-bearing lines plus the smoke header.

Record by record, for every record in the modules I touched:

Layout ([layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)):

- *Layout slots derive from one configuration* — UPHELD and strengthened. Still
  one `resolve` per frame. RootView now feeds it and the splitter bound from one
  options object, so no consumer re-derives a layout quantity.
- *An unexpanded bottom panel leaves one editor row* — UNTOUCHED. Its shape is
  the model I copied: a live maximum function shared by the layout and the
  splitter.
- *Default panel height scales with the viewport* — UNTOUCHED. See the comment
  drift in Bycatch.
- *Expanded panel overrides only the editor center rows* — UPHELD. The clamp
  applies before the expanded override and identically to both branches, so the
  test that expanded and regular right-dock rectangles are equal still passes.
- *A reported size never leaves its configured bounds* — UPHELD for the model.
  The right-dock maximum is now a function, which the record's mechanism already
  supports and which the bottom-panel splitter already used. See Bycatch for a
  host-side write that stresses this record's mechanism claim.
- *Only a drag in progress moves the size*, *Size changes flow through the
  onSizeChange seam*, *The splitter model carries no renderable dependency*, *A
  split ratio stays within zero and one*, *A pointer delta converts to size
  through the axis extent*, *Split arrangement follows panel content order* —
  UNTOUCHED. No change to `SplitterModel` or `PanelHost`.

Structure ([structure.invariants.md](../../../../src/modules/structure/structure.invariants.md)):

- *The structure navigator is a pane content citizen* — UPHELD, and it is the
  reason the fix sits in layout. Its impossible-if-true forbids a production file
  in `src/modules/ui`, `src/modules/app`, or `src/modules/workspace` naming the
  structure module. My RootView edit names no pane. The width rule is panel-level.
- *The structure pane shows itself for a supported document* — UNTOUCHED. The
  reveal policy is unchanged. The pane still opens by default. It opens narrower.
- *The outline projection has one depth and filter policy*, *A structure source
  answers or declines, never blanks*, *Outline cost tracks the observed
  document*, *Symbol structure is analyzer knowledge*, *Outline labels expose
  source semantics*, *Symbol selection jumps through the source-text view
  contract* — UNTOUCHED. A narrower pane truncates label paint only. No
  projection, request, or cost path changed.

UI ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)):

- *Splitter paint and hit testing share one geometry* — UPHELD. The splitter
  renderable still takes its rectangle from the one `layoutSlotGeometry`.
- *Right dock command and mouse affordance share one toggle*, *The right dock
  control owns the status edge* — UNTOUCHED, and re-driven green by the existing
  smoke arms.

Records I did NOT review: the other 60 chosen records in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) unrelated to
docks or splitters, and every record outside layout, structure, and ui. The
checker resolved all 1238 annotations with 0 problems.

## Bycatch

- COMMENT DRIFT. *Default panel height scales with the viewport* in
  [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
  says "The protected `LayoutModel.defaultBottomPanelProportion` owns the one
  0.45 default". The member in
  [LayoutModel.ts](../../../../src/modules/layout/LayoutModel.ts) is
  `DEFAULT_BOTTOM_PANEL_PROPORTION`. The record names a member that does not
  exist. Not fixed: it is a contract file, which the small-and-obvious rule
  excludes. Reproduced by reading both sides.
- INVARIANT STRESSED IN FUNCTION (suspect). *A reported size never leaves its
  configured bounds* states "the ONLY size writes route through `clamp`; there is
  no unclamped setter". Two host paths in
  [SplitterElement.ts](../../../../src/modules/ui/SplitterElement.ts) write the
  ref directly and skip the clamp: `set size(size)` and the `onMouseDown` handler
  (`this.model.size.value = currentSize`). With a persisted right-dock width of
  33 on an 80-column terminal, the mouse-down seeds the model at 33 while the
  live maximum is 18, so the model reports an out-of-bounds size until the first
  `dragTo`. Found by reading, not driven. The layout still clamps what it paints,
  so no wrong geometry reaches the screen.
- PLAIN NONSENSE (suspect, my own change's neighbour). The right-dock splitter
  keeps `minimumSize: 16` while its maximum is now live. At 64 columns the
  maximum is 12, and `SplitterModel.clamp` lets the lower bound win when it
  exceeds the upper one, so the divider would report 16 for a dock painted 12.
  The paint is correct either way. Lowering the minimum, or making it a function
  of the maximum, is a separate call I did not make inside this task.
- THE SAME INVERSION ON THE LEFT. The sidebar has no proportional bound. At 80
  columns the left dock group takes 37 of 80 cells, which is more than the editor
  gets. Seen on every 80x24 drive in this task, before and after my change, and
  it is why bound 2 above has to exist. The user's report and the widened scope
  both name the RIGHT panel, so I did not touch it. The generator is the same
  `LayoutModel.resolve`, so the same shape of fix applies. Worth a task.
- CONTRACT-LAYER GAP. `src/modules/layout/` now holds 10 records, split between
  the pure `SplitterModel` and the whole-viewport `LayoutModel`, with no lattice
  file beside them to say how they derive from and constrain each other. Two of
  them are now width-and-height siblings that state the same idea on different
  axes. [scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md) is the
  model. I did not author it, per the rule.

## Files changed

- [src/modules/layout/LayoutModel.ts](../../../../src/modules/layout/LayoutModel.ts)
  — the bound, its two constants, and the column helpers the bound and `resolve`
  now share.
- [src/modules/layout/LayoutModel.test.ts](../../../../src/modules/layout/LayoutModel.test.ts)
  — per-width cases at the default and at an unbounded request, the
  request-survives-a-resize case, and the bound's own arithmetic.
- [src/modules/ui/RootView.ts](../../../../src/modules/ui/RootView.ts) — one
  options builder for both layout questions, the live splitter maximum, and the
  tracked layout column count.
- [scripts/harness/smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts)
  — the bounded-minority arm with a real resize, and the 80-column boot arm.
- [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
  — the new record.
- [probe-383-right-panel-width.ts](probe-383-right-panel-width.ts) — the
  per-geometry driving probe, committed in the task folder.
