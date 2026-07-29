# Brief — #211: smoke-horizontal-extent's grid-condition wait times out, attempt AND retry

Task file: `.invar/tasks/active/211-horizontal-extent-grid-wait-timeout/` — read it first.

## The failure

`smoke-horizontal-extent-harness` timed out in `awaitGridCondition`
(`scripts/harness/PtyTestDriver.ts:395`) on BOTH the initial attempt and the quiet retry, in two
separate gates (the #59 builder's automatic gate, twice, and the conductor's combined-tree gate).
A both-attempts timeout is a hard red, not the retry-population flake class (#177) — do not fold
it in.

Evidence, both attempts preserved in each:
- `/tmp/merge-gate-failures.1587581/`
- `/tmp/merge-gate-failures.1618453/smoke-horizontal-extent-harness-.log`

The failing frame in the log shows the app up and painting (file tree populated, an editor pane
with a JPEG-test file open) — the app is not hung; a specific grid condition never becomes true.

## First question, per the wait doctrine: is the condition REACHABLE?

The repo's flake census reduced four flake classes to one defect: *a wait must be a condition that
the preceding action can actually make true*. A both-attempts timeout on a formatting-only tree is
the signature of the unreachable-wait class (family 1), not load. So before touching timing:

1. Reproduce: `bun scripts/harness/smoke-horizontal-extent-harness.ts` on plain main. Quote the
   exit code. If it passes interactively, run it the way the gate runs it (inside the parallel
   pool context) until you see the red — the census scripts and gate log in the evidence dirs show
   the invocation.
2. Identify WHICH grid condition times out (the log's stack points at the await site — name the
   predicate text and the frame state it demands).
3. Answer reachability: what is false, and can the preceding action ever make it true in this
   fixture? Compare the expected text/geometry against the actual frame in the failure log —
   wrapping, wide glyphs (the fixture opens a JPEG-decoder test file with prose comments), and
   astral-width remapping are all known ways a contiguous-string predicate becomes unsatisfiable
   (#173's class).

## The fix

Fix whichever side is wrong — the predicate (if it demands text the renderer legitimately splits
or never paints) or the product (if the extent logic genuinely fails to converge). FORBIDDEN:
widening the timeout, adding retries, or loosening the assertion so it can no longer fail. The
smoke must still be able to go red — demonstrate a positive control (plant the old broken
condition or an impossible predicate and show the timeout still fires and is reported).

## Verification — by driving, both arms

- The smoke green: quote exit 0.
- Positive control red: quote it.
- `bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh` — exact exit codes.

## Repo rules (unchanged, plus one new)

- NEW: a prettier format gate is live. The pre-commit hook auto-formats staged files; keep
  `bunx prettier --check .` clean. 80 columns.
- Full descriptive identifier names, no abbreviations.
- Do not run `scripts/merge-gate.sh`; commit with
  `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
- Report bycatch explicitly; write the report to `/tmp/211-READY.md` when done.
