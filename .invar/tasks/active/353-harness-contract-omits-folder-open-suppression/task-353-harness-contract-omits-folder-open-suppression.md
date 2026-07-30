# #353 — harness PTY contract omits folder-open suppression

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #342 (builder's exact words, 2026-07-30)

Contract drift: the record "Harness input and output use the real PTY"
(scripts/harness/harness.invariants.md) names built-in suppression but
omits folder-open suppression. PtyTestDriver.ts sets both flags.

## Work

Refine the record so it names both suppression flags (a `refines` per the
invariants skill). Verify against PtyTestDriver.ts current code. Doc +
contract change only; no product code expected.

## Note

Two gate flakes were also reported (scrollbar smoke, behavioral contracts —
each timed out once, passed immediate retry, did not reproduce). Logged
here as flake evidence, not converted to tasks: single non-reproducing
occurrences. If either recurs in another lane's gate, file it.
