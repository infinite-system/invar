# TASK — #145: a smoke asserting the wrong variable

Work ONLY in `/tmp/conductor-gainpremise` (branch `fix-gain-premise-smoke`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/gainpremise-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Small, self-contained, and the interesting part is the reasoning rather than the edit.

## The defect

`scripts/smoke-settings-applied.sh` drives `scrollAccelGain=5`, then `scrollAccelGain=120`, ONE
wheel notch each, and asserts the second travels further. It fails with `0 not > 1`. Two separate
builders tripped over it as bycatch while doing unrelated work.

**The premise is the bug, not the numbers.** Acceleration gain shapes the ramp ACROSS SUCCESSIVE
notches — that is what the accumulation work (#135) established and what
`scroll.invariants.md` now records as *Same-direction impulses accumulate to the ceiling*. A
SINGLE notch is the one case where gain has nothing to act on yet. So the assertion was reading a
per-gesture parameter through a per-notch observation. It passed originally by coincidence, which
makes it another member of the instrument family this session catalogued: a check that passed for
the wrong reason.

Do NOT "fix" this by flipping or loosening the comparison until it goes green. That would preserve
a check that does not test what it names.

## Two legitimate outcomes — pick with evidence

1. **Assert the property gain actually governs.** Drive SEVERAL same-direction notches at low gain
   and at high gain, and assert the high-gain gesture accumulates faster — a ramp comparison, not a
   single-sample comparison. Read `scroll.invariants.md` first so the assertion matches the
   recorded invariant rather than inventing a parallel definition of the same thing.
2. **Retire it as a duplicate.** First check whether the harness twin
   (`smoke-settings-applied-harness.ts`) already covers gain application as a superset — it was
   rebuilt this session to enumerate schema fields from the runtime and drive each field's applied
   effect. If gain is already covered there, repairing the shell copy buys nothing: declare the
   retirement in the coverage ratchet with its reason and PARK the file (repo rule — never delete).

**Check (2) before doing (1).** This file is likely in the gate-skipped `*_full_tmux_smoke` class
(#105), which is why it rotted unnoticed for so long — and a smoke the gate never runs is not a
contract even after you repair it.

State which outcome you chose and why, with the evidence that decided it.

## If you repair it

Positive control mandatory: make the new assertion fail deliberately and quote the red. Assert on
COUNTS (rows travelled, impulses applied) rather than wall-clock, so the check is load-invariant.

## Bycatch

Report other bugs; do not chase them.

## Verification — quote exact exit codes

The smoke 3x (or the retirement declaration verified by the ratchet), plus `bunx tsc --noEmit`,
`bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
