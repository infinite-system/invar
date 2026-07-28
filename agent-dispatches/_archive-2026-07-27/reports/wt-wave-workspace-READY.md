# Workspace grammar wave — READY

Branch: `grammar-wave-workspace`

Rebased base: `b0cebe5fe6af69ead62cb272a1eb214e1364985c` (`origin/main`)

Tip: `d603a6aad01a17e56afd832ab6f7e299b1a3cb2f`

## Files converted

- `src/modules/workspace/FileTree.ts`
- `src/modules/workspace/GitPanel.ts`
- `src/modules/workspace/OpenBufferSet.ts`
- `src/modules/workspace/Workspace.ts`
- `src/modules/workspace/WorkspaceSet.ts`
- `src/modules/workspace/FileTree.test.ts` relocated from `src/modules/workspace/__tests__/FileTree.test.ts`
- `src/modules/workspace/Workspace.test.ts` relocated from `Workspace.tabs.test.ts` to provide the strict eponymous test pair
- `src/modules/workspace/OpenBufferSet.test.ts` updated to the protected floor
- `src/modules/workspace/workspace.invariants.md` updated for the relocated evidence path
- `scripts/check-file-grammar.ts` now enforces `workspace` through `CONVERTED_MODULES`
- `.git-blame-ignore-revs` contains both proven grammar-only commit hashes

## Notable decisions

- Moved every source-file type declaration below its eponymous class and namespace manifest.
- Replaced all source `private` members with `protected` members so subclasses and tests retain override reachability.
- Moved the detached `projectNameForRoot` helper onto `Workspace` as a protected static method and resolved it through `this.constructor`, preserving subclass overrides.
- Replaced `GitPanel` split constants and `OpenBufferSet` origin data with protected static getters; instance code resolves them through `this.constructor`.
- Preserved all reactive class selections as mutable `let Class = Reactive($Class)` bindings.
- Added no constructor reads of cross-module ref getters and made no behavior changes.

## Commits

| Commit | Purpose |
| --- | --- |
| `3702df4c2cffe065b4f8a3b3ffd447254fb9504d` | Supporting workspace classes and FileTree test colocation |
| `9a7a34a1c82ef3a4bca4295975a6722b436b9562` | Workspace class conversion and eponymous test pair |
| `d603a6aad01a17e56afd832ab6f7e299b1a3cb2f` | Workspace enforcement ratchet and blame-ignore entries |

Both grammar-only hashes passed `git cat-file -e <hash>^{commit}`, `git merge-base --is-ancestor <hash> HEAD`, and exact presence checks in `.git-blame-ignore-revs` after the final rebase.

## Required verification

| Instrument | Result |
| --- | --- |
| Fresh-worktree initialization | PASS — `/home/parallels/.bun/bin/bun install --silent && git checkout bun.lock` |
| Final rebase onto `origin/main` | PASS — current branch was up to date |
| Workspace file grammar, enforced | PASS — 15 files, 0 violations, 8 converted modules enforced |
| Full file-grammar checker | PASS — all enforced modules clean; 958 reported legacy violations remain only in unconverted modules |
| TypeScript | PASS — `TSC=0` |
| Workspace unit suite | PASS — 55 tests, 197 expectations |
| Full unit suite | PASS — 1,213 tests, 15,445 expectations |
| Invariant checker `--all --refs` | PASS — 610 annotations and 39 lattice links resolved, 0 problems |
| Conventions gate | PASS |
| Machine-quiet preflight | PASS — no merge-gate or driven-smoke process |
| `smoke-workspace-tabs-harness.ts` solo | PASS 1/1 — ALL-PASS on the first attempt |

## Additional audit observation

The retired tmux audit `scripts/smoke-workspace-tabs.sh` passed every semantic assertion but exited red on its stale absolute-coordinate check expecting the second left-oriented project at row 1; the current two-line strip paints it at row 2. The gate-authoritative PTY harness uses the correct relative-row assertion and passed 1/1. No production change was made for this out-of-scope legacy audit assertion.

Working tree is clean except for the user-provided untracked `TASK.md`.
