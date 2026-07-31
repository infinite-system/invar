# Brief 419-1 — Field v2 synthesis: the Invariable representation instrument

You are the SYNTHESIS pass — the last of five tasks. #415 (Vue SFC +
ivue foundation, v2 clone), #416 (design language: spec, tokens,
mockup at tools/invariant-field-v2-design/), #417 (exact 2D +
constrained 3D + timeline playout), #418 (record lens + shiki code
lenses) are ALL LANDED on your base. Your job: make five partial
efforts ONE instrument — coherent, beautiful, self-aware.

Read first, in full: the task file in this folder (user's verbatim
goals + additions + converted bycatch), the design language spec and
interaction spec (LAW for look and feel), the ivue skill
(.claude/skills/ivue/), the invariants skill
(.claude/skills/invariants/) for the contract schema, and the IBR
framework ([.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md)).

## The work

1. COHERENCE PASS: drive the whole app (real browser, real store).
   Hunt seams between the four builds — inconsistent tokens, clashing
   interactions, the #415 dead-selector bycatch, selection state
   friction between field/card/lens/timeline. Unify to the design
   language. The mockup is the north star; the app should finally
   FEEL like one thing: dark scientific instrument, game directness.
2. RELEASE GATE (user: "keep it simple"): one command (add it to the
   v2 README) that runs the tool's unit tests (parser parity, rank
   determinism, calibration arms incl. planted-rot red) + ONE driven
   smoke confirming the formula end-to-end. Wire it so the repo's
   conventions gate keeps covering the tree; do not build a second
   merge-gate.
3. THE INSTRUMENT'S OWN CONTRACT:
   tools/invariant-field-v2/invariant-field.invariants.md — the
   invariants FOUND while building (reality: rank is a pure function
   of tree+history; R is asymptotic; scanner is read-only toward
   contracts; span endpoint read-only + path-confined; no ambient
   render loop) and CHOSEN (weights, normalization policy, tokens as
   law) — canonical schema, checker green, annotations at enforcement
   points. Plus invariant-field.lattice.md: how they compose into the
   instrument's guarantees.
4. SELF-MEASUREMENT: once the contract exists the scanner ingests it —
   the Field gains its own dots and its own birth in the playout.
   Surface this DELIBERATELY and beautifully (user: "Can the
   Instrument itself present its own evolution as an example? measure
   itself? Or at least represent itself beautifully?") — e.g. an
   "instrument" domain lens that focuses its own records and plays
   its own history.
5. Name it: the app's title becomes the user's coinage — present the
   v2 as the "Invariable representation instrument" (exact chrome
   wording is yours; keep Invar's voice).

## End state

Driven coherence described in the READY (what you SAW change); release
gate command documented and green; both contract files present,
checker green, self-dots visible in the field and playout; full merge
gate GATE_EXIT=0 (the known #420 terminal-stage red on main is
pre-classified — if it fires, note it, all OTHER steps must be green);
commit before READY; v1 untouched.

## Invariants in scope

The v2 contract you are writing IS the answer — enumerate it in the
READY per record. Inherited: scanner read-only; server timer-free;
parser parity green.

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
