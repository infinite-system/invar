# Task #446 — Quick Open enumeration can stay loading on the full repository

Priority: flake-evidence
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

The file search box sometimes never finishes listing files in this
big repo, so it just says loading until the test gives up.

## Source

Bycatch from #442, seen ONCE, not reproduced.

## Seen

A default drive against the full repository left
`quickOpenFileEnumerationState` at `loading` until the drive timed out.
A later 60-file Quick Open arm passed.

## Wanted

Establish whether this is a real stall or a slow enumeration racing a
fixed timeout. Repeat the full-repository drive enough times to get a
rate, and read the enumeration as a SERIES, not a pass/fail. Do not
widen a timeout as the fix.
