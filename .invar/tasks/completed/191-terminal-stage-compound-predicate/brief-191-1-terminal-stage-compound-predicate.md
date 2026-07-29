# TASK — #191: terminal-stage is the hard gate blocker. Split the conjunction first.

Work ONLY in this worktree. Branch `fleet/191-terminal-stage-compound-predicate`. Do NOT push, merge,
tag or delete. Report to [/tmp/191-terminal-stage-compound-predicate-READY.md](../../../../../../../../../../../tmp/191-terminal-stage-compound-predicate-READY.md).
`export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a fresh worktree has no
`node_modules`.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh`; you will need it. Take the
machine-wide quiet lock for any timing run and **check `/tmp/invar-quiet-lock.journal` for a
`degraded` entry afterwards** — the lock gives up after 120 s and runs anyway (#183), and that has
already cost one sample.

## Why this is the whole gate

`smoke: terminal stage harness` timed out on **BOTH attempts in each of four consecutive** six-worker
pool gates: three baseline gates at merge base `e407bfd` plus #189's final gate. Verified at the merge
base: YES — pre-existing. Logs: `/tmp/merge-gate-failures.{80761,105047,128199,165490}`. Nothing else
blocks main except #174's markdown row, which is a separate task.

## The tell, and it is the entire task

#189 recorded that **the final grid visibly contained the shell prompt, while the combined
prompt/colour predicate timed out.**

A predicate that fails while its subject is visibly present is not observing what it claims to
observe. And a conjunction reports ONE bit for TWO claims, so it cannot say which half is false —
this smoke has now failed eight attempts running with one half demonstrably true.

**Step one, before any hypothesis: split it.** Assert the prompt text alone and the colour alone, each
as its own named wait, and report which half fails, in which tier, in-pool and standalone. Everything
below is subordinate to that measurement.

## Ranked candidates — measure, do not assume

A structural read is a hypothesis. Four diagnoses were overturned by measurement in one night here,
and #189 overturned two of mine yesterday. Report what you measured, ranked, even if it kills all
three of these.

1. **The colour half.** `COLORTERM=truecolor` is required for the frame probe's colour asserts; a
   per-cell colour read without it can silently degrade. Compare exactly what the gate exports to this
   smoke against what a standalone run inherits — an earlier "no background colour" finding here
   turned out to be a pre-truecolor artifact, so do not repeat that conclusion without checking the
   variable.
2. **The prompt half against a THEMED prompt.** #168's bycatch already recorded this same site: "the
   clean themed shell prompt never matched the fixture prompt and color predicate; reproduced 2/2."
   That is a second, independent report weeks earlier. **Read it before you start.**
3. **The conjunction's timing.** Both halves may be true and never simultaneously true within one
   sampled frame. That is a sampling race in the wait, not a product defect — and it is the same
   family as #189's repair, where a generic byte-change wait admitted an intermediate value.

Every observation so far is in-pool. Report standalone N>=5 and in-pool N>=3 as **ordered sequences**,
never rates — the alternating fingerprint is what named #168's root cause and a percentage would have
hidden it.

## Forbidden

- Do NOT widen the timeout.
- Do NOT drop the colour assertion to make it pass. If the colour claim is not worth asserting, retire
  it DELIBERATELY with a coverage-ratchet declaration and say so in the report. A silent lapse is worse
  than a red, because the count keeps citing it.
- Do NOT restore any removed wait primitive. The `awaitNextCompletedFrame` and `awaitQuiescence`
  censuses must stay at zero identifiers under `scripts/harness`.

## Positive control

Both directions, per repair: break it, quote the exact red line, restore, quote the green. A check that
can only fail toward "pass" is not an instrument.

## Terminal condition

A full `scripts/merge-gate.sh` reaching ALL-PASS. If #174's markdown row or #192's three known
retry-passing waits (`shortcut-help` PageDown, `panel-chrome` Agent 2 close, the two `scrollbars`
sampling races) block that, **report them as bycatch and do not fix them** — they belong to other
tasks and fixing them here makes your own change unattributable.

## BYCATCH

Report every defect you SEE; fix only what you were SENT for, under a `## Bycatch` heading with exact
reproduction, repetition count, commit — **and state for each whether you verified it at the merge
base.** #189 did this correctly and it is why its findings were immediately actionable; #168 skipped it
and reported its own regressions as pre-existing.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` (harness records at
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)), cited by ROOT-RELATIVE path. Full descriptive identifier
names — no abbreviations. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 924
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, the split-predicate tables, and the full gate.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
