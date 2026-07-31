# Brief 413-1 — Invariant Field: rank the repo's invariants, render them, watch them move

## Mission

Build a dev live web app (Bun script + Bun.serve, home: tools/invariant-field/)
that:

1. Scans this repo's contract layer — every `*.invariants.md` and
   `*.lattice.md` — and parses each record with all its fields (name,
   kind, Invariant, Scope, Mechanism, Generates, Rejected alternatives,
   Evidence, Impossible if true, Verification, Status, Last refined).
2. Builds a TIMESERIES data store: walk git history for every commit
   touching those files, snapshot the parsed records per commit. Track
   record identity across renames (rename ripples land atomically in
   one commit here — use that). Static JSON artifacts are fine; no
   database.
3. RANKS every invariant by distance from R (reality, the center) with
   a derived, inspectable algorithm — see The rank below.
4. Renders the Invariance Field: dots on concentric geometry, R at
   center, domains (contract files) as angular sectors, rank as radius,
   a time slider that replays history. Lattice compositions light up
   their member dots together.
5. A filterable, searchable, sortable list view: essence first — the
   record name + one-line if-then collapsed; accordion expands to the
   full record (generation is comprehensive: Mechanism, Generates,
   Impossible if true, Evidence, Verification, Rejected alternatives,
   lattice memberships and the emergent property each composition
   produces).

## Read the theory FIRST (absolute paths, all exist)

Three prior Field visual versions — study all three, then design v4
matching Invar's own theme, simplest-first:

- v1: /home/parallels/dev/ibr/Visualizations/invariance-field.html
- v2: /home/parallels/dev/ibr/web/v2-lattice/field.html
- v3: /home/parallels/dev/ibr/web/v3-vitepress/.vitepress/theme/components/InvarianceFieldPage.vue
  (page: [/home/parallels/dev/ibr/web/v3-vitepress/the-invariance-field.md](../../../../../ibr/web/v3-vitepress/the-invariance-field.md))

Three papers — the conceptual ground for the geometry. They live in
/home/parallels/dev/ibr/Papers/ (filenames carry spaces; resolve them
with: ls /home/parallels/dev/ibr/Papers/ | grep 'Invariance Field'):

- date prefix 26.04.21 - 13.00 — "The Invariance Field" (Paper, Sharp)
- date prefix 26.04.21 - 14.01 — "The Asymptotic Theory of Everything" (Article)
- date prefix 26.06.01 - 05.33 — "Curvature Is Connection Density - From the Concave-Mirror Descriptor to a Working Engine" (Paper, Sharp)

Key geometric commitments from the theory: R is asymptotic — nothing
reaches the center; use a radial scale that makes that legible.
Curvature is connection density — lattice in/out-degree bends a record
inward.

## The rank (the REDUCTION half — this is the core deliverable)

Radial distance from R must be DERIVED from measurable record
properties, never aesthetic placement. Starting components (you may
refine the formula through your inner loop, but every component must
stay mechanically computable and the formula must be displayed,
inspectable, inside the app itself):

- Kind: reality-absolute < reality-renegotiable < chosen (chosen is
  agreement-set — structurally farther from R).
- Falsifiability: Impossible if true present and non-vacuous.
- Evidence: citations resolve to real files/symbols in the tree at
  that snapshot.
- Verification: command exists; run it at scan time when cheap and
  read-only, else citation-resolution only — record which.
- Status: established closer than provisional.
- Generativity: Generates non-empty; lattice connection density
  (the curvature paper, made literal).
- Survival: age x refinement history from git (a record that survived
  many audits unbroken is deep; one that keeps breaking is shallow).

Movement over time falls out: gaining evidence/verification/
composition moves a dot inward; rot (dead citation, broken
verification) drifts it outward. The user's stated sign of a correct
design: the Field shows the project closing in on R — or drifting out
under bad wielding.

## The visual is YOUR instrument (Rule Zero, applied to an algorithm)

The simplest field rendering is not a deliverable to polish — it is
your inner loop. Compute ranks, render, LOOK: does the geometry match
reality? Iterate rank -> render -> look in seconds. Write contracts
only AFTER the field reads true. Calibration arms you must drive:

1. Known-deep records (long-surviving reality invariants with heavy
   lattice composition) sit visibly inward.
2. A vacuous or thin provisional record sits at the rim.
3. PLANTED ROT (positive control): on a scratch copy — NEVER the real
   contracts — break a record's Verification/Evidence and re-scan: its
   dot MUST move outward. An instrument that can only show
   "everything fine" is decoration.

Scope cut for this round: full rank + simplest truthful visual + time
slider + list/accordion. Theming polish, physics, animations: later
round. Do not gold-plate the optics before the algorithm reads true.

## End state

- tools/invariant-field/ contains the scanner, the snapshot store
  builder, and the Bun.serve app; a README states how to run it.
- The app shows: Field with R center + domains + time slider; the
  searchable list with essence-first accordion; the rank formula
  visible in-app.
- All three calibration arms demonstrated and described in your READY
  report (with what the planted-rot arm showed).
- Tests for the parser and rank function (bun test). One full gate,
  commit before READY. A report file exists in this folder.

## Invariants in scope

- [Cost tracks the actively observed set](../../../../project.invariants.md) —
  your dev server must not add idle load to anything; it is a
  standalone tool, keep it out of the app's runtime.
- The contract-layer parsing must respect the canonical schema in
  [.claude/skills/invariants/SKILL.md](../../../../.claude/skills/invariants/SKILL.md) (record shape, kind derivation
  from section membership, slug rules). Your parser reads the same
  layer the checker validates — do not invent a divergent format.
- Read-only toward the contract layer: the scanner NEVER writes to any
  *.invariants.md / *.lattice.md. Planted-rot runs on scratch copies
  only.

## Bycatch expected

Report per the AGENTS bycatch taxonomy (runtime defects, invariant
violations, comment drift, distillation possibilities, generator
drift, nonsense). Records your parser finds malformed or vacuous are
bycatch gold — list them. None observed is a valid section body.
