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
