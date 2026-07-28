# 205 — nothing gates first paint or peak RSS; prefer an RSS ceiling over milliseconds

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Found while answering the user's question "is it gated properly too?" after the flat-file regression
landed. The answer: the mechanism is gated, the symptom is not.

**Gated.** `CodeFolding.test.ts:116` asserts exact `[30, 30]` document reads across
`[2_000, 1_000_000]`, inside `bun test`, a blocking gate step. Verified independently: 11 pass, 54
assertions, and its positive control reads `[4000, 2000000]` when global discovery is restored, so the
counter provably still moves.

**Not gated at all.** First paint and peak RSS. The gate's only latency step compares p50/p95 KEYSTROKE
latency against a reviewed baseline. Nothing anywhere looks at launch time or memory. So the numbers that
actually captured the regression have no contract:

    1M flat lines, first paint  634 ms -> 2,417-2,526 ms  (fixed to 645-649 ms)
    1M flat lines, peak RSS     704 MB -> ~1,300 MB       (fixed to 665 MB)

The `[30, 30]` contract guards THAT mechanism, not the CLASS. Any other mechanism inflating launch or
memory sails through green, exactly as this one did through three rounds of reports.

**Why RSS and not milliseconds.** Repo doctrine prefers counts over thresholds because a faster machine
beats a threshold and nothing beats a count. First paint in milliseconds is a speed threshold: it drifts
with hardware and would either false-positive on a slow machine or be set so loose it catches nothing.
Peak RSS is different in kind — 665 MB at 1M lines is a structural fact about how much the editor
materialises, near-independent of CPU speed. A generous ceiling would have caught 1,300 MB without ever
firing on a slow machine.

To build:
1. A peak-RSS ceiling at a declared document size, as a blocking gate step, with the derivation recorded
   in `project.performance-baselines.md` so raising it later is a reviewed act rather than a quiet edit.
2. A MANDATORY positive control: an RSS check can only fail toward "pass" if measurement silently
   returns zero or the app fails to launch. Plant an over-ceiling allocation, require RED, remove it,
   require green.
3. First paint: measure and RECORD without blocking, or argue in writing for a blocking form.
   Report-only is acceptable — but only compared against its own trailing history, since a report-only
   check nobody reads is how twelve elevated samples once accumulated unnoticed.

Sequence after the drive-tool work; it lengthens every future gate.

## Sources

- `brief-205-1-gate-launch-time-and-memory-ceiling.md`
