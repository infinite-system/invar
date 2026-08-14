# 556 — iv-harness script absorption and structured task reports

Priority: user-directed
State: DRAFT — spec after M2 review; user gates entry ("after done m2
we review it and then do m3").
Engine: claude
Environment: linux
Model: fable-5
Effort: high

## In plain words

The graph reads what the fleet scripts leave behind. This task gives
the fleet's verbs (dispatch, land, probe, tasks-status) class faces on
the graph, and makes builder READY reports structured data instead of
essays — so questions like "how much steering did this week need"
become computable.

## Scope seed (detail after M2 review)

- The wrap-to-absorb ladder per the contract record "A wrapped script
  keeps its logic in one place": Static class faces that shell out and
  parse output first; wholesale absorption (script becomes a bun shim)
  only on a real touch; never the same guard twice.
- Structured TaskReport: the report's Invariants-in-scope / Bycatch /
  steering fields born as graph nodes (the Invariant Engineering
  paper's worker-as-sensor schema), enabling steering density,
  repeated-correction rate, and architectural-surprise metrics.
- Candidate absorption order: tasks-status.ts (already TS, closest),
  probe.sh, land.sh, dispatch.sh (most guards — last).

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
