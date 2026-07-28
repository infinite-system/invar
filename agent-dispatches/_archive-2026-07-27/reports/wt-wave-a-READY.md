# Task Completion: Git module FILE GRAMMAR conversion

- Completed module conversion for `src/modules/git/` to FILE GRAMMAR patterns.
- Added `e1a10df92c5f32519c392bb837a9c763b4d1cedd` to `.git-blame-ignore-revs` as the worktree tip conversion commit reference.

## Files converted/updated
- `src/modules/git/GitCommands.ts`
- `src/modules/git/GitBlame.ts`
- `src/modules/git/GitParsers.ts`
- `src/modules/git/GitWindow.ts`
- `src/modules/git/GitLogRows.ts`
- `src/modules/git/CommitLog.ts`
- `src/modules/git/CommitExpansion.ts`
- `src/modules/git/GitRepository.ts`
- `src/modules/git/GitBlameCache.test.ts`
- `scripts/check-file-grammar.ts`
- `src/modules/git/__tests__/` (legacy directory removed)
- `.git-blame-ignore-revs` (appended tip SHA)

## Notable decisions and rationale
- Kept generators single-source by moving static helpers in `GitWindow.ts` to static methods on `$GitWindow` rather than exporting module-level functions.
- Bound namespaces with correct receiver in the git wrappers:
  - `GitCommands` converted to `Static($GitCommands)`.
  - `CommitLog`, `CommitExpansion`, `GitRepository` fixed to `Reactive($...)` with the matching class symbol.
- Converted remaining private class state fields to `protected` to satisfy FILE GRAMMAR constraints while preserving behavior.
- Left module-local tests in their existing per-file locations during this conversion pass and removed legacy `src/modules/git/__tests__` directory as requested.
- Parser metadata helper in `GitBlame.ts` no longer accepts an unused dependency parameter.

## Run matrix and outcomes
- `bun scripts/check-file-grammar.ts`
  - Outcome: failed early due missing dependency in environment (`typescript` import path not resolvable: `TypeError: ... ScriptTarget.Latest`).
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  - Outcome: passed, `0 problem(s)`.
- `bun test scripts/smoke-git-blame.sh`
  - Outcome: failed in unit-test phase due missing `ivue/extras` module.
- `bun test scripts/smoke-git-log.sh`
  - Outcome: passed.
- `bun test scripts/smoke-git-watch.sh`
  - Outcome: passed.
- `bun test scripts/smoke-gutter-diff.sh`
  - Outcome: passed.
- `bun test scripts/smoke-diff-overview.sh`
  - Outcome: passed.

## Tip SHA
- Current HEAD reference from worktree: `e1a10df92c5f32519c392bb837a9c763b4d1cedd`
