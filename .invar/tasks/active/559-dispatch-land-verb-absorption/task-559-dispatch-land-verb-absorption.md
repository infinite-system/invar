# 559 — dispatch and land verb absorption

Priority: user-directed
State: ACTIVE
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

## Scope (settled: the verb contract, rung 1)

1. THE RUN CHANNEL: CLI `run <verb> [arguments...]` + server POST
   /run — executes a registered wrap face, returns structured
   {ok, exitCode, output fields}. Unknown verb fails loudly with the
   verb list (misses teach).
2. WRAP FACES (logic stays in the scripts): probe (all probe.sh
   verbs, both-arms results), dispatchDry (DRY_RUN=1 passthrough,
   refusal lines structured). land face DEFERRED to rung 2 — land.sh
   has no dry mode and executing it via graph adds no safety yet.
3. THE EVENT LEDGER: every run appends one line to
   .invar/harness-events.jsonl (verb, arguments, exitCode, startedAt,
   durationMs) — disk is the store; graph domain `events` reads it
   (bounded print already handles size). This is the typed steering
   ledger the Observer metrics need.

## Original scope seed

Rung 1 faces: HarnessDispatch (DRY_RUN passthrough + structured
refusal reasons), HarnessLand (GATE_LOG verdict + refusal codes),
HarnessProbe (both-arms results). Rung 2 absorption one script at a
time, each guard gaining a planted-defect test (fires AND stays
silent). Every absorbed verb becomes a recorded, typed event the
Observer can count — the steering ledger the Invariant Engineering
paper's metrics need.
