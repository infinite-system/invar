# Task #447 — Panel-drag smoke timed out once on the last-cell drag

Priority: flake-evidence
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

One test that drags the panel divider gave up waiting once, then
passed straight after. Either the drag is sometimes dropped or the
wait is looking for the wrong thing.

## Source

Bycatch from #442, seen ONCE.

## Seen

`bun scripts/harness/smoke-panel-chrome-harness.ts` timed out waiting
for the last-cell drag. Its immediate rerun and the final 120-column
and 88-column passes succeeded.

## Wanted

A wait must be a condition. Check whether that wait can be
pre-satisfied or unreachable, per conductor family 1. Do not raise the
timeout.
