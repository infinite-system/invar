# READY — git-watch starvation retry flake

## In plain words

The smoke pressed two keys without waiting for the first key to finish. Under load, the comparison took focus and the Quick Open check timed out. The smoke now waits for the comparison and its painted headers, so it tests the real symlink action.

## Result

Commit `a90bde956b1cf4e9479cef754946e0e254c2a0ac` changes only [the git-watch PTY smoke](../../../../scripts/harness/smoke-git-watch-harness.ts).

The smoke now does these steps in order:

1. Send `o` through the real PTY.
2. Wait for `contributors.git.activeWorkspace.showingComparison` to become `true`.
3. Wait for both `node_modules` comparison headers to appear on screen.
4. Read the settled Git changed count and require it to remain at least one.

The old Quick Open detour and its pre-satisfied changed-count wait are gone.

## Reproduction and cause

The smoke passed solo before the change. Ten concurrent real-app runs produced nine passes and one matching timeout.

A second loaded probe produced one failure in 30 runs. Its timeout state was:

- `quickOpen.open = false`
- `workspaceSet.active.focus = "editor"`
- `contributors.git.activeWorkspace.showingComparison = true`
- `contributors.git.activeWorkspace.diffOpenRequestGeneration = 1`
- `contributors.git.activeWorkspace.watcher.active = true`
- `contributors.git.activeWorkspace.activationCompleted = true`
- `contributors.git.activeWorkspace.watcher.debounceTimer = null`
- `contributors.git.activeWorkspace.repository.refreshing = false`
- `contributors.git.activeWorkspace.repository.refreshRequestId = 9`

The final screen showed the `node_modules` comparison. It did not show Quick Open.

The cause was the unsequenced `o` and `Control+p` actions. The smoke sampled a scheduling outcome instead of the symlink-open outcome.

## Rejected rivals

- Debounce starvation: rejected. The timeout had no debounce timer and no refresh in progress.
- Lost watcher notification: rejected. All watcher-change arms passed, the changed count was one, and the comparison opened.
- A stale repaint wait: rejected. The graph, status snapshot, and screen all agreed that the comparison was open and Quick Open was closed.

## Positive control

I removed the `o` gesture after adding the comparison wait. The smoke failed with exit code 1.

The error named the exact condition: `showingComparison` wanted `true`, but its last settled value was `false`. I then restored the gesture.

## Load result

Five consecutive real-PTY runs passed while 12 owned CPU burners ran. Each run printed `smoke-git-watch-harness: ALL-PASS`.

## Invariant review

Scope came from [the harness contract](../../../../scripts/harness/harness.invariants.md) and the two new annotations in the smoke.

- `Harness waits observe conditions not frame ordinals`: strengthened. The old follow-up wait could observe a different key's outcome. The new graph and grid conditions observe the open action directly.
- `Every wait names itself`: upheld. The graph wait names its path and expected value. The grid wait names the confined-symlink comparison paint.

The old post-action Git count wait was a contract miss. Its predicate was true before the action. The settled query and explicit assertion replace it.

The invariant checker resolved 1,380 annotations and 266 lattice links with 0 problems.

## Verification

- `bunx tsc --noEmit` — passed.
- `bun test` — 2,376 passed, 0 failed, 72,168 expectations across 358 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — passed with 0 problems.
- `bash scripts/conventions-gate.sh` — passed.
- `bun scripts/harness/smoke-git-watch-harness.ts` — passed with `ALL-PASS`.

## Bycatch

- `Control+p` did not open Quick Open after the `node_modules` comparison gained focus. The loaded timeout and a solo sequenced probe showed the same final state. This is outside the git-watch wait fix and remains unfixed.

## Instrument feedback

- EASY: Graph queries exposed focus, comparison, watcher, debounce, and refresh state at the timeout.
- CONFUSING: The old smoke name suggested watcher starvation, although every watcher arm had already passed.
- MISSING: A shared timeout helper could capture several graph paths and the final screen in one bounded diagnostic.

## Worktree

The task commit is clean. The pre-existing untracked [BUILDER-FUNDAMENTALS.md](/home/parallels/dev/invar/.invar/worktrees/371-git-watch-starvation-retry-flake/BUILDER-FUNDAMENTALS.md) remains untouched.
