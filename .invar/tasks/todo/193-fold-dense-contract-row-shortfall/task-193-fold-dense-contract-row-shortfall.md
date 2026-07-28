# 193 — the 100k fold-dense contract travelled 995 rows once

State: TODO — single unexplained miss
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

A 100k fold-dense behavioural contract travelled **995 rows against a 1,000-row shape requirement**.
One sighting. Triaged as bycatch from #191, with merge-base verification.

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
