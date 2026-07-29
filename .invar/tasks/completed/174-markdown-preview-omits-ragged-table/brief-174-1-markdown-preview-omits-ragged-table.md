# Brief — #174: markdown preview drops a ragged table that is visible in source

Task file: `.invar/tasks/active/174-markdown-preview-omits-ragged-table/` — read it first.

## The defect, now deterministic

`smoke-markdown-harness` fails on current main, every run, at
"a ragged table keeps its raw header": the preview renders NOTHING where the source shows

```
| Ragged | header |
| --- | --- |
| row | has | extra |
```

The malformed *missing-separator* table directly above it DOES fall back to raw paragraph text
correctly (`| Missing | separator |` is visible in the preview). So the fallback path exists and
works for one malformation class but not the other — the ragged table (data row with more cells
than the header) is being swallowed entirely: neither rendered as a table nor emitted as raw text.

Evidence:
- `/tmp/merge-gate-failures.1618453/smoke-markdown-harness-.log` (gate red, combined tree)
- `/tmp/markdown-control-main.log` (control on plain main — identical failure)

## History constraint that shapes the diagnosis

This smoke PASSED three merge-base gates earlier (2026-07-27/28), then became deterministic. So a
commit in that window flipped the behaviour. Before writing any fix:

1. Reproduce: `bun scripts/harness/smoke-markdown-harness.ts` — must exit 1 with the `| Ragged`
   row missing. Quote the exit code.
2. Find the flip: `git log --oneline -- src/modules/markdown/` (and the table renderer / preview
   path, wherever it lives) over 2026-07-27..28, and test the candidate commits until you can name
   the exact commit that broke ragged-table fallback. A bisect over the smoke is acceptable and
   preferred if the log is ambiguous.
3. Classify: product defect (renderer swallows the block) vs predicate defect (#173's class —
   the text is present but split/wrapped so `includes` misses it). Read the raw frame in the
   failure log before deciding: the preview rows there are BLANK, which points product-side, but
   verify — do not assume.

## The fix

Whatever a table parser cannot render as a table must fall back to raw source text — the same
guarantee the missing-separator case already honours. A ragged table must never render as nothing.
Fix the generator, not the instance: if ragged rows and missing separators go through different
rejection paths, unify them at the shared fallback seam.

## Verification — by driving, both arms

- `bun scripts/harness/smoke-markdown-harness.ts` exits 0; quote the exit code.
- Positive control: temporarily re-break the fallback (or run the pre-fix commit) and confirm the
  smoke still fails — the assertion must still be able to go red. Revert the break.
- `bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh` — quote exact exit codes,
  never `$?` after a pipeline.

## Repo rules (unchanged, plus one new)

- NEW: a prettier format gate is live. The pre-commit hook auto-formats staged files; keep the
  tree `bunx prettier --check .` clean. 80 columns.
- Full descriptive identifier names, no abbreviations.
- Do not run `scripts/merge-gate.sh` yourself; commit with
  `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
- Never widen a timeout or weaken an assertion to make a red green.
- Report bycatch explicitly; write the report to `/tmp/174-READY.md` when done.
