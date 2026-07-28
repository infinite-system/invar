# TASK — #189: two gate reds blocking main. Separate before fixing.

Work ONLY in this worktree. Branch `fleet/189-gate-reds-separation`. Do NOT push, merge, tag or
delete. Report to `/tmp/189-gate-reds-separation-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules`.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh` — you need the POOL to reproduce
failure 2, and that is the whole point. Take the machine-wide quiet lock for any timing run and
**check `/tmp/invar-quiet-lock.journal` for a `degraded` entry afterwards** (#183: the lock gives up
after 120s and runs anyway; it reports degradation rather than preventing it, and it already cost
another builder a sample).

## Context: main is red after eight landings

The gate on `52dcde4` totalled **3m55s** and failed three steps. One was the conductor's and is
already fixed in `7382d4d`. Two remain and they are yours. **#184's new failure-log provenance
self-test PASSED**, so `/tmp/merge-gate-failures` is now a real symlink and the resolved target is
printed — you can trust which run a log came from, which was not true earlier tonight.

---

## FAILURE 1 — `smoke: scrollbars harness`

    error: FAIL lengthening the widest line refreshes the diff horizontal bar (28 to 44)

### The suspect, and why you must not assume it

**#186** (landed tonight, `4e7abd0`) changed exactly this path. `TextDocument.replaceLineRange` used
to mark the widest line deleted and rebuild the maximum width; now a replacement at least as wide as
the champion **becomes the new champion in O(replacement-line-count) with no full rescan.** That took
500k-line editing from 68-87 ms to 0.007-0.045 ms.

Precise hypothesis: **the fast path produces a correct value but never notifies its consumers.** If
the O(1) handoff skips a reactive write that `DiffView` or `ScrollbarSync` observes, the maximum is
right and the bar never refreshes — which is exactly this symptom.

### But it may be older than #186

#168's bycatch recorded this same pair *before #186 existed*: *"widening the deepest diff line changed
the measured thumb from 28 to 44 once"*, among three scrollbars failures that "occurred at different
earlier assertions, so none reproduced a second time."

So: suspect, not answer.

### Separate it

Run `smoke-scrollbars-harness.ts`, N>=5 ordered runs each, at:

- `1abe1d0` — before #186
- `4e7abd0` — #186's merge
- `52dcde4` — current main

One scratch worktree, `bun install` ONCE, `git checkout` between commits reusing `node_modules`.
Report ordered PASS/FAIL sequences, never rates — the alternating `FAIL, PASS` fingerprint is what let
#168 name its root cause, and a percentage would have hidden it.

### If it IS #186

The fix is to **notify without scanning.** #186's own AST census named the four consumers that all
require the exact maximum: `Workspace.tickScrollAnimations`, `EditorPane.scrollColumns`,
`ScrollbarSync` (the horizontal bar's `scrollSize`), and `DiffView` (exact pane content width). A
correct value nobody is told about is not enough.

**DO NOT restore the rescan.** That gives back a 68-87 ms → 0.04 ms win at 500k and re-breaks the
user's explicit "500k must be imperceptible" bar. If you believe the rescan is genuinely required,
stop and report rather than reverting.

---

## FAILURE 2 — `smoke: reserved chord harness`

    error: Timed out waiting for Quick Open selects small.txt from the typed query

### The gap IS the clue

Third gate appearance. **Retried and still failed both times.** Yet #188's quiet standalone comparison
found it PASSING at both #170's branch tip and `715c980`.

So it **fails in the 60-job pool and passes alone**, and since the gate's retry is also in-pool, a
quiet retry cannot rescue it.

### Order of work

1. Standalone N>=5 — expect PASS, confirming the gap exists.
2. In-pool N>=3 — expect FAIL, confirming pool-dependence.
3. **Then ask what the wait actually claims.** "Quick Open selects small.txt from the typed query" IS a
   result condition, which is correct in form. But per the class established tonight — **a result
   condition is only safe when the result is REACHABLE** — ask whether load changes reachability. If
   the fixture file is still being written when the query runs, the match cannot appear, and no amount
   of waiting produces it.
4. Consider whether this smoke belongs in the pool at all. #170 added it as pool-safe by DEFAULT;
   #178's two promotions each required **10/10 pool runs** as proof. This one never got that. Serial
   with a stated reason is a legitimate outcome — #178 left agent-permissions and overlay-dialog serial
   for exactly that reason.

**DO NOT widen its timeout.** If it needs a condition it does not state, name the condition.

---

## Constraints

- Never widen a timeout or a tolerance to turn a red green.
- Positive control per repair, both directions: break it, quote the red, restore, quote the green.
- The full gate must reach ALL-PASS by the end, and `behavioral-contracts` must stay ALL-PASS.
- Structural census must still report zero `awaitNextCompletedFrame` / `awaitQuiescence` identifiers
  under `scripts/harness` — #168's capability removal holds.

## BYCATCH

Report every defect you SEE; fix only what you were SENT for, under a `## Bycatch` heading with exact
reproduction, repetition count, commit — **and state for each whether you verified it at the merge
base.** #168 reported its own regressions as pre-existing findings tonight because it skipped that
step, and it turned a good fix into a red main.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full descriptive
identifier names. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 924
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, the separation tables, and a full `scripts/merge-gate.sh`
reaching ALL-PASS.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
