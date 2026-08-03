# Task 496 — ast-query's thirteen older modes lack both-arms self-test

Priority: verification-integrity
Engine: claude
Environment: linux
Model: fable-5
Effort: low
State: ACTIVE

## In plain words

#493 gave ast-query a self-test, but only for its two new modes. The
thirteen older modes have no both-arms proof, and the ast-query skill
doc's ready-tool list still omits several existing modes (members,
named-calls). Extend the self-test fixture to cover every mode
(positive + negative arm each) and complete the doc list.
