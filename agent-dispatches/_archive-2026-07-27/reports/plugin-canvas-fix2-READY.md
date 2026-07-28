# Plugin canvas NUDGE 2 — READY

Commit: `af51321` (`Restore live plugin canvas observations`)

## Fixes

### Editor `scrollTop` observation

This was suspect **2**, the dropped-live-read class. The editor wheel and the
scrollbar both still used the same live `workspace.editor.viewport`; there was
no copied viewport and no second owner. The `ScrollbarSync` extraction removed
the `TUI_DEBUG_BARS` publication from the per-frame bar application path.
Consequently, the harness repeatedly selected the last persisted
`editor-scrollbar-v` log record: `viewportRows` and `totalRows` happened to
remain correct, while `scrollTop` was captured at one old value.

`ScrollbarSync.applyBar` now publishes the current call's `scrollSize`,
`viewportSize`, and `scrollPosition` after applying each live per-frame
geometry. The three final drives observed 159, 155, and 156 distinct wrap-off
positions, rather than one.

### Branch-selector anchor

The contributed Git pane supplied pane-local `column` / `row` coordinates to
`BoundedListPopup.openAt`, whose anchor contract is screen coordinates. For a
low sidebar anchor this looked like an anchor near row zero, so the popup chose
the downward placement.

`Sidebar` now supplies both freshly computed content-local geometry and the
original absolute screen point in `PanePointerContext`.
`GitPaneContent` passes `context.screenColumn` / `context.screenRow` to the
branch popup. All three bounded-popup drives proved the low branch selector
opens upward.

### Live contributed-value ratchets

- `src/modules/app/StatusProjectionContributions.test.ts` registers a snapshot
  closure, reads it through the host at `changesScrollTop=3`, mutates it to
  `19`, and reads through the host again. A registration-time capture fails.
- `src/modules/ui/Sidebar.test.ts` drives pointer and horizontal-wheel events,
  changes the host content-body origin from `(4,3)` to `(9,6)`, then drives
  again. It proves each event receives newly derived local geometry while
  retaining its exact screen anchor.
- The horizontal wheel contribution now receives that live row context, so the
  Git plugin routes changes-region and log-region scrolling independently.
  `GitWorkspace.renderVersion` observes both horizontal scroll positions, and
  the Git status contribution publishes both positions.

### Full-smoke omissions exposed after the fail-fast regressions

Once the two requested assertions passed, the remaining scrollbar phases
exposed three other port omissions from the same extraction:

- horizontal editor/tree bar track colours had been dropped;
- the contributed Git pane no longer converged its horizontal extents and
  vertical region sizes from current host layout;
- opening a bottom-panel terminal/agent did not withdraw focus from the
  contributed primary dock, so Git consumed agent paste/Enter.

The old bar styling is restored, Git pane extents are now recomputed in its
`onResize` port, horizontal wheel routing uses current row geometry, and
bottom-panel activation blurs the primary dock. The complete scrollbar smoke
now reaches `ALL-PASS`.

## Verification

Initial reproductions before the fixes:

| Command | Exit |
|---|---:|
| `bun scripts/harness/smoke-scrollbars-harness.ts` | 1 |
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` | 1 |

Final smoke matrix:

| Smoke | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `smoke-scrollbars` | 0 | 0 | 0 |
| `smoke-bounded-list-popup` | 0 | 0 | 0 |
| `smoke-gutter-diff` | 0 | 0 | 0 |
| `smoke-git-watch` | 0 | 0 | 0 |
| `smoke-git-log` | 0 | 0 | 0 |
| `smoke-git-blame` | 0 | 0 | 0 |
| `smoke-activitybar` | 0 | 0 | 0 |
| `smoke-layout` | 0 | 0 | 0 |
| `smoke-overlay-dialog` | 0 | 0 | 0 |
| `smoke-settings-applied` | 0 | 0 | 0 |
| `smoke-selection` | 0 | 0 | 0 |
| `smoke-workspace-tabs` | 0 | 0 | 0 |

Final gates:

| Check | Exit |
|---|---:|
| `bunx tsc --noEmit` | 0 |
| `bun test` (1,365 pass, 0 fail) | 0 |
| invariant checker `--all` | 0 |
| invariant checker `--refs` | 0 |
| invariant checker `--all --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |
| `git diff --check` | 0 |

After the commit hook formatted the staged files, the committed tree was
re-confirmed with `smoke-scrollbars`, `smoke-bounded-list-popup`,
`bunx tsc --noEmit`, `bun test`, the combined invariant checker, conventions,
and coverage; each exited `0`.

## Activation re-confirmation

The original unresolved-paint-barrier measurement was repeated for 101
plugin-backed workspace switches:

- median synchronous switch: `0.005083 ms`
- p95 synchronous switch: `0.022084 ms`
- maximum synchronous switch: `0.123708 ms`

The median is unchanged from the accepted measurement; p95 is within
`0.000292 ms`, and the maximum decreased from `0.141459 ms`.

Each of the three workspace-tabs runs reported:

- tiny tree: `2` ignore-query subprocesses, `5` retained watches
- wide 500-directory tree: `2` ignore-query subprocesses, `522` retained
  watches

The ignore-query count therefore remains width-independent at `2 / 2`.
