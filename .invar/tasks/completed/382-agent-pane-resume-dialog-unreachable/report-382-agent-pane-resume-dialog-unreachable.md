# READY: agent pane resume dialog unreachable

Commit: `ca0d75fa` (`test task pane PTY resize parity`)

The Invar resize path is correct. I found no Invar runtime defect to fix.

The probe refuted stale PTY sizing and host clipping. Claude remains the unverified boundary. Its resume chooser needs a final check in the user's real session.

## Finding

I used a disposable workspace and harmless probe tasks. I did not read or launch the repository's real `.invar/tasks.json`.

The [PTY size probe](382-pty-window-size-probe.py) reads its terminal size on every `SIGWINCH`. It draws numbered rows from `1` through `N`.

The [probe drive](382-agent-pane-size-drive.ts) compared three values:

- The panel cell region from live status.
- The child PTY size reported by the probe.
- The numbered rows visible through the real outer PTY.

The table below is the final probe output verbatim.

```text
┌───┬────────────────────┬───────────┬───────────┬────────────┬───────────────────┬───────────────────┬─────────────────────┬─────────────┐
│   │ scenario           │ outerGrid │ paneLabel │ paneRegion │ expectedChildGrid │ reportedChildGrid │ visibleNumberedRows │ resizeEvent │
├───┼────────────────────┼───────────┼───────────┼────────────┼───────────────────┼───────────────────┼─────────────────────┼─────────────┤
│ 0 │ single initial     │ 120x40    │ A         │ 83x15      │ 79x13             │ 79x13             │ 1-13 (13/13)        │ 1           │
│ 1 │ split initial      │ 120x40    │ A         │ 41x15      │ 37x13             │ 37x13             │ 1-13 (13/13)        │ 1           │
│ 2 │ split initial      │ 120x40    │ B         │ 41x15      │ 37x13             │ 37x13             │ 1-13 (13/13)        │ 1           │
│ 3 │ outer grid resized │ 100x30    │ A         │ 32x15      │ 28x13             │ 28x13             │ 1-13 (13/13)        │ 2           │
│ 4 │ outer grid resized │ 100x30    │ B         │ 32x15      │ 28x13             │ 28x13             │ 1-13 (13/13)        │ 2           │
│ 5 │ panel height grown │ 100x30    │ A         │ 32x19      │ 28x17             │ 28x17             │ 1-17 (17/17)        │ 3           │
│ 6 │ panel height grown │ 100x30    │ B         │ 32x19      │ 28x17             │ 28x17             │ 1-17 (17/17)        │ 3           │
└───┴────────────────────┴───────────┴───────────┴────────────┴───────────────────┴───────────────────┴─────────────────────┴─────────────┘
```

Candidate (a), stale or wrong PTY size, is refuted. Every reported child grid equals its expected visible grid.

Candidate (b), host clipping, is refuted after layout settles. Every case shows row `1` through the reported last row.

Candidate (c), Claude's minimum-height or resume-dialog behavior, remains. This is an inference from the two clean Invar probes.

I could not create the user's real resume state in a fixture. I also did not start a billed or stateful Claude session.

The current workaround is to grow the bottom panel or terminal window before choosing a resume option. Final confirmation needs the user's real terminal and existing Claude session.

## Change

I extended [the terminal harness smoke](../../../../scripts/harness/smoke-terminal-harness.ts). It now launches two harmless folder-open task PTYs in one split.

The smoke then resizes the outer PTY from `120x40` to `100x30`. Both guests must report the new live size and expose every row from `1` through `N`.

The waits use status and counted visible rows. They do not use frame ordinals or fixed sleeps.

No file under `src/modules/` changed.

## Positive control

I temporarily reduced the child PTY height by one row in `TerminalPaneContent.onResize`.

The new smoke failed with exit code `1`. Both guests reported `37x12` while the visible split required `37x13`.

The failure was:

