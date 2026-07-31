# Task 413 — Invariant Field: live web app ranking repo invariants over time

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Assignment note: user explicitly ordered "Launch gpt-sol high model to do this" (2026-07-30) — overrides the medium fleet default.

## User request (2026-07-30, verbatim core)

> make a dev live web app, that scans now whole invar repo for all
> invariants and extracts them into a data store, but not only that it
> should be timeseries based data store of the invariants emerging over
> time, and invariant clusters / domains emerging, dots lighting up on
> the Invariant Field ... Rank the invariants in the repo in a way that
> you can actually correctly put them onto the Invariant Field with R
> in the center ... All Invariants should be findable on the Field, but
> also as filterable searchable list ... lead with the essence first,
> IBR and invariants are about reduction and generation, the core
> should be essential, generation should be comprehensive, so something
> like Accordion expansion ... The timeseries part of the field is to
> rank each snapshot of Invariants overtime, through tracking the git
> history ... And the sign of your design being correct is that your
> Invariance Field shows you closing in on R or getting further away if
> you are not a good Wielder.

Direction refinement (user): v1 does the FULL rank algorithm and the
SIMPLEST visual — the visual is how the agent itself verifies the
reduction (same property as confirming by driving the real PTY).

## Home

tools/invariant-field/ — Bun script scanner + Bun.serve dev app.
