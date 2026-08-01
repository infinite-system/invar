# Task #445 — Ctrl+Alt+B does not close the right dock from inside it

Priority: dc-bycatch
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

The shortcut that opens the side panel should also close it. It does
not, once your cursor is inside that panel. So the panel gets stuck
open unless you click elsewhere first.

## Source

Bycatch from #442, reproduced during exploratory crossing drives.

## Seen

With the bottom panel open, Ctrl+Alt+B opened the right dock. The same
chord did NOT close it after focus moved into that dock. The focused
reserved-chord smoke passed, so the smoke does not cover the
focus-inside arm.

## Wanted

A toggle chord toggles regardless of where focus sits. Drive it, find
whether the chord is being swallowed by the focused surface or the
toggle is reading the wrong state, and lock the focus-inside arm into
the reserved-chord smoke.
