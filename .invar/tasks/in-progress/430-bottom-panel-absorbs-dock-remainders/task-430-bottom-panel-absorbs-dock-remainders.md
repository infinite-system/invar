# Task 430 — the bottom panel absorbs every dock remainder

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## User report (2026-07-31, verbatim)

> it's not fixed, the terminal is still only under the editor when
> you switch to center panel, bottom panel does not expand to be
> under both left and right panels...

Ruling on scope (user, verbatim):

> yes, it should extend always if any other panel is in small mode
> and bottom panel CAN expand, it should, otherwise the spot is just
> a blank space which does not make sense

## Conductor probe evidence (tmp/probe-430-preset-spans.ts, 120x40)

Centered panel: sidebar L4 W32 rows 0-19; editorCenter L37 W54 rows
0-19; rightDock L92 W28 rows 0-19; bottomPanel L37 W54 rows 21-36 —
editor width only. The freed area is dead space:
primaryDockRemainder L4 W33 rows 19-36, rightDockRemainder L91 W29
rows 19-36. Default shows the same on the right side only (right
dock ends-at-panel, its remainder unclaimed; sidebar full-height is
deliberate flanking).

Probe gotcha: PtyTestDriver mouse clicks need kind press/release —
down/up silently no-ops (cost this probe three rounds).

## The rule

A dock that ends at the panel yields its columns to the panel below.
Bottom panel width = viewport width minus full-height docks (and
activity bars) only. Remainder slots cease to exist as blank space —
in every preset and every hand-set span combination, not just
Centered.
