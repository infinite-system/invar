# Coverage ratchet holes — READY

Commit: `264ee349efdea333976648ae74c67d5585858d0d`

## Declaration grammar and rejection

The exact parsed grammar is:

`assertions A → B, waits C → D`

It appears in the second cell of a `coverage-deltas.md` table row whose first
cell is the exact repository-relative `*.test.ts` or smoke path. The newest row
for a path governs the current decrease. Both before and after assertion and
wait counts must match the merge-base comparison. The checker does not parse or
judge the reason, so this remains a disclosure gate rather than a justification
gate.

Every pre-rule row was migrated to its measured historical before/after counts
from commit `4bbaa7e` and its parent. A rejection prints the required grammar and
this valid example:

`` | `src/example.test.ts` | assertions 4 → 3, waits 2 → 2. Removed an unsound claim. | ``

The temporary real-case rejection named both declared and actual figures:

```text
FAIL  coverage declaration: src/modules/theme/GraphicsTier.test.ts: coverage-deltas.md:24 declares assertions 26 → 24, waits 8 → 8, but actual counts are assertions 26 → 25, waits 8 → 8.

Removing an assertion or a wait is allowed. Doing it silently is not.
Declare each decrease in coverage-deltas.md — one entry per file.
Required count grammar: assertions A → B, waits C → D
Example: | `src/example.test.ts` | assertions 4 → 3, waits 2 → 2. Removed an unsound claim. |
Also name WHY the claim is gone (unsound, superseded by a stronger
assertion, feature removed) plus where it is restored if it will be.
REAL_CASE_REJECTION_EXIT=1
```

## Assertion-text replacement census

For each counted assertion, the checker expands through its matcher call chain,
then tokenizes that expression with the TypeScript scanner. Comments, formatting
whitespace, line breaks, and insignificant trailing commas are removed; the
remaining lexical tokens are joined with one separator. String/template token
contents remain intact.

Only files with both disappeared and appeared normalized assertion texts produce
the clearly labelled `ASSERTION-TEXT REPLACEMENT CENSUS`. Its output explicitly
says `informational only; does not fail`. Whitespace-only reformats and files
with no assertion replacement produce no census output.

## Positive control

Every CLI run first counts
`scripts/fixtures/coverage-ratchet-positive-control.ts.fixture`, whose known
result is 2 assertions and 2 waits. A missing fixture or any other result exits
1 before repository inspection. The checker also exits 1 if it cannot resolve a
comparison base or inspects zero coverage-bearing files.

Corrupting one known assertion produced:

```text
FAIL  coverage counter positive control: Error: positive control expected 2 assertions / 2 waits but counted 1 assertions / 2 waits
Refusing to proceed with an unproven coverage counter.
POSITIVE_CONTROL_NEGATIVE_EXIT=1
```

The restored final run reported:

```text
OK    coverage counter positive control: 2 assertions / 2 waits
OK    coverage ratchet: inspected 260 files; no undeclared decrease against 3c1590a
```

## Real committed negative control

Temporary commit `4f83cee` removed the real
`expect(detectWithEnvironment({}, reportedAll)).toBe('kitty')` assertion from
`src/modules/theme/GraphicsTier.test.ts` and appended a declaration claiming
`assertions 26 → 24, waits 8 → 8`. The checker measured
`assertions 26 → 25, waits 8 → 8` and exited 1 with the transcript above.

The temporary commit was then discarded. The branch is back at implementation
commit `264ee34`; both temporary files were restored exactly.

## Final verification exit codes

| Command | Exit code |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test scripts/` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |

`bun test scripts/` reported 64 passing tests, 0 failures. The invariant
reference pass resolved 707 annotations and 42 lattice links with 0 problems.

Final hygiene:

- `git status --porcelain` printed nothing.
- `git ls-files | grep '^TASK'` printed nothing and exited 1 (no matches).
- No merge gate, push, merge, tag, branch deletion, or worktree operation was
  performed.
