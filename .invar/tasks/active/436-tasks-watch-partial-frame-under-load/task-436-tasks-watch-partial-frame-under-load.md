# Task #436 — real tasks:watch commits a partial frame under gate load

Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
State: ACTIVE

## What

`smoke: terminal harness` fails inside the full merge gate (66 parallel
PTY jobs) at:
`real tasks:watch produced no blank or partial completed frame (16 outer frames)`
(assertion near line 1280 of `scripts/harness/smoke-terminal-harness.ts`).
The same smoke passes solo, in both host gate-registry states (missing
registry and a planted running gate).

## Evidence (2026-08-01, conductor A/B at full gate concurrency)

- `/tmp/gate-433-combined-1785580001.log` — #433 round-1 tree: step PASSED.
- `/tmp/gate-433-r3-1785581587.log` — #433 round-3 tree: FAILED.
- `/tmp/gate-433-r3b-1785581962.log` — round-3 tree, all builders holding: FAILED.
- `/tmp/gate-main-baseline-1785582277.log` — MAIN, builders holding: FAILED.
  Failure detail: `/tmp/merge-gate-failures.56f877be132c8fa5.2965340/smoke-terminal-harness-.log`.

Main fails without any #433 change: the defect is pre-existing and
load-marginal (one green in four full-pool runs).

## Wanted

Separate product from instrument: does the app truly commit a blank or
partial completed frame for the embedded tasks:watch terminal under
load, or does the observation window mis-attribute frames? Deliberate
contention is the reproduction instrument, per doctrine: never widen a
threshold to clear it. If the product commits partial frames, fix the
frame commit path. If the instrument mis-reads, fix the instrument and
plant a true partial frame as the positive control.

## ANSWERED 2026-08-02 — instrument, not product; fixed in place

The "Wanted" question above is settled: **the instrument overclaimed.**

`tasks:watch` repaints by clearing and redrawing and emits no
synchronized-frame markers. Between its clear and its redraw the child
has genuinely sent an empty screen, so a completed frame painted there
reports the truth of what arrived. Invar cannot make a foreign repaint
atomic, and no terminal emulator can. The old assertion demanded a
guarantee the app is structurally unable to give, so its verdict
tracked machine load rather than correctness.

Decisive detail: a QUIET run of the new assertion reports
`longest transient blank run 1`. The transient happens unloaded too, so
the old claim was false on an idle machine as well — load only raised
the odds of observing it.

The assertion is now convergence-shaped: trailing blank frames must be
zero, the longest transient run is reported and never gated, and no
threshold was invented. Both arms proven: the PRESENT arm requires the
content matcher to match at least one frame; a planted trailing blank
turned the convergence arm red with
`(15 outer frames, 1 trailing blank, ...)`.

New record: [Atomicity is claimed only for self-generated output](../../../../scripts/harness/harness.invariants.md).
Invar's own chrome keeps the strict absence claim — the distinction is
AUTHORSHIP, not severity.

**This task existed before tonight and I did not read it.** I
re-derived its conclusion from scratch — five gate runs and a
pre-landing sweep — to reach the finding already written here on
2026-08-01, with the same numbers (one green in four full-pool runs;
I measured one in five). Thirty flake tasks are filed and the backlog
is not consulted before investigating. That is the process defect worth
more than this fix.