```text
Timed out waiting for grid condition: both task guests report and fill their initial visible split grids
```

I removed the planted defect before verification and commit.

## Invariant review

Scope came from the changed harness, the task-pane terms, and the [filed brief](brief-382-2-agent-pane-resume-dialog-unreachable.md). The implicated contracts were the [terminal](../../../../src/modules/terminal/terminal.invariants.md), [tasks](../../../../src/modules/tasks/tasks.invariants.md), [UI](../../../../src/modules/ui/ui.invariants.md), and [harness](../../../../scripts/harness/harness.invariants.md) records.

The [agent contract](../../../../src/modules/agent/agent.invariants.md) was also reviewed because the brief named it. Its first record explicitly excludes the PTY guest path.

Implicated records:

- `The emulator is the single source of terminal screen state`: upheld. The harness observed the real emulator grid.
- `One openpty allocator serves both PTY roles`: upheld. The outer driver and nested task terminals used the shared PTY path.
- `A controlling PTY resize reaches the renderer`: upheld. The outer `100x30` resize reached status and panel layout without input.
- `Terminal bytes cross exactly one backend seam`: strengthened. The new smoke proves task-pane resize crosses the existing backend seam.
- `Pane chrome and child cells keep separate authority`: upheld. The expected grid removes the terminal gutter, and every child row remains visible.
- `The terminal is a runtime plugin`: upheld. The task process used the contributed terminal runtime.
- `Folder open starts declared tasks`: upheld. Both probe tasks started from the disposable task file.
- `Each task owns one terminal`: strengthened. Each split cell reported its own size and resize event.
- `The panel renders exactly the visible pane content cells each frame`: strengthened. Both task cells exposed complete, independent frames.
- `A split panel renders every visible cell into its own sub-region`: strengthened. The split widths matched each child's reported columns.
- `A pane runtime owns its processes`: upheld. The host only supplied pane geometry and the declared process.
- `Declared harness geometry reaches Invar`: upheld. Both outer geometries reached status.
- `Harness input and output use the real PTY`: upheld.
- `The terminal emulator is the harness screen oracle`: upheld.
- `Harness waits observe conditions not frame ordinals`: upheld.
- `Every wait names itself`: upheld.

All other terminal records were untouched. All 22 agent records were untouched by code changes.

`An agent session is a structured event stream, not a screen` confirms the scope boundary. The reported Claude path is the separate PTY guest path.

`The agent pane is a PaneContent citizen, not a special case` governs the native structured-agent pane. It does not govern this task-launched Claude terminal.

Final invariant verdict: PASS. All implicated records were upheld or strengthened. No downgrade was used.

## Verification

- `bun .invar/tasks/in-progress/382-agent-pane-resume-dialog-unreachable/382-agent-pane-size-drive.ts`: exit `0`.
- `bunx tsc --noEmit`: exit `0`.
- Focused tests: `44` passed, `0` failed, across `4` files.
- `bun scripts/harness/smoke-terminal-harness.ts`: `ALL-PASS`, exit `0`.
- Invariant checker `--all`: exit `0`.
- Invariant checker `--refs`: `1315` annotations and `263` lattice links resolved, `0` problems.
- `bash scripts/conventions-gate.sh`: `PASS`, exit `0`.
- `git diff --check`: exit `0`.

The first commit attempt triggered the repository's pre-commit merge gate automatically. I stopped it when it entered the forbidden behavioral-contract phase.

I then used the hook's documented `SKIP_GATE=1` override. The required focused checks above had already passed.

## Bycatch

- Suspect Bun `1.3.14` nested-PTY signal handling: a Bun probe stayed at `80x24` after `SIGWINCH`. The equivalent Python probe updated correctly. This reproduced twice before I replaced the probe runtime.
- Contract-layer gap: the terminal contract has no record for pane-region size parity with the nested child PTY. Existing records cover the outer PTY resize and the backend seam, but not their composition.
