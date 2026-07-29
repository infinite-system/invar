# TASK — #187: the wheel-at-clamp wait. Two consumers, one shape. SOLE GATE BLOCKER.

Work ONLY in this worktree. Branch `fleet/187-clamp`. Do NOT push, merge, tag or delete. Report to
[/tmp/187-clamp-READY.md](../../../../../../../../../../../tmp/187-clamp-READY.md). `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh` — and you must, because the tree
already carries #189, #191 and #192's repairs, so **your gate is also main's verification.** Take the
machine-wide quiet lock for timing runs and check `/tmp/invar-quiet-lock.journal` for a `degraded` entry
afterwards (#183: the lock gives up after 120 s and runs anyway).

## The blocker

`smoke-editor-harness` sends six rightward Option-wheel SGR events, confirms a greater published
`editorScrollLeft`, then sends **eight** leftward Option-wheel events and waits only for a generic
screen/caret change. Both full-gate attempts timed out; the final grids showed the README editor **at
the line head.** Eight leftward against six rightward over-scrolls, the viewport clamps at
`scrollLeft 0`, and the remaining events have nothing left to repaint.

- Reproduced a second time: YES (attempt 1 and retry).
- At the merge base: YES, proven — gate HEAD and merge base were both `f3f313e`, with no diff in
  `src/`, `PtyTestDriver.ts` or `smoke-editor-harness.ts`.
- Logs: `/tmp/merge-gate-failures.400064/smoke-editor-harness-.attempt1.log` and `-.log`.

## The second consumer

`bun run drive` has the same shape. On a 100,000-line horizontal drive, after 100 `x` inputs brought the
viewport to its RIGHT clamp, the first `--wheel right` painted the clamped state and the next clamped
wheel painted nothing; Drive timed out with `completed frames observed: 109`. A bounded rerun with
exactly one right-wheel event exited 0.

Same defect at the opposite clamp, in a different caller. That is why this is one task.

## The class — sixth spelling

After #159 (a mutation with no publication carrier), #161 (a settle preceding its own publisher), #168
(a frame 59 that does not exist), #188 (a screen change with no cause) and #189 (an intermediate value
accepted for an exact one). The question is always the same: **is the thing FALSE right now?** At a
clamp it is not, so the correct wait is a **no-op**, not a timeout.

## Forbidden — read this before choosing a fix

- Do NOT widen the timeout.
- Do NOT reduce the leftward event count to match the rightward count. That arranges for the clamp never
  to be reached, which hides the class until the next caller over-scrolls. It would pass and it would be
  wrong.
- Do NOT restore a removed primitive. The `awaitNextCompletedFrame` and `awaitQuiescence` censuses stay
  at zero identifiers under `scripts/harness`.

## The fix to establish, not assume

The caller's actual claim is a **scroll position**. `editorScrollLeft === 0` is true whether the clamp
was reached in six events or eight, and it is a no-op when already satisfied rather than a timeout.

Then ask the seam question: can Drive and the smoke share ONE generator for "wheel until this scroll
position, tolerating a clamp"? #192 has just shown that these per-site patterns generalise, and the repo
rule is to draw the seam at the shared GENERATOR — rejecting both duplication and over-unification. If
one generator is wrong here, say why.

## Enumerate before repairing

Other wheel-driving callers may carry the same latent defect. #168's conversion touched
`smoke-scrollbars-harness`, `smoke-search-mouse-harness`, `smoke-bounded-list-popup-harness` and others
that drive wheels. **Report the enumeration even for sites you do not change** — which callers can
over-scroll into a clamp, and for each, whether its wait states a position or a repaint. That list is
worth more than the two repairs.

## Watch for, report as bycatch, do NOT fix

- `reserved chord` (#194) — OK in #192's gate but failed two of the last four gates. Genuine intermittent.
- The 995-row 100k fold-dense behavioral contract (#193) — one sighting.
- markdown's ragged preview row (#174) — three sightings, passes at merge base.

## Positive control

Both directions per repair: break it, quote the exact red, restore, quote the green. For the clamp case
specifically, prove the repaired wait is a NO-OP when the position is already satisfied — a wait that
merely times out more slowly has not been fixed.

## BYCATCH

Every defect you SEE, under `## Bycatch`, with exact reproduction, repetition count, and **whether you
verified it at the merge base.** #192's provenance proof is the standard: name the commit and show the
implicated files had no diff.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is exempt.
Harness invariant records at [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md), cited by ROOT-RELATIVE path. Full
descriptive identifier names — no abbreviations. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (>= 926 annotations / 67
lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, `bun run drive` and `bun run drive --size 100000`, the caller
enumeration, and a full merge-gate reaching ALL-PASS.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
