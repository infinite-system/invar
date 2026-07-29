# READY — #59 (Prettier format gate, repository reformat, and blank-line grammar)

Implementation is complete in two commits on
`fleet/59-prettier-format-gate-and-reformat`:

- Reformat/grammar commit:
  `faeaa99a48a981a6508335a8d17a9fb25099fe9c`
  (`format: enforce declaration spacing and reformat repository`)
- Blocking gate/blame metadata commit:
  `a691bbc25f9f59c2997802c77da653c4e840f22e`
  (`gate: block merges on Prettier format drift`)

The worktree is clean.

## Delivered

- Ran an AST-based one-shot inserter over every tracked TypeScript file in
  Prettier scope: 958 missing blank lines inserted in 148 files.
- Ran `bunx prettier --write .` using the existing `.prettierignore`; review
  found no generated or vendored churn requiring an ignore extension.
- Reformat commit touched 205 files: 3,761 insertions and 1,236 deletions.
  Large deletion counts were reviewed as Prettier wrapping/normalization.
- Added the enforced `top-level-declaration-spacing` rule beside the existing
  AST file-sequence grammar and added its CLI failure fixture.
- Added blocking merge-gate step:
  `step "prettier format check" bunx prettier --check .`, immediately after
  the conventions/typecheck step.
- Added the full reformat hash to `.git-blame-ignore-revs`; `git blame
  --ignore-revs-file .git-blame-ignore-revs -- src/main.ts` exits 0.

## Required before/after evidence

Before the reformat:

```text
bunx tsc --noEmit
exit 2
scripts/tasks/mine-transcript-for-task-detail.ts:28 — string | undefined passed to mkdirSync
scripts/tasks/tasks-status.ts:391 — DriftFinding missing directoryState

bun test
1732 pass
0 fail
67763 expect() calls
exit 0
```

After the reformat and in the final verification pass:

```text
bunx tsc --noEmit
exit 2
scripts/tasks/mine-transcript-for-task-detail.ts:31 — same string | undefined error
scripts/tasks/tasks-status.ts:394 — same missing directoryState error

bun test
1733 pass
0 fail
67765 expect() calls
exit 0
```

The task-requested green-before/green-after typecheck proof was impossible:
the untouched starting commit already had those two errors. The error set is
unchanged after the mechanical wave; only line numbers moved because blank
lines were inserted. No task-unrelated semantic fix was made.

## Prettier gate positive control

RED arm, with an unformatted in-scope fixture planted:

```text
Checking formatting...
[warn] scripts/fixtures/prettier-positive-control.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
PRETTIER_POSITIVE_CONTROL_RED_EXIT=1
```

GREEN arm, after removing the fixture:

```text
Checking formatting...
All matched files use Prettier code style!
PRETTIER_POSITIVE_CONTROL_GREEN_EXIT=0
```

The temporary fixture was removed and is not committed.

## Grammar failure fixture

The fixture contains an eponymous class immediately abutting its namespace.
The CLI path exits 1 and names the rule:

```text
[top-level-declaration-spacing] top-level declarations must have one blank line between them
```

Targeted result:

```text
bun test scripts/check-file-grammar.test.ts
24 pass
0 fail
34 expect() calls
exit 0
```

Final production-tree result:

```text
check-file-grammar: PASS (489 TypeScript file(s), 0 legacy violation(s)
reported, 23 converted module(s) enforced, 12 structural interface
test-pair exemption(s))
```

## Final verification

```text
bunx prettier --check .                         exit 0
bun scripts/check-file-grammar.ts              exit 0
bun test                                        1733 pass, 0 fail, exit 0
check_invariants.mjs --all --refs               936 annotations, 67 links,
                                                 0 problems, exit 0
git blame --ignore-revs-file ... src/main.ts    exit 0
git status --short --branch                     clean
```

`bunx tsc --noEmit` remains exit 2 with only the two baseline errors listed
above.

## Constraint notes

- A Git commit cannot contain its own final hash: adding that hash changes the
  commit content and therefore changes the hash. The closest valid two-commit
  history records the reformat commit's exact hash in the immediately
  following gate commit. The reformat commit message states that the follow-up
  makes blame skip the mechanical wave.
- The task says builders must not run `scripts/merge-gate.sh`. The first normal
  `git commit` invoked it automatically through the pre-commit hook. After that
  automatic gate reported unrelated reds, both commits used the hook's
  documented `SKIP_GATE=1` override so the conductor remains the landing gate.

## Bycatch

- PRE-EXISTING, reproduced before and after: `bunx tsc --noEmit` reports
  `scripts/tasks/mine-transcript-for-task-detail.ts` passing `string |
  undefined` to `mkdirSync`, and `scripts/tasks/tasks-status.ts` constructing
  a `DriftFinding` without `directoryState`.
- PRE-EXISTING, seen in the automatic pre-commit gate: conventions reports
  `.claude/skills/manage-tasks` missing from the `AGENTS.md` skills index.
- PRE-EXISTING, reproduced twice by the automatic gate: the
  `smoke-horizontal-extent-harness` grid-condition wait timed out on both the
  initial attempt and its retry. Evidence:
  `/tmp/merge-gate-failures.1587581/`.
- PRE-EXISTING flake, not reproduced on the second attempt: the automatic
  `smoke-agent-cancel-harness` timed out once and passed its retry. Evidence:
  `/tmp/merge-gate-failures.1587581/`.
