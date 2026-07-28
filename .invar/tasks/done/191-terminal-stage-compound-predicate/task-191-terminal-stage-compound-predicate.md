# 191 — terminal-stage's compound predicate

State: DONE
Created: 2026-07-28

## Outline

`terminal-stage` was the hard gate blocker: **the prompt was visibly on the grid and the compound
prompt+colour predicate timed out anyway.** Eight consecutive failed attempts on a condition whose
subject a human could see in the final grid.

### The reduction

A compound predicate reports ONE verdict for TWO claims. When it times out, the failure message names
the conjunction rather than the half that failed — so eight runs produced eight identical messages and
no information. **Splitting a compound wait into named conditions is not cosmetic: it is what makes the
failure say which half is false.**

### The refuted hypothesis — recorded so nobody re-chases it

I proposed a **stale-snapshot coordinate** as the cause: a click coordinate captured at
`smoke-terminal-stage-harness.ts:363` and used at `:378` without re-verification at press time.

**Measurement refuted it: the coordinates were identical (`47,33`) in every run.** The structural read
was a hypothesis and it was wrong — one of four diagnoses overturned by measurement in a single night.

### The residual, handed over rather than closed

After this repair `terminal-stage` still retried, but **the failing wait is a DIFFERENT one**, at
`smoke-terminal-stage-harness.ts:388`. Naming that explicitly prevented the next reader from concluding
the repair had failed.

Bycatch triaged to **#193** (the fold-dense 995-row contract) and **#192** (which gained panel-split as
its fifth site).

## Sources

- `brief-191-1-terminal-stage-compound-predicate.md`
- `report-191-terminal-stage-compound-predicate.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
