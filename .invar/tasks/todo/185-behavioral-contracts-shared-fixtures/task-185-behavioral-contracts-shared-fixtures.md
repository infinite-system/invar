# 185 — gate 4m02s → 2–3m: behavioral-contracts is 62% of it

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: performance-behaviour

## Outline

`behavioral-contracts` is **62% of the gate's wall clock**. The target is 2–3 minutes total.

### The constraint that defines the task

**Shared fixtures, NOT fewer assertions.**

The contracts exist for properties a human cannot see by inspection; deleting assertions to hit a time
budget converts a real gate into a fast one that checks less. The cost is in re-rolling large fixtures
per contract, which is why this depends on **#136** (one shared scale-fixture generator with a cached
corpus) rather than on trimming.

### A measurement that closes off the obvious alternative

**Reducing worker count is not the lever.** `n=6` delivered **3m23s twice** while `n=1` took **5m37s**.
Fewer workers costs real wall-clock time and buys nothing measurable — so the gate's duration is not
being paid to contention, and the fix has to come from the work itself.

*(The gate has since reached ~2m30s by other means; the 62% share is the part this task still owns.)*

### A single-sighting item folded in here

From #191's bycatch, with merge-base verification: **do NOT dispatch it alone.** Fold it into the next
behavioral-contracts task — this one touches the same script — or pick it up if it recurs. A single
sighting does not justify its own builder, but it does justify riding along with work already in the
file.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
