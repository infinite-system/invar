# Task #440 — panelListGeometry reports impossible coordinates

Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
State: ACTIVE

## What

`panelListGeometry` published `left: -24, top: 0, width: 24` while the
restored list painted from column 108, row 25, in a 132-column frame
(#439 report, Bycatch OBSERVED). A negative left is impossible on any
grid. Probes and gesture helpers key on this projection; #439's helper
had to anchor to the painted header instead.

## Wanted

The projection reports the painted geometry in every state, including
restored sessions. Both arms: a planted wrong geometry must be
detectable by the smoke that locks this.
