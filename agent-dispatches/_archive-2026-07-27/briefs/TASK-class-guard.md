# TASK — #130: record "extend `$Class`, never `Class`" as an invariant, with a gate check

Work ONLY in `/tmp/conductor-classguard` (branch `feat-extend-class-invariant`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/classguard-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

No timing sensitivity here — this is a static rule, a record, and a checker.

## The rule

A subclass or test double must extend `X.$Class`, never `X.Class`. It is already stated in
`project.conventions.md` and followed by convention, but nothing enforces it, so a violation lands
silently and misbehaves at runtime rather than at review.

## Why it is load-bearing — this is now CONFIRMED, not theoretical

ivue's `Static()` binds a method and defines it on the receiver **without an `Object.hasOwn`
guard** (`node_modules/ivue/lib/Static.ts:55`). A runtime probe run during this session produced:

```json
{"parentFirst":"parent","ownsParentValue":true,"ownsChildValue":false}
```

So when the parent's method is touched first, the subclass afterwards receives the PARENT-BOUND
method. Extending the wrong entry point is therefore not a style preference — it silently gives you
a subclass whose methods can be bound to the parent, and the failure surfaces far from its cause,
as behaviour that is wrong only depending on access ORDER.

That defect is recorded in `/tmp/IVUE-2.2.0-FINDINGS.md` (finding 3) and is pending the user's
decision about patching their library. **This task does not fix ivue.** It makes the repo's own
code mechanically unable to walk into the hole while the upstream question is open.

## Deliverables

1. **An invariant record**, in the house format, in the appropriate existing record file (choose by
   ownership — this is an ivue/conventions concern, not a UI one; state your choice and why).
   Include a real *Impossible if true* clause. The obvious one: no declaration in `src/` or
   `scripts/` extends a namespace's `Class` entry point. Cite the probe above as the mechanism,
   because a record that asserts a rule without naming why it matters invites a future reader to
   "simplify" it away.
2. **A conventions-gate check.** Scan `src/` and `scripts/` for `extends <Something>.Class` and
   fail with file:line. Mind the obvious false positives: a class literally NAMED `Class`, a string
   or comment containing the text, and `$Class` itself (which must NOT be flagged). Prefer parsing
   over a bare regex if the existing checkers give you an AST route — there is precedent in
   `scripts/check-static-getter-naming.ts`, which does exactly this shape of job.
3. **A sweep of the current tree.** Report how many violations exist today. If zero, say so
   plainly — a checker that starts green is fine, but you must prove it CAN go red.

## Positive control — mandatory

Plant `extends Something.Class` in a real file, run the check, quote the red with its file:line.
Then remove the plant. Also confirm the checker does NOT flag `extends Something.$Class` and does
not flag a class named `Class` in a comment or string — a check that fires on the wrong thing is as
bad as one that never fires, and this session catalogued five instruments that reported success
while measuring nothing.

The checker must also **fail if it inspects zero files** — that guard is what saved the
settings-applied contract this session when a rename silently emptied its input.

## Verification — quote exact exit codes

`bash scripts/conventions-gate.sh` (clean, and with the plant),
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`, `bunx tsc --noEmit`,
`bun test`, `bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
