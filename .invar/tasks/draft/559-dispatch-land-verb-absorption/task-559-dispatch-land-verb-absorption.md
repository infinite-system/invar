# 559 — dispatch and land verb absorption

Priority: user-directed
State: DRAFT — enters after M3 review; ordering call (tasks-status vs
probe vs land first) is the user's at that review.
Engine: claude
Environment: linux
Model: fable-5
Effort: high

## In plain words

The fleet's verbs with side effects — dispatch, land, probe — get
class faces on the graph, walking the wrap ladder: first a face that
runs the script and returns structured results, later the logic moves
wholesale and the script becomes a two-line shim so every old entry
point keeps working. Never the same guard in two places.

## Scope seed

Rung 1 faces: HarnessDispatch (DRY_RUN passthrough + structured
refusal reasons), HarnessLand (GATE_LOG verdict + refusal codes),
HarnessProbe (both-arms results). Rung 2 absorption one script at a
time, each guard gaining a planted-defect test (fires AND stays
silent). Every absorbed verb becomes a recorded, typed event the
Observer can count — the steering ledger the Invariant Engineering
paper's metrics need.
