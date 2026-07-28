# READY — task 137 one-command exploratory driver

Commit: `317e267 Add one-command PTY exploration driver`

## Delivered

- `bun run drive` boots the real `src/main.ts` process through
  `PtyTestDriver`, waits for published `ready=true` and
  `renderQuiescent=true` through the existing condition/frame authorities,
  flushes the production terminal emulator, and prints a numbered grid.
- Every observation prints all sorted published status/probe keys with JSON
  values.
- `--open`, `--geometry`, and `--size` cover workspace/file, terminal, and
  scale variation. A file is opened from a disposable single-file snapshot so
  exploratory edits cannot touch the source.
- Repeated `--key`, `--wheel`, and `--click` inputs preserve command-line
  order and print a fresh observation after each action.
- Timeout failures exit nonzero with the named awaited condition and final
  grid.
- `scripts/harness/drive.md` is linked beside the drive-first law in
  `AGENTS.md`; it includes the command, flags, output-reading guidance, and
  the recorded diff-ruler geometry reproduction.
- No assertion or gate step was added.

The shared scale-fixture generator from task 136 is not present on this base.
This driver therefore writes generated fixtures under
`tmp/drive/fixture-<line-count>/`. A shared generator should replace that
private generation method when task 136 lands.

## Driven verification

Full output is retained under `/tmp/drivequick-final/`.

- `bun run drive` — `DEFAULT_EXIT=0`. Printed a settled `120x40` default
  workspace grid and 212 published keys.
- `bun run drive --open TASK.md --geometry 90x24` — `FILE_EXIT=0`. Printed
  the source path, a settled `TASK.md` editor grid, and `focus="editor"`.
- `bun run drive --size 100000 --geometry 100x28` — `LARGE_EXIT=0`. The
  rendered status line reported `100000 lines`; the publication reported
  `renderQuiescent=true`.
- `bun run drive --size 200 --geometry 100x28 --key End --wheel down
  --click 60,12` — `INPUT_EXIT=0`. Four grids were printed: settled boot,
  `after 1: key End`, `after 2: wheel down`, and
  `after 3: click 60,12`. Published evidence moved from cursor
  `{line:0,col:0}` to `{line:0,col:38}`, then `editorScrollTop=1`, then
  cursor `{line:7,col:16}` with mouse `{type:"up",x:60,y:12,button:0}`.
- `bun run drive --timeout 1` — `TIMEOUT_EXIT=1`, with:
  `Timed out waiting for grid condition: the application to publish ready
  and render-quiescent state`, followed by the final `120x40` grid.

## Required verification

- `bunx tsc --noEmit` — `TSC_EXIT=0`
- `bun test` — `BUN_TEST_EXIT=0`; 1665 pass, 0 fail, 67501 expectations
  across 250 files
- `bash scripts/conventions-gate.sh` — `CONVENTIONS_EXIT=0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — `INVARIANTS_EXIT=0`; 883 annotations and 67 lattice links resolved,
  0 problems
- `bun scripts/check-coverage-ratchet.ts` — `COVERAGE_EXIT=0`; 310 files,
  no undeclared decrease
- Commit — `COMMIT_EXIT=0`

The implicated project and harness invariants are upheld: all app input and
output stays on the real PTY; the production emulator remains the screen
oracle; complete synchronized frames bound observations; every wait is a
named condition rather than a sleep or frame ordinal; async status is
re-read; the tool adds neither assertions nor pass/fail semantics.

Worktree status after commit: clean; branch `feat-drive-quickstart` is one
commit ahead of `origin/main`. No push, merge, tag, branch deletion,
`scripts/merge-gate.sh`, or behavioral-contract run was performed.

## Bycatch

- Quick Open can publish `quickOpenSelected=0`, `quickOpenMatches=1`, and
  visibly render `TASK.md`, yet Enter opens `project.tasks.md` when the
  repository itself is the workspace. Exact reproduction: fresh isolated
  HOME, workspace `/tmp/conductor-drivequick`, wait for ready, send
  `Control+p`, type `TASK.md`, wait for the full query/match publication,
  send Enter. It reproduced repeatedly, including a dedicated second probe.
  Not fixed; the driver uses a disposable single-file workspace for file
  arguments, while directory arguments continue to drive the requested
  workspace in place.
