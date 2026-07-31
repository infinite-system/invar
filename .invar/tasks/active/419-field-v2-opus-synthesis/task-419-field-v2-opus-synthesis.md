# Task 419 — Field v2: Opus synthesis — the Invariable representation instrument

Priority: user-directed
State: ACTIVE
Engine: claude
Environment: linux
Model: opus-5
Effort: medium
Assignment note: user explicit — "Make Opus 5 - medium do the synthesis work ... culminating with Opus 5 synthesis, to make new generation Invar-ant, Invariable representation instrument."

Part 5 of 5 (Field v2 program). Depends on #415-#418 all landed.

## User additions (2026-07-31 ~02:1x, verbatim core — synthesis scope)

> Also make a gate for it it must pass before the release, tests,
> smokes that confirm the formula, but keep it simple. Also create
> .invariants.md, and .lattice.md of the Instrument itself, what
> invariants were found, what invariants were chosen and how do they
> interact. Can the Instrument itself present it's own evolution as an
> example as well? Can the instrument measure itself? Or at least
> represent itself beautifully?

Conductor reduction for the brief:
1. GATE: a simple release gate for the tool — unit tests (parser
   parity, rank determinism, calibration arms incl. planted-rot red)
   + one driven smoke confirming the formula end-to-end. Keep simple.
2. CONTRACTS: tools/invariant-field-v2/invariant-field.invariants.md
   (reality-based: e.g. rank is a pure function of tree+history, R is
   asymptotic; chosen: weights, normalization policy) +
   invariant-field.lattice.md (how they compose into the instrument's
   guarantees). Canonical schema; checker green.
3. SELF-MEASUREMENT: once the contract exists the scanner ingests it —
   the Field contains its own dots and its own evolution timeline.
   Surface this deliberately and beautifully (a "the instrument
   itself" domain/lens; its birth visible in the playout).
