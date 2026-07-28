# 109 — agent-permissions flakes INSIDE the serialized quiet tail

State: TODO — dispatch condition: no other builder live
Created: 2026-07-28

## Outline

### The finding that makes this a defect rather than a flake

The quiet lock landed (`582420f`) and its FIRST gate did something more valuable than preventing a
flake: `agent-permissions` passed-only-on-retry **again** — inside the serialized tail, under
quiet-exclusive, with the pool finished.

Before the lock, every retried pass could be blamed on load, and was. **Under the lock, a TAIL smoke's
retry cannot be: nothing else was running.**

So the lock's real function turned out to be classification, not prevention. It strips the load alibi.
That reframing applies to its sibling #124 as well.

### Dispatch condition — recorded, not neglected

**No other builder live.** The method requires a quiet machine: the very finding that distinguishes this
from a contention story is that it flakes inside the serialized quiet tail, and running the
investigation alongside five builders would poison that measurement. Written down because an
undispatchable task with no stated condition is indistinguishable from a forgotten one.

### The classification it needs

Same fork as #124: **product race vs stale publication.** Either the permission turn genuinely races,
or it completes correctly while the published state lags. These need opposite repairs.

Method, from the shared brief: 20× looped reproduction BEFORE any diagnosis — assumed mechanisms went
0-for-5 that week — and never widen a timeout.

### The refuted unification

The narration flake's reduction was tested against this one and **does not explain it**: #109 and #124
both change visible cells and bump `renderRevision`. The three quiet-tail intermittents therefore SPLIT
into three independent defects rather than collapsing into one class. A useful negative result, and
worth more than a false unification.

### A status-hygiene note this task generated

Both #109 and #124 were once marked `in_progress` with no driver behind either. The rule that came out
of it, now in the conductor skill: **`in_progress` requires a named driver — a worktree, a brief, a
log.** A status that reports *attended* without observing a driver fails in the same direction as the
other instrument families.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
