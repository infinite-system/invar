## In plain words

The Tasks pane used to leave blank button cells, split one task across two hover areas, and show gaps between its filters. I made the pane and `tasks:watch` build each two-row task from one shared generator. After main pinned the fleet root, I corrected the extra scope row and stopped Tasks unhover from erasing tooltips on other surfaces.

## Result

#518 (live Tasks pane matches tasks watch) is READY at commit `0606d76a683f77ad39b3ccb957cf285980da24b0`.

## Round 2 repair

- Main pins `INVAR_FLEET_REPOSITORY_ROOT` outside the temporary workspace in [the plugin tests](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts). The stable live projection is therefore one scope row, one task title row, and one detail row. The test now expects `3` rows and hits the actions on visible row `3`.
- The root mouse handler used the right dock's full pointer-exit callback for every move outside the dock. That callback also cleared the global tooltip after diagnostics or editor controls had set it. [RootView](../../../../src/modules/ui/RootView.ts) now separates dock-content unhover from dock-local tooltip cleanup, and [Bootstrap](../../../../src/modules/app/Bootstrap.ts) calls only the content cleanup.
- The panel chrome drive kept the merged status-control and `Ctrl+J` lifecycle semantics. Its failure was later in the same drive, when the global tooltip clear erased the word-wrap tooltip.

- [The shared task projection](../../../../scripts/tasks/tasks-status.ts) now generates the title row, detail row, tones, phase, duration, line counts, round, READY state, session data, and gate data. Both the CLI and [the pane renderer](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts) consume it.
- Rest rows use every available text cell. Hover uses one action projection for the ellipsis point and half-open icon ranges. The icons cover the right end without moving the row or its siblings. Leaving the dock restores the full text.
- Hover follows the task group across its title and detail rows. Full-row backgrounds now include the last inner cell. A stationary pointer follows the task that moves under its visible row when tasks appear or disappear.
- The header is exactly `| LIVE | ACTIVE | DONE |`. One geometry projection paints and hits all three contiguous segments. The shared border cells belong to a segment, so the group has no dead cells.
- [The pane content](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts) uses the shared momentum, selection, drag, wrap, and clipboard seams. [The right-dock host](../../../../src/modules/ui/RootView.ts) supplies the same scrollbar and pointer routing as other hosted panes.
- [The overview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) runs one heartbeat at `1000 / 60` milliseconds. A frame advances paint only. It does not read the task tree or rebuild rows. Hidden, unpainted, and off-screen work stops.
- Fleet facts now include the main checkout and its exact `.invar/worktrees/` descendants. The pane and CLI therefore report the same live phases for the same workspace fleet.

## Driven evidence

I drove the default pane before the change. The header had gaps. Every row reserved action cells. The last task-name cell had no row background. Hover colored only the title row.

I then drove the final pane beside `bun run tasks:live`. Both showed the same five task rows in the same order, with four building phases and one exploring phase. The pane applied width truncation after it received the shared text projection.

Real boundary clicks at header offsets `+7`, `+16`, and `+6` selected Active, Done, and Live. Rest showed no action glyphs. Hover showed `… ❯  ▰  ▤  ◫  ✓` over the right end. Both rows kept the same full-width background. Moving into the editor removed every glyph and restored the text.

The motion drive advanced from paint sample `1` to `62`. It observed `61` samples in `1056.1 ms`, or `57.8` observed frames per second under PTY instrumentation, from a 60 fps target heartbeat. Hiding the pane published both `tasksAnimationAtRest=true` and `tasksDataHeartbeatAtRest=true`. The smoke proves the stable contract with ordered frame counts and flat work, not a wall-clock threshold.

The standard editor scale fixtures at sizes `10` and `100000` kept Tasks motion at rest when no task rows were present. The task-tree smoke drove `4` rows and then `500` tasks or `1000` rows. The large view painted the shared thumb, moved rows and thumb from one scroll position, and limited visible tick work to `30` painted rows across `3` ticks. Its delta was `0` task-tree reads, `2` fleet probes, `2` session probes, and `0` row rebuilds.

