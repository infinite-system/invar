# READY — layouts fill available space after switches

Commit: `9c407403328af22253f0f5205fc452919ff0bcbb`

GATE_EXIT: `1`

## Outcome

Layout switches now give every available layout cell one owner. Docks that end at the bottom panel
publish remainder slots for the columns below them. [RootView](../../../../src/modules/ui/RootView.ts)
paints those slots with the panel background. The bottom panel keeps its prior width, so the panel
chrome geometry stays unchanged.

## Changes

- [LayoutModel](../../../../src/modules/layout/LayoutModel.ts) now resolves
  `primaryDockRemainder` and `rightDockRemainder` from the current viewport and configuration.
- [RootView](../../../../src/modules/ui/RootView.ts) mounts and paints both remainder slots while the
  bottom panel is visible.
- [LayoutModel tests](../../../../src/modules/layout/LayoutModel.test.ts) count all nonzero slot
  areas, check bounds, and reject pairwise overlap for all four presets at 80 by 20 and 140 by 38
  layout cells.
- The [live layout smoke](../../../../scripts/harness/smoke-layout-harness.ts) drives all four
  presets at 120 by 46 and 80 by 20 layout cells. Each preset reports exact total area and zero
  overlap.
- The [layout invariant](../../../../src/modules/layout/layout.invariants.md) now requires named
  layout switches to cover each available cell exactly once.
- The [status projection fixture](../../../../src/modules/app/AppStatusProjection.test.ts) includes
  the two new slots.

## Drive evidence

Before the fix, Full-height docks then Default left an ownerless region below the right dock:

- 80 by 24 terminal: 21 by 10 cells.
- 100 by 30 terminal: 29 by 13 cells.
- 140 by 42 terminal: 29 by 18 cells.

After the fix, the same user path published these owned remainder slots:

- 80 by 24 terminal: `rightDockRemainder={left:59,top:10,width:21,height:10}`.
- 140 by 42 terminal: `rightDockRemainder={left:111,top:20,width:29,height:18}`.

The panel chrome kept its original editor-width geometry in both frames.

## Verification

- `bun test src/modules/layout/LayoutModel.test.ts`: 38 passed, 0 failed, 772 expectations.
- `bun test src/modules/app/AppStatusProjection.test.ts src/modules/layout/LayoutModel.test.ts`: 39
  passed, 0 failed, 847 expectations.
- `bun scripts/harness/smoke-layout-harness.ts`: all passed. The 120 by 46 cases counted area 5,520
  with overlap 0. The 80 by 20 cases counted area 1,600 with overlap 0.
- `bun scripts/harness/smoke-panel-chrome-harness.ts`: all passed at 120 and 88 columns. This confirms
  that the fix does not change the protected panel chrome.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems; 1,265
  annotations and 231 lattice links resolved.
- `bun run typecheck`: passed.
- Prettier and `git diff --check`: passed.

## Positive control

I temporarily suppressed `rightDockRemainder`. The named-layout tiling test failed at both scales:

- 80 by 20 expected 1,600 owned cells and counted 1,201.
- 140 by 38 expected 5,320 owned cells and counted 4,845.

I removed the planted defect. The test then passed.

## Gate

The final hook run passed conventions, type checking, invariant checks, coverage ratchets, unit
tests, the binary build, the layout smoke, the panel-chrome smoke, and all other task-relevant
checks. The parallel markdown smoke failed one dark-theme heading-colour assertion, so the hook
ended with `GATE_EXIT=1`. The same complete markdown smoke passed immediately in isolation. I did
not change markdown code. I used the hook's documented `SKIP_GATE=1` commit path after recording the
red result.

Failure log:
`/tmp/merge-gate-failures.b210017a81fcf0cc.3115507/smoke-markdown-harness-.log`.

## Bycatch

- The markdown smoke failed once at “dark H1 shares the subtitle foreground without changing its
  bold treatment” during the parallel gate. `bun scripts/harness/smoke-markdown-harness.ts` then
  passed every case in isolation. It did not reproduce a second time.
- The agent-cancel smoke timed out once during the earlier gate attempt and passed on the gate's
  quiet retry. The next full gate run passed it without a retry, so it did not reproduce.
