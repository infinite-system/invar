# READY — 493 ast-query gains imports-of and literal census modes

## In plain words

The #488 builder had to write two one-off scanner scripts because the shared
search tool could not answer "who imports from module X" or "which files use
these exact strings". I taught the shared tool both questions as normal modes.
The tool also got a built-in self-test that plants a known hit and a known
near-miss, so we know each mode can fire and can stay quiet.

## What changed

One commit on `fleet/493-ast-query-imports-and-literal-census-modes`:
`50283bb1` — 3 files, +214/-5.

1. [scripts/ast-query.ts](../../../../scripts/ast-query.ts) gains three modes:
   - `imports-of <target>` — every `import` and `export … from` whose
     specifier lands in the target. A relative specifier resolves against the
     importing file and matches a repo-relative folder prefix
     (`src/modules/git`). A bare specifier matches a package name (`vue`,
     including subpaths). Output: `file:line  import '<specifier>' ->
     <target> (type-only|value)`.
   - `literals <term[,term,…]>` — string literals (`'…'` and no-substitution
     `` `…` ``) that exactly match a listed term. Import and export
     specifiers are excluded, so a term that is also a module path never
     misfires on its import line.
   - `self-test` — 7 checks over a built-in fixture, positive and negative
     arm for each mode. Exit 1 on any failure.
2. [project.tools.md](../../../../project.tools.md) — one row per mode
   (question, result shape, gotcha), placed with the other instruments.
3. [.claude/skills/ast-query/SKILL.md](../../../../.claude/skills/ast-query/SKILL.md)
   — the three modes added to the ready-tool list, so agents find them.

The #488 census scripts were not touched, per the brief. They stay as the
committed record.

## Verification

- `bun scripts/ast-query.ts self-test` — 7/7 checks pass, exit 0.
- Positive control ON THE SELF-TEST: I ran a mutated copy with the literals
  matcher forced to return false. The self-test went red (4/7, exit 1). The
  mutant file was deleted. A check that cannot go red is a decoration.
- Real-code drives, both arms per mode:
  - `imports-of src/modules/agent` → 81 matches, including the known
    `src/modules/app/Bootstrap.ts` imports the #488 census flagged.
  - `imports-of no-such-module-493` → 0 matches.
  - `literals 'git.togglePanel,Terminal (Agent)'` → 6 matches (the two #488
    seed sites among them). `literals no-such-term-493` → 0 matches.
- `bunx tsc --noEmit; echo TSC=$?` → TSC=0.
- `bash scripts/conventions-gate.sh` → PASS.
- Existing modes spot-checked: `private-members` still reports 0 in
  `src/modules`.

## One deliberate addition beyond the #488 shape

The #488 import walker matched `import` declarations only. The new
`imports-of` also matches `export … from` re-exports, because a re-export is
a real dependency on the target. The self-test covers it. Say the word and I
remove it.

## Note on the commit path

The repo's pre-commit hook runs the full merge gate on every commit. The
brief forbids running the gate, so the commit used the hook's own
acknowledged bypass (`SKIP_GATE=1`). During the accidental first gate run
(before I noticed the hook), one contention job failed: see Bycatch.

## Invariants in scope

None, as the brief expected. Tooling and docs only. No `src/modules` code
changed. I found nothing to refute.

## Bycatch

- SUSPECT flake, seen once: during the accidental pre-commit merge-gate run,
  `contention: scrollbars harness — scripts/harness/smoke-scrollbars-harness.ts`
  FAILED under the parallel pool (its log named
  HORIZONTAL-THUMB-STABILITY). My diff cannot reach it (no app code
  touched). The run was killed by a 2-minute timeout before the serial tail,
  so I could not rerun it in place. This matches the known contention-flake
  family the conductor tracks (#371 evidence names a git-watch contention
  FAIL in the same pool). Not reproduced a second time.
- Doc drift, FIXED in the task commit: the ast-query skill's ready-tool list
  was missing modes the script already had (it also still omits `members`,
  `named-calls`, and the census modes — I added only my two plus `self-test`
  to stay in scope). The remaining omission is a one-line-per-mode cleanup
  someone can batch.

## Instrument feedback

- EASY: the predicate-table shape of ast-query. A new mode really is one
  function plus one table entry, as the skill promises.
- CONFUSING: the pre-commit hook runs the full merge gate while the brief
  says never to run it. A dispatched builder hits this on the first commit.
  Either the brief should name `SKIP_GATE=1` or the dispatch should set it.
- MISSING: ast-query had no self-test at all before this task. The two new
  modes are covered now, but the thirteen older modes still have no
  both-arms proof.
