# READY: quick open search bar stays visible

Task: [quick open search bar vanishes and list corrupts](task-351-quick-open-search-bar-vanishes-list-corrupts.md)

Commit: `6596712ef51b96bfd81c4670a844bba68aac93ec`

## Outcome

The fix is ready. The winning rival was long path row wrapping. Each logical result could paint
several terminal rows. Quick Open still moved and hit-tested the list as if every result used one
row. The wrapped list then displaced the query row.

The stale scroll rival was false. The published scroll position was `0` while the query row was
absent. Result overflow was the visible effect, not the generator.

The default Quick Open binding is `Ctrl+P`. `Ctrl+O` did nothing with default settings. The user
report uses a binding override for the same `quickopen.open` action. I drove defaults first and used
`Ctrl+P` for the comparison.

## Driven evidence

I opened `/home/parallels/dev/invar/.invar/tasks` as the workspace. This is the real task tree that
contains the long `326` paths.

| Geometry | Published dialog | Published extent | Before | After |
| --- | --- | --- | --- | --- |
| `100x30` | `left=20 top=2 width=60 height=17`, interior `58x15` | `contentRows=15 viewportRows=14 scrollTop=0` | The first long result occupied the first interior row and wrapped. The `↗ 326` row was absent. | `↗ 326` stayed on row 3. Every result used one row. |
| `60x15` | `left=12 top=0 width=36 height=15`, interior `34x13` | `contentRows=15 viewportRows=12 scrollTop=0` | Long results wrapped across three or four rows. The query row was absent. | `↗ 326` stayed on row 1. Every result used one row. |

This gives scale parity at the requested large and small geometries. The logical extents did not
change. Only the terminal row projection changed.

## Change

- [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) fixes the query height at one row.
  It fixes the result height to the computed viewport. It also disables wrapping on both
  renderables.
- [QuickOpenRenderer.ts](../../../../src/modules/ui/QuickOpenRenderer.ts) clips each path to the
  available display columns before padding it.
- [QuickOpenRenderer.test.ts](../../../../src/modules/ui/QuickOpenRenderer.test.ts) proves that two
  long paths produce exactly two rows of the requested display width.
- [smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts) now drives a
  compact `60x15` terminal with 24 long results. It observes every scroll position from `0` through
  `12` while moving down and up. It then shrinks the results from 24 to 5 and grows them back to 24.
  The input remains visible at every step.
- [smoke-overlay-dialog-harness.ts](../../../../scripts/harness/smoke-overlay-dialog-harness.ts)
  now locates its Quick Open click target inside the published dialog bounds. The old whole-screen
  search could match the file tree under the modal.

## Positive control

I temporarily restored wrapping, content-derived list height, and the unbounded path label. The new
PTY smoke went red with:

`Timed out waiting for grid condition: the input row remains visible after the result set shrinks`

The failure frame started with `scroll-target-*` results on the first interior row. It contained no
`↗ scrolltarget` input row. I removed the plant and reran the smoke green.

## Invariants

The task candidates found the overlay and scroll domains. They missed two direct records.

- [The terminal shows a bounded viewport](../../../../project.invariants.md#the-terminal-shows-a-bounded-viewport)
  requires the terminal projection to remain within fixed rows and columns.
- [A scrollable pane height is an input not an output](../../../../src/modules/ui/ui.invariants.md#a-scrollable-pane-height-is-an-input-not-an-output)
  was the most direct missed record. Quick Open computed a virtual window but allowed its list
  height to derive from wrapped content. The fix pins that height to the window.
- [One painter draws every single-line text field](../../../../src/modules/ui/ui.invariants.md#one-painter-draws-every-single-line-text-field)
  remains upheld. Quick Open still uses the shared field painter. Its renderable now also has an
  explicit one-row box.
- [Overlay dialogs stay inside the terminal](../../../../src/modules/ui/ui.invariants.md#overlay-dialogs-stay-inside-the-terminal)
  is strengthened. Long labels can no longer paint outside their assigned result row.
- [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible)
  was the second missed record. One model result now maps to one painted and hit-tested row.
- [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md#one-generator-owns-each-scroll-position)
  remains upheld. The fix adds no scroll writer. The published position of `0` also ruled out stale
  scroll state as the cause.
- [Bounded list popups share paint and hit geometry](../../../../src/modules/ui/ui.invariants.md#bounded-list-popups-share-paint-and-hit-geometry)
  supplied the established fixed-row pattern. Quick Open does not use that popup seam.

## Verification

- `bun test src/modules/ui/QuickOpenRenderer.test.ts`: 8 pass, 0 fail, 3,850 expectations.
- `bun scripts/harness/smoke-quickopen-harness.ts`: all pass.
- `bun scripts/harness/smoke-overlay-dialog-harness.ts`: all pass.
- `bun scripts/harness/smoke-bounded-list-popup-harness.ts`: all pass.
- `bunx tsc --noEmit`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,211 annotations,
  223 lattice links, 0 problems.
- The normal commit hook ran without `SKIP_GATE`. Its final result was `merge-gate: ALL-PASS`.
  Of the 65 parallel PTY jobs, 64 passed on the first attempt. The unrelated panel-split job passed
  on its starvation retry. The serial behavioral contracts, agent permissions, overlay dialog, and
  input-byte checks passed.
- The worktree is clean.

## Bycatch

- The welcome screen says `Ctrl+P command palette`, but default `Ctrl+P` opens Go to File.
  I saw this at `100x30` and `60x15`. I reproduced it more than once. I did not change it.
- Suspect generator drift: Quick Open implements its own query, window, row clipping, and hit
  mapping in [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) and
  [QuickOpenRenderer.ts](../../../../src/modules/ui/QuickOpenRenderer.ts). The
  [bounded list interaction record](../../../../src/modules/ui/ui.invariants.md#bounded-list-interactions-live-in-one-popup)
  says bounded searchable list behavior belongs in `BoundedListPopup`. A migration needs a seam
  decision because Quick Open also owns asynchronous file enumeration and project navigation. I
  did not broaden this fix.
- The final gate saw one unrelated starvation-class retry in
  [smoke-panel-split-harness.ts](../../../../scripts/harness/smoke-panel-split-harness.ts). Its
  first attempt timed out while waiting for `panelContentOrder` and `panelCellIds` to both become
  `agent,terminal`. The quiet retry passed. I did not reproduce it a second time or change it.
