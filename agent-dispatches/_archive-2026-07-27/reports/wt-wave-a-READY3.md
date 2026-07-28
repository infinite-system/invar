# Task 3 ready

## Error-class repairs

| Compiler error | Repair |
| --- | --- |
| TS2540 readonly `Class` assignment | Preserved `GitCommands.Class` as the required `const Class = Static($GitCommands)`. `GitCommands.test.ts` now exercises a raw subclass directly. `GitRepository` and `Workspace` expose protected late `GitCommands` dependency getters, and their tests override those getters instead of mutating the static capability binding. |
| TS2576 instance access to static members | `CommitExpansion.capacity` and `GitWatcher.filterIgnoredChildren` resolve protected statics through `this.constructor as typeof $Class`, matching the markdown conversion pattern and preserving subclass overrides. |
| TS2339 statics absent from `Reactive()` wrapper types | `GitBlameCache` resolves protected statics through its runtime constructor; its bound test reads the public limit from `GitBlameCache.$Class`, never from the reactive wrapper and without widening casts. |

## Reactive `let Class` audit

No reactive binding needed restoration at takeover tip `2fadba0`: all classes named by the brief
were already correct and remain mutable:

- `CommitLog`: `export let Class = Reactive($CommitLog)`
- `CommitExpansion`: `export let Class = Reactive($CommitExpansion)`
- `GitRepository`: `export let Class = Reactive($GitRepository)`
- `GitBlameCache`: `export let Class = Reactive($GitBlameCache)`

Static capabilities, including `GitCommands`, remain `const Class = Static($Class)`.

## Run table

| Verification | Result |
| --- | --- |
| Initial `$HOME/.bun/bin/bunx tsc --noEmit` | FAIL as expected: 16 errors, exit 2 |
| Final `$HOME/.bun/bin/bunx tsc --noEmit` | PASS, exit 0 |
| `$HOME/.bun/bin/bun scripts/check-file-grammar.ts` | PASS; git enforced-clean, 3 converted modules enforced |
| Targeted `bun test src/modules/git src/modules/workspace/Workspace.gitRaces.test.ts` | PASS; 81 tests, 0 failures |
| `$HOME/.bun/bin/bun test` | PASS; 1,015 tests, 0 failures, 14,441 expectations |
| `$HOME/.bun/bin/bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS; 535 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `bash scripts/smoke-git-blame.sh` | ALL-PASS, exit 0 |
| `bash scripts/smoke-git-log.sh` | ALL-PASS, exit 0 |
| `bash scripts/smoke-git-watch.sh` | ALL-PASS, exit 0 |
| `bash scripts/smoke-gutter-diff.sh` | ALL-PASS, exit 0 |
| `bash scripts/smoke-diff-overview.sh` | ALL-PASS, exit 0 |

Every smoke was run alone after `pgrep -af '[m]erge-gate'` returned empty.

## Commit

- `f422f5f89f15ee29584449683c8257367388d84c` — `fix(git): repair grammar conversion type seams`
- Tip: `f422f5f89f15ee29584449683c8257367388d84c`

`TASK3.md` remains the only untracked worktree file and was not committed.
