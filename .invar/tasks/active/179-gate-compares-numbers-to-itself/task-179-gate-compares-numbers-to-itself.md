# 179 — the gate reports its own numbers and never compares them to itself

State: ACTIVE — partially addressed; the general form is open
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Priority: verification-integrity
Assignment note: Trend detection needs calibration and a positive control, or it never fires.

## Outline

### The reduction

**Three regressions in three days hid in numbers that were ALREADY PRINTED:**

1. **Twelve consecutive elevated latency samples** sitting in `.perf-history/input-byte-flush.ndjson`;
2. **Three consecutive parallel-phase timings going 1m22s → 0m45s → 12m54s**;
3. **One retry per gate, never repeating the same smoke** — a pattern visible only across runs.

**Every instrument worked.** Each printed its number correctly, each time. **Nothing compared its
output to its own history**, so catching any of them took a human reading runs in sequence — which
happened, late, twice.

> **The conductor noticing is the weakest available mechanism, and it is the one that failed.**

### The two corollaries

- **A rate destroys the shape a sequence reveals.** "50% failure" told nobody anything; a perfect
  `0,1,0,1` alternation named wall-clock phase instantly. Always ask builders for ORDERED SEQUENCES,
  never rates — and apply the same rule when reading your own output.
- **Prefer making the comparison automatic over remembering to do it.**

### Status

**Partially addressed**: gate retry history is now persisted to `.perf-history/gate-retries.ndjson`, so
retries at least accumulate somewhere a check can read.

**The general form is open**: compare EVERY reported number against its own trailing history, and
report-only/WARN first — an uncalibrated blocking rule on a noisy metric teaches people to bypass it.
Positive control required: synthesise a shifted history and require the check to name it, since **a
trend detector that never fires looks exactly like a healthy trend.**

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
