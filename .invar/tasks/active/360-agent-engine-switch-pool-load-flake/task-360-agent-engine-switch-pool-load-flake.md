# #360 — agent-engine-switch smoke fails only inside the gate pool

State: ACTIVE
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Evidence (#350 gate, 2026-07-30)

In the 6-worker gate pool: FAIL "Codex-provider boot has no frozen Claude
identity" (scripts/harness/smoke-agent-engine-switch-harness.ts).
Standalone on the same tree: PASS. Media diff irrelevant (one lavfi
argument string; smoke opens no media pane).

## Reading

Load-dependent identity-freeze timing. A solo-only green is evidence of an
environment or ordering defect — deliberate-contention doctrine says treat
the under-load red as the finding, not the retry green.

## Work

Reproduce under deliberate contention; find the identity-freeze ordering
assumption that load breaks; fix the publisher or the wait condition.
