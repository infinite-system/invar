# Task #454 — Agent pane asks for an inverted grid region

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

smoke-agent-pane-ux-harness.ts threw 'Invalid grid region rows 27-2, columns 38-108 for 50x110 snapshot' during its tail-scroll arm. Rows 27-2 is inverted — a self-contradictory diagnostic, so suspect the region math, not the pane. Reproduced twice (#442 round 11).

## Wanted

Drive it and establish whether the product or the instrument is wrong.
Tonight's dirty-dot round proved a broken checker can look exactly like
a broken product: the helper read the wrong row after a layout change,
and the conductor called it a user-visible regression. Establish which
side is wrong BEFORE changing either.
