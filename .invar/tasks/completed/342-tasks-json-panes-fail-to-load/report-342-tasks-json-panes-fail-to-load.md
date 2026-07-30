# READY — tasks.json panes fail to load

Task: tasks.json panes fail to load (#342)

State: READY

Commit: `60810aa94557639fdf3959d5407ea57e12ac1ee8`

## Result

Winning hypothesis: none of the four code-path rivals.

Current HEAD loads the reported task shape into two live panes. This is a negative diagnosis, not a product-code fix.

The fixture copied the two `/usr/bin/zsh -lc` tasks. Each task sourced `~/.profile_env` and entered a fake `aws-vault`.

The fake tool executed an inner `zsh -ic` with a harmless long-running loop. Both inner shells printed unique markers.

The result held with 10 and 100,000 fixture lines. It also held with and without a persisted `:2:error` pane identifier.

The first fixture run stopped at zsh's first-run setup. The isolated HOME did not contain `.zshrc`.

That result proved the inner interactive shells had live PTYs. Adding a harmless `.zshrc` removed the fixture-only prompt.

I did not run Invar against this repository's real tasks. I did not invoke real `aws-vault`, Claude, or the conductor.

## Rival findings

| Rival | Verdict | Driven evidence |
|---|---|---|
| Launch path breaks `command` plus `args` | Rejected | Both outer and inner markers appeared from the configured `/usr/bin/zsh -lc` tasks. |
| Inner `zsh -ic` lacks a TTY | Rejected | Both inner interactive shells printed markers and stayed alive in their own PTYs. |
| Group routing fails with two tasks and one issue | Rejected | Status published two unique task cell identifiers and two 34-column cells. Both headings and bodies appeared. |
| Persisted `:2:error` poisons restore | Rejected | The persisted error identifier moved the warning row first. Both task panes still loaded and remained visible. |

The remaining failure is session-specific or external to these four paths. The safety rail prevents a real credentials or conductor launch.

## Changes

- Added the reusable [task pane launch probe](probe-342-task-pane-launch.ts).
- Extended the [task PTY smoke](../../../../scripts/harness/smoke-tasks-harness.ts) with the reported nested-shell shape.
- Added a fake `aws-vault`, isolated shell files, two live markers, split-width checks, and the persisted error identifier.
- Changed no product code or contract record.

## Positive controls

The split observation went red when the Terminal task used another presentation group.

The smoke failed with:

> Timed out waiting for both reported-shape tasks own separate visible split cells

The live-process observation went red when the Terminal inner marker was suppressed.

The smoke failed with:

> Timed out waiting for grid condition: both nested interactive shells print inside their own panes

The final grid showed `MARKER_SUPPRESSED`. I removed both planted defects before the final pass.

## Harness guard audit

[PtyTestDriver](../../../../scripts/harness/PtyTestDriver.ts) sets `INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=1` for every child by default.

[Drive](../../../../scripts/harness/Drive.ts) can open any directory, including this repository. The central driver guard still suppresses folder-open tasks.

Only three smokes override the guard to `0`:

- [tasks](../../../../scripts/harness/smoke-tasks-harness.ts) uses a temporary task workspace.
- [reserved chord](../../../../scripts/harness/smoke-reserved-chord-harness.ts) uses a temporary task workspace.
- [workspace tabs](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) uses generated temporary workspaces.

No hardlink guard exists. The actual structural guard is the default environment flag at the shared driver boundary.

No new guard proposal is needed. The current guard prevents unrelated harness runs from starting real folder-open tasks.

## Invariant verdicts

All records in [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md) remain upheld:

- **Task variables resolve pass through or refuse — upheld.** `${workspaceFolder}` resolved before both shells started.
- **One task source controls each workspace — upheld.** `.invar/tasks.json` won without merging the existing VS Code source.
- **File sources report displaced built-ins — upheld.** `Displaced: Claude` stayed visible beside both selected task panes.
- **Folder open starts declared tasks — upheld.** Both `runOn: "folderOpen"` tasks started without input.
- **Each task owns one terminal — upheld.** Status showed two unique task identifiers and two live pane widths.
- **Unsupported tasks fail visibly — upheld.** The existing planted unsupported definitions remained visible and red.
- **Task launch accepts process contributions — upheld.** The seam stayed unchanged, and its targeted tests passed.

The implicated [UI records](../../../../src/modules/ui/ui.invariants.md) remain upheld:

- **Panel content order is one persisted sequence — upheld.** The restored error row changed order but did not hide either task.
- **The panel renders exactly the visible pane content cells each frame — upheld.** Both inner markers painted in separate cells.
- **A split panel renders every visible cell into its own sub-region — upheld.** Both task cells received positive, separate widths.
- **A pane runtime owns its processes — upheld.** The terminal runtime executed both declared process requests.
- **A pane content projects through exactly one surface — upheld.** Both terminal contents painted through the cell surface.

The brief missed three implicated [terminal records](../../../../src/modules/terminal/terminal.invariants.md):

- **One openpty allocator serves both PTY roles — upheld.**
- **Terminal bytes cross exactly one backend seam — upheld.**
- **The terminal is a runtime plugin — upheld.**

The brief also missed **Harness input and output use the real PTY** in the [harness contract](../../../../scripts/harness/harness.invariants.md). It remains upheld.

No invariant was violated or refined.

## Verification

- Probe: 10 and 100,000 lines, with default and persisted order. All four cases showed two cells and both inner markers.
- Targeted tests: 39 passed, 0 failed, 115 expectations.
- Task PTY smoke: `ALL-PASS`.
- TypeScript: `TSC=0`.
- Invariant checker `--all`: exit 0.
- Invariant checker `--refs`: 1,210 annotations and 223 links resolved, with 0 problems.
- Commit hook: `merge-gate: ALL-PASS`, without `SKIP_GATE`.
- Worktree: clean after commit.

The hook reported two retry-only flakes. The scrollbar smoke and behavioral contracts passed on their quiet retries.

## Bycatch

- Contract drift: [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md) names built-in suppression but omits folder-open suppression. [PtyTestDriver](../../../../scripts/harness/PtyTestDriver.ts) sets both flags.
- Gate flake: the scrollbar smoke timed out once and passed its immediate retry. It did not reproduce on the second run.
- Gate flake: behavioral contracts timed out once and passed its immediate retry. It did not reproduce on the second run.