The adversarial drive covered fast title-to-detail hover sweeps, unhover and re-hover, inserted and removed tasks under a stationary pointer, missing/running/finished gate rows, hidden and unpainted tabs, stale session targets, lens cycling, narrow geometry, ASCII glyph fallback, absent trees, uninstall/reinstall, selection, and scrolling. The clipboard emitted OSC 52 once, in order, with the exact payload `#901 planted-building`.

## Positive controls

- I temporarily restored one-cell gaps in the production header geometry. [The task smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts) failed with `FAIL the lens header is one contiguous segmented control`. I removed the plant and the full smoke passed.
- The smoke proves that the old string `| LIVE |  | ACTIVE |  | DONE |` fails its contiguous-header predicate.
- One planted motion-time row rebuild fails the flat-frame contract.
- One planted all-tree tick fails the painted-window bound.

## Verification

- `bun scripts/harness/smoke-tasks-dashboard-harness.ts`: PASS, including every positive-control arm.
- `bun test`: PASS, `2419` tests, `0` failures, `72524` expectations across `371` files.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS. It compiled `455` modules to `dist/iv`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS, `1391` annotations, `271` lattice links, `0` problems.
- `git diff --check`: PASS.
- Worktree after commit: clean.

Round 2 required commands on commit `0606d76a683f77ad39b3ccb957cf285980da24b0`:

- `bun test src/modules/tasks-dashboard/`: PASS, `46` tests and `201` expectations.
- `bun scripts/harness/smoke-diagnostics-harness.ts`: `ALL-PASS` for both `tsgo` and `typescript-language-server`.
- `bun scripts/harness/smoke-panel-chrome-harness.ts`: `ALL-PASS` at the `10`-line and `100000`-line scales, plus `120x40` and `88x24` chrome sizes.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts`: PASS after the host pointer split.
- `bunx tsc --noEmit`: PASS after the merge repair.
- Invariant checker: PASS, `1393` annotations, `287` lattice links, `0` problems.

## Invariants

- “Panel controls share paint and hit geometry” holds. The lens group and hover actions each use one stored half-open geometry for paint and hit testing.
- “A pane is a self-contained scrollable viewport” holds. The right dock attaches a generic scroll port and the shared solid thumb.
- “One generator owns each scroll position” holds. Wheel momentum, direct scroll, and thumb changes all write through the Tasks window position.
- “Copy reaches the host terminal” holds. Pointer selection uses the shared selection models and copy emits through the clipboard capability as OSC 52.
- [The Tasks dashboard records](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) now state the shared two-row generator, contiguous controls, full-rest and hover-overlay rows, 60 fps observed motion, flat frame work, copy, scrolling, and owned fleet scope. The invariant checker found no misses.
- [The Tasks module records](../../../../src/modules/tasks/tasks.invariants.md) did not require a change. This task changed dashboard projection and hosting, not task lifecycle state.

## Instrument feedback

CONFUSING: `waitForHoverState()` timed out with “row 0 reveals hover controls” while the screen already showed the correct Tasks hover. Direct pointer moves, grid conditions, cell colors, and published state were clear and repeatable. The named hover helper needs a pane-aware target or clearer scope text.

EASY in round 2: both smoke screens kept the target control painted while its tooltip stayed absent. This made the shared tooltip erasure visible without a timeout change.

## Bycatch

- RESOLVED BY MERGED MAIN: [AGENTS.md](../../../../AGENTS.md) now indexes `.claude/skills/ui-design`. This was the contract-layer gap in the first READY report.
- No runtime defect outside the task scope appeared twice.

## Commit

`6304c18faa66a768d1761873dacbee5906a1d6bf` — `Make the live Tasks pane match tasks watch`

`0606d76a683f77ad39b3ccb957cf285980da24b0` — `Keep dock unhover from clearing other tooltips`
