# #374 — word-delete harness Alt+Delete arm times out under gate load

State: ACTIVE
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Evidence (#326 stage-2 gate, 2026-07-30, twice in one gate)

The word-delete harness timed out twice waiting for Alt+Delete to keep
the active buffer open with the cursor after "hello". The Option+
Backspace arm passed. The diff (vendor plugins/kernel/restart) touches no
word-deletion path.

## Work

A wait must be a condition: reproduce under contention, find what the
Alt+Delete wait actually observes, bind it to the real publisher. Check
whether Alt+Delete key routing itself can drop under load (vs the wait
missing a published state).

## RECLASSIFIED (conductor measurement, 2026-07-30 06:2x)

NOT a load flake. Off-diff discrimination: current main standalone GREEN
3/3; the #326 merged tree standalone RED 3/3 (deterministic — "Timed out
waiting for Alt+Delete keeps the active buffer open with the cursor after
hello"). The vendor-plugin diff breaks the Alt+Delete path (it was red in
BOTH of #326's gates, pre- and post-merge). The fix belongs to #326's
branch; this task stays as the record of the false-flake classification.
