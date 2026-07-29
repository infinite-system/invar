# READY — right-dock click leaves double focus, #259

State: READY

Branch: `fleet/259-right-dock-click-leaves-double-focus`

Commit: `7c742b2726aa97aff965e86f0910001f966079df`

Subject: `Fix right dock focus ownership`

Worktree: clean

## Result

The primary dock, right dock, and bottom panel now share one
`PanelHostFocusSet`. `PanelHost.focus()` claims that set before it focuses its
content. The claim blurs every other registered host. A repeated focus call
also repairs stale sibling focus.

`RootView` and `Bootstrap` no longer repeat cross-host blur lists. The shared
operation now covers right-dock clicks, primary-dock clicks, bottom-panel
clicks, panel toggles, and panel-content activation. This also closes the
mirror gap where the bottom panel box blurred the right dock but left the
primary dock focused.

`AppStatusProjection` now publishes `primaryDockFocused`. The PTY harness can
therefore observe all three host focus flags.

The new `One panel host owns keyboard focus` record in
`src/modules/ui/ui.invariants.md` states the focus-set rule and its evidence.

## Driven evidence

Defaults came first.

### Before

I drove parent `cd5220bb` in a detached scratch worktree. The only diagnostic
edit published `primaryDockFocused`; it did not change focus behavior.

- After Extensions received focus, primary was true and right was false.
- Clicking the Structure heading left primary true and right true.
- Enter stayed in Extensions. The editor cursor remained at line 0, column 0,
  and both dock focus flags remained true.

The task's exact structure-row premise did not reproduce on this parent. A
click on the painted `greeting` row activated the symbol, changed workspace
focus to the editor, and synchronously blurred the primary dock. Its settled
flags were primary false and right true. Enter then routed through Structure
and cleared right focus.

The reproducible defect was therefore the adjacent non-activating right-dock
heading path, not a valid structure-row activation. Both paths use the same
`PanelHost.focus()` generator, so the fix does not depend on that distinction.

### After

- Opened the six-line `sample.ts` fixture.
- Focused Extensions.
- Clicked the right-dock Structure heading.
- The settled status was `primaryDockFocused=false`,
  `rightDockFocused=true`, and `terminalFocused=false`.
- Clicked the `greeting` structure row and pressed Enter.
- Input reached Structure, then returned to the editor at line 0, column 16.
  The primary dock, right dock, and bottom panel focus flags were all false.

The activity-bar PTY smoke locks the same path with a `focusTarget` fixture.
It also clicks Explorer after the right-dock path and proves that only the
primary dock owns focus.

The structure-row click alone was not a sound positive control. Symbol
activation focuses the editor before the event bubbles back through the right
dock, which can hide the original double focus. The smoke first clicks the
right-dock heading to isolate the host transfer, then drives the reported row
and Enter gesture.

## Scale parity

The shared 100,000-line fixture suppresses language structure by design, so it
does not paint the right dock. I drove the same focus-set generator through
the bottom panel at both scales:

- Small default fixture: Extensions, then the `Claude` panel heading ended
  with primary false, right false, and bottom panel true.
- Shared 100,000-line fixture: the identical gesture ended with primary
  false, right false, and bottom panel true.

The large drive published `lspSizeSuppressed=true`. No custom large fixture
was created.

## Positive controls

I planted a no-op `PanelHostFocusSet.claim`.

- `bun test src/modules/ui/PanelHostFocusSet.test.ts` exited 1. The primary
  dock stayed true after the right dock claimed focus. The test expected
  false.
- `bun scripts/harness/smoke-activitybar-harness.ts` exited 1. It timed out
  waiting for the right-dock heading click to leave only the right dock
  focused.

I removed the plant. The focused test and PTY smoke then passed.

## Final verification

`bash scripts/merge-gate.sh` ran once after the final edit and exited 0 in
3 minutes 21 seconds.

- Conventions and TypeScript: pass.
- Invariant structure and references: pass.
- All unit tests: pass.
- All 61 blocking PTY smoke jobs: pass.
- Behavioral contracts: pass.
- Input first-frame ordering and timing: pass.

The commit hook started the same gate again. I stopped that duplicate during
its PTY pool and used its documented `SKIP_GATE=1` path for the commit. The
completed final gate remains the verification result.

## Bycatch

- NOT FIXED — `smoke: panel-split harness` timed out once in the final
  parallel smoke pool. The gate classified it as starvation, preserved the
  first log, and passed its one quiet retry. It did not reproduce on that
  immediate second attempt.
