# 166 — `measure-input-byte-flush` crashes at `LATENCY_SAMPLE_COUNT=1`

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

At a sample count of 1 the instrument crashes instead of reporting an unmeasurable run.

### The distinction it is actually about

**"Cannot be measured" is a different verdict from "missed the target."** An instrument that crashes
gives neither — it produces a stack trace that reads as a broken script rather than as a statement
about the subject. The repair is not error-handling for its own sake; it is making the instrument able
to say the one thing it currently cannot.

### Where the same argument reappears — the quiet-lock decision

This task's reasoning was cited directly when deciding what the quiet lock should do on contention.
Three options were on the table:

1. **Fail instead of degrade.** A measurement that cannot get exclusivity reports UNMEASURABLE and
   exits non-zero. **Cleanest semantically — it matches #166's argument** — but it turns a slow lock
   into a red.
2. **Wait longer, with a visible countdown.** Raise the timeout so real gates fit inside it. The
   current 120 s is SHORTER than a single gate run, which is why it fires at all.
3. **Keep degrading, but make the degraded stamp fatal to the REPORT rather than to the run.** The
   measurement completes and any consumer reading a degraded sample must discard it. This puts the
   obligation on the reader — **which is where it has already failed twice.**

That open question is #183's; it is recorded here because #166 supplies the principle it turns on, and
whichever way #183 goes, this instrument should express the same verdict vocabulary.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
