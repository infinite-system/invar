# TASK — Close the coverage ratchet's two cheap holes (#77 parts 1 and 2)

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## What exists

`scripts/check-coverage-ratchet.ts` AST-counts assertion and wait calls in `*.test.ts` and
`scripts/harness/smoke-*.ts` against the merge base. Any DECREASE must be declared in the tracked
`coverage-deltas.md`. Its invariant is *coverage may fall but never silently* — it gates DISCLOSURE, not
justification, and that is deliberate. Do not turn it into a justification gate.

Do the two cheap holes ONLY. Part 3 (mutation probing) is explicitly OUT OF SCOPE for this task — it is
a separate project and must not be started here.

## Hole 1 — a declaration can be a shrug (close this first)

Today an entry in `coverage-deltas.md` satisfies the check by naming the FILE PATH alone. So "I removed
some assertions from this file" passes forever, and the record never has to say how much.

Required:

- A declaration must state the new counts, and the checker must VERIFY the declared numbers against the
  actual counts. Follow the format already used by the most recent entries, which state
  `assertions A → B, waits C → D` in prose — keep it human-readable, but parse it. Pick the exact
  grammar, state it in the checker's own error message, and make the message show a correct example when
  it rejects one.
- A declaration whose numbers do NOT match reality must FAIL, naming both figures. A stale record then
  stops passing the moment the file changes again, which is the property that makes the record decay
  loudly instead of silently.
- Existing entries that predate this rule must not break the gate: either they already carry counts, or
  you migrate them in this commit by reading the real counts. Do NOT weaken the rule to accommodate an
  old row — migrate the row.

## Hole 2 — padding within a file (REPORT-ONLY, do not fail the gate)

Delete one real assertion, add one trivial one, count unchanged, gate green. A pure count ratchet cannot
see this.

Required:

- Compare per-file assertion TEXT sets between merge base and HEAD, and REPORT replacements: which
  assertion texts disappeared and which appeared. Report only — legitimate rewrites replace assertions
  constantly, so failing on replacement would make the gate unusable and would be reverted within a day.
- Follow the precedent of the existing report-only censuses in `scripts/conventions-gate.sh`: print a
  clearly-labelled census, and state in the output that it is informational.
- Normalise before comparing (whitespace, line breaks) or the census will report every reformat as a
  replacement and nobody will read it. State your normalisation.

## The instrument must be able to fail

This checker's whole job is to catch loss, so a version of it that silently inspects nothing is worse
than no checker. Tonight the gate's classification guard printed OK for 14 runs while calling a binary
that was not installed.

Therefore:

- Add a POSITIVE CONTROL: the checker proves, on every run, that its own counting works — for example by
  counting a fixture with known counts and refusing to proceed if the numbers do not match. It must
  refuse to pass having inspected ZERO files.
- Unit-test both new behaviours: a declaration with correct counts passes; the same declaration with
  wrong counts fails and the message names both figures; a padded file produces a census line naming the
  replaced text; a file with no changes produces no census noise.

## Rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns. Match the existing
  style in `check-coverage-ratchet.ts` — it already exports `classifyCoverageCall`, `countCoverageCalls`,
  `isCoverageBearingPath`, and `compareCoverage`; extend that shape rather than inventing a parallel one.
- Read [project.invariants.md](../../../../project.invariants.md)'s coverage-ratchet record BEFORE editing and refine it to describe the new
  guarantees, including **Scope**. Verify the invariant checker with EXIT CODES, never a log tail.
- `coverage-deltas.md` is edited by nearly every branch, so keep your diff to that file APPEND-ONLY where
  possible; a rewrite of the table will conflict with three other branches in flight tonight.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test scripts/`,
  `bun scripts/check-coverage-ratchet.ts`, `bun scripts/check-file-grammar.ts`, both invariant checker
  passes, `bash scripts/conventions-gate.sh`.
- Prove the new rules against a REAL case, not only fixtures: construct a temporary commit that removes
  an assertion with a wrong-numbered declaration, show the checker rejecting it, then discard that commit.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Report to [/tmp/ratchet-holes-READY.md](../../../../../../../../../../../tmp/ratchet-holes-READY.md)

The declaration grammar you chose and the rejection message; the normalisation used for the text census;
the positive control and what happens when it fails; the real-case rejection transcript; and the exact
exit codes.
