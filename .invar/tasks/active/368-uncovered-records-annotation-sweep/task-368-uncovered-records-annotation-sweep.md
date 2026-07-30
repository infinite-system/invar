# #368 — six uncovered invariant records get their annotations

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #90 (census finding 4)

"Observability never crashes the app" (src/modules/system/
system.invariants.md) has NO annotation anywhere — its Scope names
StatusChannel.flush/settle and Logging.write, all upholding it, but a
future edit removing a try block passes the checker. #90's report says
five other records share this state (checker coverage lines).

## Work

Run the checker's --refs coverage listing; for each uncovered record apply
the coverage triage ladder from the invariants skill (annotation at the
Mechanism-named site / absence anchors / guarding negative test /
review-time exemption). Propose-only per record where judgment is needed.
