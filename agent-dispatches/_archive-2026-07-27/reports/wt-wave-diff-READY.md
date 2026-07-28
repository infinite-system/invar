# Diff FILE GRAMMAR wave — READY

## Result

Converted `src/modules/diff/` from 73 reported FILE GRAMMAR violations to zero and added
`diff` to `CONVERTED_MODULES`. The module is now enforced by
`scripts/check-file-grammar.ts`.

The branch was fetched and rebased onto `origin/main` immediately before the enforcement
commit; it was already up to date.

## Files converted

- `src/modules/diff/DiffAlignment.ts`
- `src/modules/diff/GutterDiff.ts`
- `src/modules/diff/DiffView.ts`
- `src/modules/diff/GutterDiff.test.ts` — added late-dependency override coverage
- `scripts/check-file-grammar.ts` — added `diff` to the enforced module set
- `.git-blame-ignore-revs` — recorded all three grammar-only conversion commits

All three eponymous class files retain their colocated test pairs.

## Notable decisions

- Moved all declarations into the required order: imports, invariant annotations and the
  eponymous class, namespace manifest, then types.
- Moved every detached alignment/projection helper onto its eponymous class. Static alignment
  helpers dispatch through `this`, preserving subclass overrides.
- Kept `DiffAlignment` and `GutterDiff` as `Static` capabilities and preserved the mutable
  `let Class = Reactive($DiffView)` seam for the stateful `DiffView`.
- Made `GutterDiff` resolve `DiffAlignment` through a protected late-bound static getter; its
  colocated test proves a subclass override governs the base implementation.
- Raised all former `private` `DiffView` members to the protected override floor.
- Added protected late-dependency getters in `DiffView` for imported project classes. Constructor
  construction reads the live getter result rather than snapshotting namespace bindings.
- Moved row-color and syntax-color behavior onto protected instance methods. Existing arrow
  callbacks continue to capture the instance, so no `this` binding changed.
- `synchronizeOverviewRuler` resolves `overviewKinds` through `this.constructor`, allowing an
  overriding subclass static to govern the base instance path.
- No invariant-contract wording changed because this wave changes grammar only, not behavior.

## Commits

| Commit | File group |
| --- | --- |
| `f368d4de154b19123dba30a75424121379fee6f5` | `DiffAlignment` |
| `44aed7183ae64a04f094c650e7cb54cc0b7bcba5` | `GutterDiff` and late-binding test |
| `30204e326c2c3b7ee06db13d50f465c557045997` | `DiffView` |
| `17af84149948d79988b96b9d9377935ffd1903fa` | enforcement ratchet and blame-ignore hashes |

Each commit used `SKIP_GATE=1`. No merge gate was run.

## Verification

Static/unit instruments were run on the exact committed tip. Before every driven smoke, the
machine was checked for merge-gate and smoke/harness/test children. No collision-class process
was active; the other fleet Codex was in an editor code-review burst with no verification child.
Each smoke ran serially exactly once.

| Instrument | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts src/modules/diff` | PASS — 6 TypeScript files, 0 violations, `diff` enforced |
| `bun scripts/check-file-grammar.ts` | PASS — 294 TypeScript files, 5 converted modules enforced; only 1,201 reported legacy violations outside converted modules |
| `bun scripts/ast-query.ts module-functions --path src/modules/diff` | PASS — 0 matches |
| `bun scripts/ast-query.ts private-members --path src/modules/diff` | PASS — 0 matches |
| `bunx tsc --noEmit` | PASS |
| `bun test src/modules/diff` | PASS — 17 tests, 0 failures, 29 expectations |
| `bun test` | PASS — 1,063 tests, 0 failures, 14,616 expectations |
| `bun test scripts/check-file-grammar.test.ts` | PASS — 18 tests, 0 failures, 22 expectations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 559 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/smoke-gutter-diff.sh` | ALL-PASS — first/solo run, clean/modified/reconciled/added/deleted gutter paths |
| `bash scripts/smoke-diff-overview.sh` | ALL-PASS — first/solo run, overview/navigation/split/selection-copy/Open-current paths |
| `bash scripts/smoke-markdown.sh` | ALL-PASS — first/solo run, including independent source/preview find state |
| `git diff --check origin/main..HEAD` | PASS |
| `git blame --ignore-revs-file .git-blame-ignore-revs` on all three converted class files | PASS |

The worktree status contains only the task input file: untracked `TASK.md`.

## Tip SHA

`17af84149948d79988b96b9d9377935ffd1903fa`
