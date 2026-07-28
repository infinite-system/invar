# READY — #156 (workspace tasks capability)

Branch: `feat-tasks-capability`

Commit: `e4592674e9433127a47457dc06f3356fa636d8be`
(`feat: add workspace tasks capability`)

Parent: `bf57bcffedcde4a4e493470f71110615c06726e8`

Worktree: clean.

## Delivered

- Added the `src/modules/tasks/` capability with strict whole-file
  precedence:
  `.invar/tasks.json` → `.vscode/tasks.json` → built-in Claude task.
- Kept the JSON shape VS Code-compatible, including JSONC, `label`,
  `type: "shell"`, `command`, `args`, `presentation`, `runOptions`, and
  accepted-but-ignored `problemMatcher`.
- `runOptions.runOn: "folderOpen"` now launches through the existing
  `TerminalFactory` / `OpenPtyBackend` runtime.
- Dedicated tasks receive distinct terminal panes and exact label headings;
  tasks sharing `presentation.group` are presented side by side.
- Added `Tasks: Run <label>` command-palette reruns.
- `${workspaceFolder}` substitutes before launch. Unsupported `${...}`
  variables, unsupported task types, and compound `dependsOn` definitions
  produce named task error terminals instead of being skipped.
- Added the deliberate no-config default:
  `claude --dangerously-skip-permissions --continue || claude
  --dangerously-skip-permissions`.
- Added the unused `TaskProcessLaunchContributor` seam. It contributes
  environment and arguments before exec and is named in the invariant record
  as #157's MCP injection point. No MCP or Claude-specific bridge was built.
- Left the native power-user agent pane intact and independently operable.
- Added `src/modules/tasks/tasks.invariants.md`, unit coverage, and the
  merge-gated real-PTY tasks smoke.
- Unrelated PTY fixtures explicitly suppress only the built-in convenience
  task; the tasks smoke and `bun run drive` opt into the production path.

## Driven evidence

`bun scripts/harness/smoke-tasks-harness.ts` — exit `0`

- `.vscode/tasks.json` alone launched two folder-open shell tasks.
- Both terminals printed `WORKSPACE_MATCH`, proving
  `${workspaceFolder}` reached the real shells correctly.
- The two dedicated task identifiers, exact headings, and two panel cell
  widths proved the `terminal-split` side-by-side group.
- Adding `.invar/tasks.json` launched only `Invar Wins`; neither VS Code task
  appeared, proving precedence is replacement rather than union.
- Positive control: planted `type: "process"` and `${workspaceRoot}` defects
  both appeared in semantic status and in task terminal cells.
- Removing both files ran the fake Claude `--continue` branch to failure and
  then printed the fresh-process marker, proving the built-in uses `||`.
- The native Claude agent pane opened beside the task terminal and retained
  its composer.

`bun scripts/harness/smoke-agent-harness.ts` — exit `0`

- The original native-agent boot, status-button toggle, chord, composer,
  echo round trip, and hide behavior all passed unchanged.

Scale parity:

- `bun run drive --size 11 --key Control+Shift+a` — exit `0`.
- `bun run drive --size 100000 --key Control+Shift+a` — exit `0`.
- Both scales published `source: "built-in"`, launched `Claude`, observed the
  failed-continue and fresh-fallback markers, then showed both the task and
  native agent pane with `agentTitle="Claude"`.

## Verification

Post-commit verification of the committed bytes:

- `bunx tsc --noEmit` — exit `0`.
- `bun test` — exit `0`; 1,689 pass, 0 fail, 67,566 expectations.
- `bash scripts/conventions-gate.sh` — exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 901 annotations, 67 lattice links, 0 problems. This remains
  above the required 884 / 67 floor.
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; 312 files inspected,
  no undeclared decrease.
- `bun scripts/harness/smoke-tasks-harness.ts` — exit `0`.
- `bun scripts/harness/smoke-agent-harness.ts` — exit `0`.
- Small-scale drive — exit `0`.
- 100,000-line drive — exit `0`.

`scripts/merge-gate.sh` was not run, as instructed.

## Bycatch

None observed.
