# READY — Terminal scroll parity and agent thumb stability

## Result

Terminal wheel input now has one mode-dependent owner:

- Primary screen with mouse tracking off: the wheel moves xterm scrollback through the shared
  `Momentum` physics (progressive gain, deterministic contrary-direction restart, one-row floor,
  decay, and stop threshold).
- Alternate screen **or** any enabled child mouse-tracking mode: the wheel is encoded as one SGR
  mouse event (including modifiers and pane-local coordinates) and written to the child. Host
  scrollback is not changed.

Terminal scroll position remains xterm-owned (`viewportY`). A generic optional `PaneContent` scroll
projection paints the shared `SolidThumbScrollBar`, supports drag/jump writes, and works per panel
cell without a terminal-kind render branch. Fresh child output halts terminal momentum and returns
the viewport to the live bottom.

## Agent input audit

The wrapped transcript total is exact and position-independent; word-boundary wrapping was **not**
causing the thumb breathing.

Final synchronized-frame probe:

- Completed frames: 20
- `viewportRows`: 14 in every frame
- total visual rows (`contentRows`): 181 in every frame
- `scrollTop`: `158 → 151 → 146 → 141 → 137 → 133 → 130 → 127 → 125 → 123 → 121 → 120 → 119 → 118 → 117 → 116 → 115 → 114 → 113 → 112`
- painted thumb extent: 2 rows in all 20 frames

The branch was rebased onto `origin/main` commit `ccc8c0e` and therefore inherits the landed
whole-cell thumb normalization from `fix-thumb-breathing`. The shared painter additionally enforces
the existing two-cell minimum at the final paint/hit-test rect.

## Driven terminal evidence

- Long Bash scrollback moved over synchronized frames:
  `175 → 167 → 160 → 154 → 149`
- Contrary notch reversed direction:
  `149 → 145 → 146`
- Fresh output returned to bottom at `scrollTop=178`
- Alternate-screen + mouse-tracking child received:
  `ESC [ < 64 ; 39 ; 1 M`
- Host scroll position and extent were unchanged by that child-owned wheel.

## Files

- `scripts/harness/smoke-scrollbars-harness.ts`
- `scripts/harness/smoke-terminal-harness.ts`
- `src/modules/agent/AgentPaneContent.ts`
- `src/modules/agent/agent.invariants.md`
- `src/modules/app/AppStatusProjection.ts`
- `src/modules/app/AppStatusProjection.test.ts`
- `src/modules/terminal/TerminalEmulator.ts`
- `src/modules/terminal/TerminalInstance.ts`
- `src/modules/terminal/TerminalInstance.test.ts`
- `src/modules/terminal/TerminalPaneContent.ts`
- `src/modules/terminal/TerminalPaneContent.test.ts`
- `src/modules/terminal/terminal.invariants.md`
- `src/modules/ui/PaneContent.interface.ts`
- `src/modules/ui/RootView.ts`
- `src/modules/ui/ScrollableTextViewport.ts`
- `src/modules/ui/SolidThumbScrollBar.ts`
- `src/modules/ui/SolidThumbScrollBar.test.ts`
- `src/modules/ui/ui.invariants.md`

Both extended harnesses were already registered in `scripts/merge-gate.sh`; their registered entries
remain intact.

## Verification

| Check | Result |
|---|---|
| `bun run typecheck` | PASS |
| `bun test` | PASS — 1306 tests, 15520 expectations |
| `check_invariants.mjs --all --refs` | PASS — 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 0 violations |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-terminal-harness.ts` | PASS — ALL-PASS |
| `bun scripts/harness/smoke-scrollbars-harness.ts` | PASS — ALL-PASS |
| Rebase ancestry (`ccc8c0e` ancestor of HEAD) | PASS |
| `git ls-files \| grep '^TASK'` | empty |
| Final worktree | clean |

Driven smokes were rerun sequentially after confirming no merge-gate or other harness process was
active.

## Commit

`96dd53fe16231df69b4ae11bbef3cdbbc1824368`

