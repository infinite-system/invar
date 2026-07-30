# #364 — plugin-manifest residual wait weaknesses (measured, not reproduced)

State: ACTIVE
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## From #337 (the original scrollbar intermittent did not reproduce in 7/7)

Two measured weaknesses remain as the leading hypotheses if the
settled-geometry timeout (#335/#339/#342 sightings) recurs:

1. laidH=1 transient: 9 of 1088 right-dock-scrollbar lines carry laidH=1,
   always at boot index 0-1, ~4ms before settled laidH=33. A height>1 wait
   reading only the LAST log line stalls if the app quiesces on the
   transient. Could not be forced.
2. Unawaited input race (structure fold arm): two sendKeys('Down') then a
   bare readStatus and a 'Left' whose wait assumes the selection arrived.
   No wait proves the Downs landed; under load 'Left' can fold the wrong
   row and time out.

## Work (only if the class re-fires, or as a cheap hygiene pass)

Make the geometry wait tolerant of the transient (observe a settled line,
not the last line) and await the Down selections before reading. Both need
positive controls. Depends on #90 for log provenance if the reader stays
on artifacts/tui.log.

## Evidence upgrade from #90 (2026-07-30)

The laidH=1 transient is CONFIRMED genuine per-instance behaviour, not
interleaving: both concurrent instances publish laidH=1 first and the
settled value ~4ms later. #90's provenance fix removes the foreign-
transient hang path; the single-instance quiescence hypothesis survives
untested. The height>1 last-line wait remains the repair target here.

## Sighting (#365 gate, 2026-07-30): the settled-geometry timeout fired once in a hook's behavioral-contract retry and passed directly in the final hook — first recurrence since the #337 fix.
