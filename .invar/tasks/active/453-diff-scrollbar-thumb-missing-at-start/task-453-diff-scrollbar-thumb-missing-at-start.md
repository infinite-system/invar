# Task #453 — Diff pane vertical thumb never paints

Priority: flake-evidence
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

A check that drives the real app stopped working. It is not related to
the work that found it, so it gets its own task and its own evidence.

## Seen

smoke-scrollbars-harness.ts timed out at 'the diff pane vertical thumb is painted before frame collection begins'. The final diff grid showed no thumb. Reproduced twice (#442 round 11).

## Wanted

Drive it and establish whether the product or the instrument is wrong.
Tonight's dirty-dot round proved a broken checker can look exactly like
a broken product: the helper read the wrong row after a layout change,
and the conductor called it a user-visible regression. Establish which
side is wrong BEFORE changing either.
