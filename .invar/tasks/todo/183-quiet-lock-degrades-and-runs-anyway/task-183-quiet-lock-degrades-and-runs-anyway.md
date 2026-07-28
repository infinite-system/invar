# 183 — the quiet lock degrades after 120 s and runs anyway

State: TODO — unfixed, and it has already cost samples
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Priority: verification-integrity
Assignment note: A decision between three options with real trade-offs, not an implementation.

## Outline

`/tmp/invar-quiet.lock` **gives up after 120 seconds and runs the measurement anyway**, in DEGRADED
mode. It **reports** degradation; it does not **prevent** it. (#147 made it visible, not impossible.)

### The conductor's own error, corrected on the record

This was told to a builder the wrong way round — as though the lock guaranteed exclusivity. It does not,
and the correction was issued explicitly: *"which is not what I told you earlier."* **Concurrent
measurement is NOT safe, and the conductor assumed it was.**

**It has already cost at least one sample**, and the mitigation now appears in every timing brief:

> Take the machine-wide quiet lock for any timing run, and **check
> `/tmp/invar-quiet-lock.journal` for a `degraded` entry afterwards** before trusting any number.

Putting the obligation on the reader is the current state, and **that is precisely where it has failed
twice.**

### The 120 s figure is the tell

**The timeout is SHORTER than a single gate run** (4m02s at the time, ~2m30s now). So the lock is
guaranteed to give up whenever it is contending with the thing it most needs to exclude. It was not
calibrated against the workload it guards.

### Three options, with their trade-offs

1. **Fail instead of degrade.** A measurement that cannot get exclusivity reports UNMEASURABLE and exits
   non-zero. Semantically cleanest — it matches #166's argument that "cannot be measured" is a different
   verdict from "missed the target" — but it converts a slow lock into a red.
2. **Wait longer, with a visible countdown.** Raise the timeout past a full gate. Cheapest, and fixes
   the calibration error directly, but does nothing if two long runs genuinely overlap.
3. **Keep degrading, but make the degraded stamp fatal to the REPORT rather than to the run.** The
   measurement completes and any consumer reading a degraded sample must discard it. **This is today's
   behaviour plus enforcement, and today's behaviour is what failed** — the obligation stays on the
   reader.

Not yet decided. The decision is what this task is for.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
