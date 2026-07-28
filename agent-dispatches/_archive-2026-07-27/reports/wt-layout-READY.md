# Layout Wave 1 — READY

Branch: `feat-layout-model-wave1`

Rebased onto: `origin/main` at `7b66859`

Tip: `09cc534616af3c93938fa9443c14b2d363b9b8b7`

## Feature commits

| Commit | Feature |
| --- | --- |
| `d890073` | One shared pane-splitter generator |
| `cac9273` | Configurable layout-slot model and settings |
| `09cc534` | PaneContent-capable right dock, affordances, and driven coverage |

All commits used `SKIP_GATE=1`. No merge gate was run from this worktree.

## Splitter seam

`SplitterElement` is the single renderable/controller seam over `SplitterModel`. It owns:

- the one-cell cross-axis paint and hit region;
- pointer capture and axis/direction projection;
- rest, hover, and captured-drag state;
- the shared `palette.border` rest role and `palette.accent` active role;
- cell and ratio reporting, extent calibration, and drag callbacks;
- geometry application used by both rendering and hit testing.

Production `SplitterModel` construction now occurs only inside `SplitterElement`. The sidebar,
Git changes/log, bottom panel, right dock, split panel cells, DiffView, and MarkdownSplitView all
consume this seam.

## Layout model

`LayoutModel.resolve` consumes one live configuration and emits rectangles for:

- activity bar and primary sidebar dock;
- primary sidebar splitter;
- editor center;
- right-dock splitter and right dock;
- bottom-panel splitter and bottom panel.

The configuration includes viewport size, dock widths/visibility, bottom-panel height/visibility,
sidebar position, panel alignment, and each dock's vertical span. RootView applies those rectangles
directly in one absolute layout canvas.

Defaults are:

- sidebar position: `left`;
- panel alignment: `center`;
- left dock vertical span: `full-height`;
- right dock vertical span: `ends-at-panel`;
- right dock: empty and hidden.

## Right dock

The right slot uses a generic `PanelHost` and accepts `PaneContent`. Registering the first content
reveals a dock-style host without stealing keyboard focus. The empty host can also be toggled through
`View: Toggle Right Dock`, `Ctrl+Alt+B`, or the status-bar right-dock button.

RootView supplies PaneContent render, keyboard, paste, pointer, wheel, focus, caret, and resize paths.
The dock width is live and persisted through its shared `SplitterElement`.

## Driven configuration assertions

| Driven configuration | Asserted geometry |
| --- | --- |
| Default left + full-height + center | Panel left/right equal editor left/right; sidebar reaches the row immediately above the status bar |
| Sidebar position `right` | Primary sidebar starts at or after the editor's right edge |
| Left dock `ends-at-panel`, panel `right` | Panel reaches viewport right edge |
| Panel `justify` | Panel spans `[0, viewport right)` |
| Panel `left` | Panel spans `[0, editor right)` |
| Panel `center` | Panel returns to exact editor left/right edges |
| Right dock `ends-at-panel` with panel visible | Right-dock bottom equals bottom-panel splitter top |
| Right-dock splitter drag | Divider moves left, dock grows, and `rightDockWidth` persists above 28 |

The live configuration changes above were performed by mouse clicks on the real settings widgets.

## Splitter state assertions

| Splitter | Rest | Hover | Captured drag | Resize result |
| --- | --- | --- | --- | --- |
| Sidebar/editor | muted border background | accent background | remains accent after geometry moves | sidebar width changes |
| Git changes/log | muted border background | accent background | remains accent after geometry moves | `gitSplitRatio` changes |
| Bottom panel/editor | muted border background | accent background | remains accent after geometry moves | terminal rows grow |
| Right dock/editor | muted border background | accent background | remains accent after geometry moves | right-dock width grows and persists |

All paint verdicts came from emulator cell background bytes after real SGR mouse input.

## Verification

| Run | Result |
| --- | --- |
| `$HOME/.bun/bin/bun run typecheck` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 1,052 tests, 14,571 assertions, 122 files |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 555 annotations resolved, 39 lattice links, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-layout-harness.ts` after final rebase | ALL-PASS |
| `bun scripts/harness/smoke-activitybar-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-panel-split-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-terminal-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-terminal-stage-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-markdown-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-diff-overview-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-scrollbars-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-settings-applied-harness.ts` | ALL-PASS — all 34 schema fields covered |

The new layout harness is registered additively in `scripts/merge-gate.sh`. Existing pane harnesses
were updated only where the new centered-panel default invalidated old screen-origin assumptions.

## Task 2

Tip: `052db6ab789008591dc327ea6cff8a6f067a0bb2`

Commit: `052db6a test(layout): reconcile panel smokes` (`SKIP_GATE=1`)

### Failure verdicts

| Smoke | Verdict | Diagnosis and correction |
| --- | --- | --- |
| `paste` | stale assertion | The animation-path click still targeted column 10, now inside the full-height left dock. It now reads the resolved bottom-panel rectangle and clicks inside its left agent cell at the panel's screen-space midpoint. Input routing itself was correct. |
| `agent-pane-ux` | real break plus stale assertions | The first paint read the absolute panel renderable's previous Yoga width (`0`) before the new slot geometry laid out, rendering quiet agent content at one column until later input caused a repaint. Bottom-panel and right-dock viewport dimensions now come from the current `LayoutModel` result. Full-row border/blank-line, scrollbar, and wheel coordinates now use the exact editor-centered panel rectangle. |
| `agent-engine-switch` | real break plus stale assertions | The same zero-width first-paint defect blanked the initial pane. After the layout fix, transcript-label and engine-click assertions were moved into the exact panel rectangle; narrow-width wrapping is driven with PageUp instead of requiring old full-width content to coexist in one viewport. |

The full harness sweep also exposed stale width/race assumptions in `terminal-stage`: provider manuals
are now proven by scrolling the narrower pane, the replacement verdict asserts the visible
`terminal command user-executed` outcome, and queued staging must finish and focus the terminal cell
before the human Enter is sent.

### Focused repetitions

| Smoke | Runs | Result |
| --- | ---: | --- |
| `smoke-paste-harness.ts` | 5/5 | PASS |
| `smoke-agent-pane-ux-harness.ts` | 5/5 | PASS |
| `smoke-agent-engine-switch-harness.ts` | 5/5 | PASS |

### Full verification

| Run | Result |
| --- | --- |
| Quiet-machine check | PASS — no `bash scripts/merge-gate.sh` process before the final sweep |
| All harness smokes registered in `scripts/merge-gate.sh` | PASS — 44/44 |
| `$HOME/.bun/bin/bunx tsc --noEmit` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 1,065 tests, 14,602 assertions, 127 files |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 560 annotations, 39 lattice links, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |

Invariant review: the change strengthens `Layout slots derive from one configuration` by using the
current resolved slot for content viewport sizing and upholds the harness PTY, emulator-oracle,
condition-wait, and focused-pane routing contracts.
