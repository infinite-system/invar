# 193 — the 100k fold-dense contract travelled 995 rows once

State: ACTIVE — single unexplained miss
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

A 100k fold-dense behavioural contract travelled **995 rows against a 1,000-row shape requirement**.
One sighting. Triaged as bycatch from #191, with merge-base verification.

### SECOND SIGHTING 2026-07-28 22:09 — same number, and a passing control beside it

The integrate/211-174 gate red on this contract with **rows=995 exactly again** (nested JSON variant:
`cases=1, fullStack=1, checkpoints=1, rows=995, slowest=30.0fps, floor 28`), under builder #114's load
(load average 1.38). A solo rerun of `behavioral-contracts.sh` on the identical tree passed with
**rows=1002**. Two readings for the diagnosis: (1) the failing value repeating EXACTLY at 995 twice is
structure, not noise — a specific dropped increment (5 rows ≈ one coalesced impulse?), not a smear;
(2) the pass overshot at 1002, so the bound is two-sided-loose and the miss is quantised. That favours
a mechanism (one lost/coalesced wheel batch under load) over the zero-margin class — find what unit of
travel is exactly 5–7 rows. Evidence: `/tmp/merge-gate-failures.1667957/`, `/tmp/bc-rerun-integrate.log`.

### The first question, and it is not "why did it fail"

**How far is 995 from its budget?** Three prior cases in this family — **#144** (23 of 24 frames),
**#149** (two bounds that ignored real scheduling), **#165** (9 rows against 8) — turned out to be
**zero-margin bounds rather than defects**. A contract sitting so close to its limit that ambient load
crosses it is an unstated tolerance, not a regression.

So: establish the margin before diagnosing the miss. If 995/1000 is the whole margin, this is the
zero-margin class and the repair is to the contract's bound, with its reasoning written down.

### Why it is worth keeping despite one sighting

**This is a behavioural contract — a felt invariant — not a smoke flake.** Those contracts exist for
properties a human cannot see by inspection, and **995 rows means a scroll travelled nearly a thousand
rows in a fold-dense 100k document.** If that is real, a user feels it.

Two readings, both live:
- **real** → a user-visible scroll shortfall in exactly the document shape the fold work targets;
- **instrument noise under pool load** → the zero-margin family above.

### It is NOT part of the retry population

Explicitly excluded from the timeout-class flake census, alongside #174: *"fold-dense behavioural
contract travelled 995 rows against a 1,000-row shape requirement once — #193, also a DIFFERENT
class."*

That exclusion is load-bearing. The pool-contention hypothesis died partly on this evidence: there is no
monotonic worker-count relationship, the failures cluster where contention is LEAST, and they are
different smokes each time (markdown = #174, behavioral-contracts = #193). **That reads as independent
low-rate intermittents scattered across a large sample, not a shared cause.**

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).

## Recurrence 2026-07-30 (#329 first hook)

First enforcing hook on #329 (tasks:watch animation tick) hit the same
shortfall: actual start 74,998, travel 995 rows, 30.0 FPS, GATE_EXIT=1.
The unchanged second full hook passed the contract, GATE_EXIT=0
(commit cf2104e3). Same 995-of-1,000 shape as the founding instance.
