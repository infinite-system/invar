# Task #456 — Focused structure filter loses its leading active cell

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

behavioral-contracts.sh failed waiting for 'the focused structure filter has one leading cell in the shared active tone'. Seen once (#442 round 11).

## Wanted

Drive it and establish whether the product or the instrument is wrong.
Tonight's dirty-dot round proved a broken checker can look exactly like
a broken product: the helper read the wrong row after a layout change,
and the conductor called it a user-visible regression. Establish which
side is wrong BEFORE changing either.
