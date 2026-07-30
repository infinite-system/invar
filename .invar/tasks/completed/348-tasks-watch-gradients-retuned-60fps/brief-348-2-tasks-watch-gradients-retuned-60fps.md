# Brief #348 round 1 — tasks:watch gradients retuned for 60fps

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Reason with IBR.

## The task (user, verbatim intent in the task file)

tasks:watch was coded for 30fps; at 60fps the gradients cycle too fast.
Retune for 60fps viewing: make the animation phase TIME-BASED (wall-clock
driven) rather than frame-count based, so visual speed is identical at
any frame rate; then tune the gradient period to look right at 60fps.

## Method — drive first

1. Run bun run tasks:watch on a fixture ledger (NEVER this repo's real
   tasks against real agents), watch the gradients at 60fps. Iterate.
2. Time-based phase: derive phase from elapsed ms, not frame ordinal.
3. Contract: extend the renderer's unit tests — phase as a pure function
   of time is testable without a terminal; assert rate-independence
   (phase at time t identical under 30fps and 60fps sampling).

## Rules

No merge-gate.sh by hand; no SKIP_GATE; commit through the hook; commit
BEFORE writing READY; real hash + GATE_EXIT in the header; report to the
main-checkout task folder (absolute path). Known flaky classes: #214,
#359, #362, #364, #371 — name, do not chase. Builders never push.

## Invariants in scope

tasks-dashboard / tasks-watch records (idle quiescence; one spinner
generator — #343 landed the shared-frames rule, do not fork the tables).
Answer record by record; list missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; ## Bycatch always, even "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 348,
the task slug, md extension): time-based phase proof, driven 60fps look
check, gate chain, invariants answered, bycatch.
