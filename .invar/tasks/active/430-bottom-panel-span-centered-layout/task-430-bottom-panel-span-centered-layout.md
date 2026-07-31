# Task 430 — bottom panel must span under the side panels in Centered layout

Priority: user-directed
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## User report (2026-07-31, verbatim — follow-up after #391 landed)

> it's not fixed, the terminal is still only under the editor when
> you switch to center panel, bottom panel does not expand to be
> under both left and right panels...

So the real symptom behind "panes stuck in smaller mode on layout
switch": in the Centered panel layout the BOTTOM PANEL (terminal)
keeps only the editor's width instead of spanning the full row under
the left and right panels. This is layout COMPOSITION (which region
the bottom panel occupies per preset), not splitter clamping — #391
(e7f7b7ef) fixed report/paint coherence and did not touch this.

## Expectation

In Centered panel layout, the bottom panel spans the full viewport
width (under left dock, editor, and right dock). Compare: the
Full-height docks preset presumably narrows it deliberately — state
each preset's intended bottom-panel span in the report and make
Centered span full width.
