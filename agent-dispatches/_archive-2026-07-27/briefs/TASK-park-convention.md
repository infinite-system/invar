# TASK — #148: one convention for retiring a file, documented and enforced

Work ONLY in `/tmp/conductor-parkconv` (branch `docs-retired-file-convention`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/parkconv-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why this exists

Within one hour, two builders retired smokes two different ways, both complying with a rule that
says "park the file, don't delete it" without saying how:

- `scripts/smoke-settings-applied.sh` → renamed to `scripts/smoke-settings-applied.sh.parked`
- four others → moved into `scripts/retired-smokes/`

Neither builder was wrong. The rule was underspecified, and an underspecified rule produces
divergence rather than a question. Both forms are now in main.

## The decision is made — implement it

**Standardize on the directory: `scripts/retired-smokes/`.** Migrate the `.parked` file into it and
retire the suffix form.

Reasoning, so the record can state it rather than assert it:
- one place to look, and one path prefix that tooling can exclude, versus a suffix that every
  future glob must remember;
- a suffix mutates the filename, so `git log --follow` and searches for the original name get
  noisier; a move preserves the name;
- `git mv` records it as a rename (the four moved files show as `R100`), so history stays intact.

**Do NOT delete the files, even though history would preserve them.** There is an argument for
deleting (content survives in history; the never-delete rule exists for BRANCHES, where deletion
loses reachability, and that reason does not transfer to tracked files). Record that argument in
the convention as the rejected alternative WITH its reasoning — a retired smoke is often the
starting point for its replacement, and a visible `retired-smokes/` directory makes the debt
countable in a way `git log` archaeology does not. But note it honestly as a judgement call, not a
necessity.

## The hazard that must be closed

A retired-but-present file is **searchable text that looks like a contract**. This session lost
real time to exactly that class: a smoke asserting a glyph an invariant forbade, eight probes keyed
to retired copy, a scrollbar probe matching unrelated paint. So the directory is only safe if
nothing live can cite it.

Required:
1. **Document the convention** in `project.conventions.md`: where retired files go, that the move
   uses `git mv`, that a coverage-ratchet declaration with a reason is mandatory, and that no live
   record, script, or registration may reference a `scripts/retired-smokes/` path.
2. **Add a gate check** for that last clause — no invariant record, smoke registration, contract
   script, or `project.*.md` may cite a path under `retired-smokes/`. Report-only is NOT sufficient
   here; this is a cheap mechanical rule and should fail the gate.
3. **Verify the checkers ignore the directory**: confirm the coverage ratchet, the invariant
   reference checker, and smoke registration do not walk `scripts/retired-smokes/`, or make them
   skip it. A retired file whose assertions still count toward coverage is the #105 failure wearing
   a new coat.

## Positive control — mandatory

Plant a citation of a `retired-smokes/` path in a record, run the new check, and quote the red. Then
remove the plant. A rule with no demonstrated red is not enforced, and this session catalogued five
instruments that reported success while checking nothing.

## Scope

Convention, migration, one gate check, and the ignore verification. Do not retire any additional
files, and do not change what the already-retired smokes contain.

## Verification — quote exact exit codes

`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bunx tsc --noEmit`, `bun test`, and your new check both
clean and with the plant. Never read `$?` after a pipeline.

80 columns, full descriptive identifier names. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
