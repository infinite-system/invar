# 104 — DEFERRED: editor glide monotonicity

State: ACTIVE (deferred by user decision)
Created: 2026-07-28
Engine: user
Environment: any
Model: —
Effort: default
Priority: performance-behaviour
Assignment note: Deferred by user decision; the trigger is the next scroll-domain bisect.

## Outline

The editor glide's monotonicity property — a decelerating glide should never reverse direction — is
deferred, not abandoned. The user's call: monitor manually rather than build a contract now.

**The trigger for picking it up is named**: the next time a bisect is needed in the scroll domain. A
monotonicity check earns its cost when someone has to find where a glide changed behaviour; until then
it is a contract for a property nobody is currently getting wrong.

Scope when resumed: the reversal check first — cheap, and the thing an actual regression would trip.
Velocity work only if the reversal check fires; that half was never justified on its own.

### Why this is filed rather than dropped

It is one of the few open items whose deferral is a DECISION rather than a backlog position, and it was
repeatedly re-listed as "known and deliberate" during flake triage so a reviewer counting open scroll
items would not read it as an unexplained gap. Deleting the task would lose the trigger.

Related: #138 (the shipped fling-accumulation fix), #139 (`scroll.invariants.md` + `scroll.lattice.md`,
which should record whatever phase rule comes out of any resumed work here).

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
