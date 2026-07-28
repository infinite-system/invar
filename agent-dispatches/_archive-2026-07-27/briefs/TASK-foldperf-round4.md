# ROUND 4 — the Quick Open wait is now DETERMINISTICALLY unsatisfiable; measure it, don't guess

Work ONLY in `/tmp/conductor-foldperf` (branch `fix-fold-scroll-cost`, at `8e00b74`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to `/tmp/fold-scroll-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

Your depth work and the ~10s trim are ACCEPTED — 9.149s, ratio 0.999, suite 139.65s -> 101.38s.
Do not redo them. One blocking defect remains.

## Measured facts (mine, do not re-derive)

- `bash scripts/behavioral-contracts.sh` on THIS tree, idle machine: **exit 1, 2 out of 2 runs.**
  Deterministic now — your round-3 change turned an intermittent into a reproducible failure,
  which is progress.
- Two contracts fail, both at the same wait:
  `glide-smoothness` and `fold-dense-cadence` (the contract you added).
- Exact error: `Timed out waiting for quick open to select the exact glide fixture` — the
  `awaitStatusCondition` you introduced at `measure-scroll-smoothness.ts:747`.
- Its predicate requires ALL of:
  `quickOpenOpen === true`, `quickOpenQuery === fixtureFileName`,
  `Number(quickOpenMatches) === 1`, `Number(quickOpenSelected) === 0`.
- I verified every one of those keys IS published by `AppStatusProjection.ts` (lines 95-99), so
  this is NOT a misspelled status key. One or more of the VALUES never reaches the required
  combination.
- The gate's own run agrees (`GATE_EXIT=1`, one retry, `behavioral-contracts` FAIL).

## Job 1 — make the timeout self-diagnosing FIRST (do this before fixing anything)

`awaitStatusCondition` currently throws `Timed out waiting for <description>` and nothing else.
That is why this costs a whole round trip to diagnose: the one fact needed — what the status
ACTUALLY was — is discarded at the moment of failure.

Change the timeout error to include the LAST OBSERVED status object (pretty-printed, and for a
large object at least every key the predicate touched). Apply it to `awaitStatusCondition` and to
`awaitGridCondition`'s equivalent if it has the same hole. This is a permanent harness improvement,
not scaffolding — keep it.

Positive control required: force a predicate that cannot pass, run it, and show that the error text
now names the offending values.

## Job 2 — then fix the actual cause

With the improved error, run the failing case directly and READ what the status was. Only then
decide. Candidates, unranked because the measurement should rank them:
- `quickOpenMatches` is not 1 (the fixture root may index more entries than you assume — check
  whether `.git`, the second fixture shape, or an editor-state file are matched);
- `quickOpenQuery` never exactly equals `fixtureFileName` (typing normalization, debounce, or a
  trailing keystroke);
- Quick Open closed before the status was sampled, so `quickOpenOpen` is false;
- the selection index is not 0 when exactly one match exists.

Fix the mechanism. **Do NOT weaken the predicate back to something that can pass vacuously** — the
whole point of round 3 was that the old grid-text wait was already true before enumeration
finished. A correct wait proves an ACTIVATABLE row exists and is selected. If the honest condition
is different from the one you wrote (for example matches >= 1 with the exact name at the selected
index), state why the weaker form is still sufficient to prove activatability.
**Do not raise the 60s timeout.**

## Acceptance

- `bash scripts/behavioral-contracts.sh` exits 0 **three consecutive times**, exit codes quoted.
- The depth checkpoint still reports its number and its positive control still goes red.
- Full checker suite green with exact exit codes; folding smoke 3x; inline-rewrite smoke 3x.
- Report the ACTUAL status values you observed at the failure — that observation is the finding.

Full descriptive names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
