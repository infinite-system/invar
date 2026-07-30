# READY — Bottom panel separator actions and thin drag

Task: [bottom panel splitter — thinner + left editor buttons + always-draggable](task-317-bottom-panel-splitter-thinner-with-action-buttons.md)

State: READY

Commit: `3d3bc18a` (`Bottom panel separator actions and thin drag (#317)`)

## Result

The bottom panel separator now uses the lower-half-cell treatment from the horizontal scrollbar.
[SeparatorAppearance](../../../../src/modules/ui/SeparatorAppearance.ts) owns the one-cell
cross-axis size and the axis-specific paint. Both
[SolidThumbScrollBar](../../../../src/modules/ui/SolidThumbScrollBar.ts) and
[SplitterElement](../../../../src/modules/ui/SplitterElement.ts) use it. The full row remains the
pointer target.

The row now has this order:

`editor actions | draggable separator | panel controls`

[PanelSeparatorRow](../../../../src/modules/ui/PanelSeparatorRow.ts) projects the paint and hit
segments from one geometry. It reserves all right controls and one drag cell first. It then admits
only whole three-cell editor actions. The editor actions therefore disappear before the drag
segment can reach zero.

The first two action contributions are:

- `view.toggleWordWrap` — toggles the editor word-wrap state.

- `editor.goToLine` — opens the Go to Line prompt.

These are useful first citizens from existing editor commands. Their selection is a placeholder
for user refinement. Future commands can contribute through
[`Command.actionIcons` and `actionsForSurface`](../../../../src/modules/commands/CommandRegistry.ts)
without adding a new RootView-specific action path.

The contract refinements are in
[UI invariants](../../../../src/modules/ui/ui.invariants.md) and
[command invariants](../../../../src/modules/commands/commands.invariants.md).

## Driven evidence

The default 100×30 baseline had no left editor actions. Its separator row was:

```text
16 │    │                              │                                                        +  ↗  × │
```

After the change, a 10-line document at the same size painted:

```text
16 │    │                              │  ↵  ↕ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  +  ↗  × │
```

The published row geometry was:

```text
actions: view.toggleWordWrap, editor.goToLine
drag: left=44 width=47
controls: add 91-94, expand 94-97, close 97-100
```

At 55×24, both buttons remained and the live drag width was two cells:

```text
13 │    │                              │  ↵  ↕ ▄▄  +  ↗  × │
```

At 47×24, both buttons yielded. The one-cell drag and all three control targets remained:

```text
13 │    │                              │ ▄  +  ↗  ×│
```

The real PTY smoke dragged the separator at 55×24, 47×24, 120×50, and 100×30 with a 100,000-line
document. Every drive grew the panel and retained a nonzero drag segment. The small and large
100-column rows had the same action, drag, and control geometry.

The button drive started with `wordWrap=false` and `goToLineOpen=false`. Clicking the wrap button
produced `false → true → false`. Clicking the Go to Line button produced
`goToLineOpen=false → true`. Escape restored it to false. The 100,000-line drive repeated both
action effects.

The existing Add, Expand, Restore, and Close PTY checks remained green at the Unicode and ASCII
glyph tiers. Their published three-cell hit targets did not move at normal width.

## Positive controls

- A planted `minimumDragWidth = 0` failed
  [PanelSeparatorRow.test.ts](../../../../src/modules/ui/PanelSeparatorRow.test.ts) with
  `Expected: >= 1` and `Received: 0`. The restored test passed.

- A planted upper-half `▀` failed
  [SeparatorAppearance.test.ts](../../../../src/modules/ui/SeparatorAppearance.test.ts) because the
  contract expected lower-half `▄` cells. The restored test passed.

- A planted constant splitter appearance made
  [smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts) time out on the
  sidebar hover transition. The restored appearance probe passed for vertical and horizontal
  splitters.

## Verification

- `bun run typecheck` — exit 0.

- Focused unit tests — 20 passed, 0 failed. The added row test exhausts widths 1 through 80.

- `bun scripts/harness/smoke-panel-chrome-harness.ts` — `ALL-PASS`.

- `bun scripts/harness/smoke-layout-harness.ts` — `ALL-PASS`.

- Invariant structure and reference checks — 1,172 annotations and 223 lattice links resolved,
  0 problems.

- Enforcing pre-commit hook — `merge-gate: ALL-PASS`, `GATE_EXIT=0`.

- Git worktree — clean after commit.

## Bycatch

- The panel-chrome smoke hit a starvation timeout in two parallel gate runs. Its quiet retry passed
  both times, and every standalone run passed. This reproduced twice only under the parallel pool.
  No timeout was widened.

- The panel-split smoke hit one starvation timeout in the final parallel gate. Its quiet retry
  passed. It did not reproduce in the next action because the final gate then ended.

- The tasks-dashboard behavioral smoke once failed to reach `[x] Tasks Dashboard` in Extensions.
  The next full gate passed the same smoke. It did not reproduce.

- The invariant checker reports pre-existing canonical-name punctuation notes in the agent, git,
  markdown, narration, structure, tasks-dashboard, text, UI, and workspace contracts. The notes
  reproduced on every checker run. Both checker modes still reported 0 problems.

- [ThemeIcons](../../../../src/modules/theme/ThemeIcons.ts) records the tab dirty/active `●` as an
  inline literal owned by `TabBarRenderer`, outside theme data. The theme contract already names
  this known breach. Inspection reproduced it; this task did not change it.
