# Workspace activation — READY

Branch: `perf-workspace-activation`

Commit: `79cdeb848e38b92e18b5068d17cb3c7e2e8112ba`

Starting `origin/main`: `47802a88ab5c28f4b3b843ed8a1281946c021025`

## Result

Workspace activation is now a view-only switch. The selected workspace paints
before repository traversal or `git.refresh()`, while the inactive workspace
continues to dispose its watcher. The remaining watcher establishment runs
asynchronously and performs one bulk ignore query per retained tree depth,
instead of synchronous queries proportional to repository topology.

## Measured before and after

All values are medians of three real `GitWatcher` activations on 2026-07-25.
The before subprocess count was independently observed with `strace`; watched
directories came from the watcher itself.

| Repository | Before elapsed | Before ignore-query subprocesses | Watched directories | After synchronous construction | After background establishment | After ignore-query subprocesses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `blackline-app` | 280.308 ms | 216 | 662 | 0.145 ms | 39.595 ms | 9 |
| `realized` | 159.248 ms | 129 | 506 | 0.156 ms | 33.150 ms | 8 |
| `ivue` | 29.446 ms | 33 | 99 | 0.131 ms | 11.695 ms | 6 |

The supplied projection did not match this checkout exactly. The first two
watched-directory counts agree, but the old implementation already skipped
ignore queries for leaf directories, so subprocess counts were 216, 129, and
33 rather than 662, 506, and 151. The observed elapsed times were also much
lower than the projected 930, 710, and 210 ms. The diagnosed scaling defect
was nevertheless confirmed: synchronous ignore subprocesses scaled with
repository topology on the activation path.

The after elapsed background numbers are informational only. The non-flaking
acceptance evidence is the structural subprocess count and paint ordering
below.

## Level-order design

`GitWatcher` now establishes its watch set breadth-first:

1. Watch and read every retained directory at the current depth.
2. Gather all candidate child directories across that whole level.
3. Submit those paths through one awaited
   `git check-ignore -z --stdin` process.
4. Remove ignored children, yield to the event loop, and descend.

An ignored directory is filtered before it is watched or read, preserving the
existing pruning invariant. HEAD discovery and runtime-created-directory
checks also use asynchronous process execution. No worker was introduced.

The watcher object is still owned only by the active workspace. Suspension
disposes it, so N open workspaces do not create N live watchers.

Bootstrap supplies a next-painted-frame barrier through `WorkspaceSet` and
`Workspace`. Initial watcher establishment, reconciliation, and
`git.refresh()` await that barrier. The stale-watcher identity check prevents
deferred work from applying after another switch.

## Published harness counters

Status JSON publishes:

- `gitWatcherActivationIgnoreQuerySubprocessCount`
- `gitWatcherActivationWatchedDirectoryCount`
- `gitWatcherActivationCompleted`

## Driven evidence

`bun scripts/harness/smoke-workspace-tabs-harness.ts` exited 0 and reported
`ALL-PASS`.

- Tiny fixture: 2 ignore-query subprocesses, 5 watched directories.
- Wide fixture: 2 ignore-query subprocesses, 522 watched directories.
- The wide fixture contains 520 retained child directories plus a
  1,200-directory ignored subtree.
- The ignored subtree was pruned and never watched.
- Equal subprocess counts prove the query cost does not scale with directory
  count for equal-depth fixtures.
- Both query counts are greater than zero, proving the walk really ran.
- The first switched frame reported activation incomplete; completion and
  counters arrived afterward.
- Two open workspaces reported exactly one live `GitWatcher`, owned by the
  active workspace.

`bash scripts/smoke-workspace-tabs.sh` also exited 0 and reported
`ALL-PASS`.

## Required verification

All checks were run against the committed source:

| Command | Exit / result |
| --- | --- |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 — 1,330 pass, 0 fail, 15,730 expects, 203 files |
| `bun scripts/check-file-grammar.ts` | 0 — 385 TypeScript files, 0 violations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 — 680 annotations, 41 lattice links, 0 problems |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/harness/smoke-workspace-tabs-harness.ts` | 0 — `ALL-PASS` |
| `bash scripts/smoke-workspace-tabs.sh` | 0 — `ALL-PASS` |
| focused `bun test src/modules/git/GitWatcher.test.ts` | 0 — 8 pass, 0 fail, 37 expects |
| `git diff --check` | 0 |
| `git ls-files \| grep '^TASK'` | 1 — expected no-match result |

`scripts/check-coverage-ratchet.ts` is not present, so that conditional check
was not runnable.

## Integration note and unproved scope

No required behavior remains unproved on this commit. The merge gate was not
run, as instructed.

While the work was in progress, `origin/main` advanced by three commits. This
branch remains one commit ahead and three commits behind; it was deliberately
not rebased or merged because integration belongs to the conductor. Therefore
compatibility with those three later commits is the only unproved integration
scope.

No push, merge, tag, branch deletion, or work outside the assigned worktree
was performed. The worktree is clean.
