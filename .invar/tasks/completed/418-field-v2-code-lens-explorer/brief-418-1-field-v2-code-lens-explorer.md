# Brief 418-1 — Field v2: record explorer with code lenses

## Mission

Make the Field a DOOR INTO THE IMPLEMENTATION (user verbatim: "the
Invariance Field is also a door into the real rubber meats the road
implementation in the code, this can also showcase the quality of the
code of the repository"). In tools/invariant-field-v2/ (never touch
v1):

1. RECORD CARD v2 — selecting a dot (or list row) opens the full card:
   essence first (name + one-line if-then), accordion into every
   field, rank component breakdown, and its RELATIONSHIPS: lattice
   memberships with the emergent guarantee, dependency links, sibling
   records in the domain — each clickable, navigating the selection.
2. CODE LENSES — every code reference a record carries (Evidence
   citations, Mechanism file:line mentions, and its invariant:
   annotations discovered by the scanner) becomes a lens: a popup
   showing the REAL code around that line with proper syntax
   highlighting for TypeScript AND Vue SFCs. Use shiki (bun add
   shiki) server-side or at store-build time; the server may add an
   endpoint that reads the cited file span (read-only, path-confined
   to the repository root — refuse anything outside it).
3. The annotation lenses show the enforcement point WITH its
   invariant: comment line visible — the reverse pointer made
   tangible.

## Ground truth to read first

- tools/invariant-field-v2-design/ — all five artifacts; tokens are
  LAW; card/lens states live in the interaction spec.
- tools/invariant-field-v2/ — #415's foundation (Vue SFC + ivue;
  read the ivue skill in full: .claude/skills/ivue/).
- The scanner already resolves citations and annotations
  (ContractParser/RepositoryHistory) — extend the store with the
  file:line data lenses need; do NOT re-derive it client-side.
- Strict conventions: [project.conventions.md](../../../../project.conventions.md); vue-tsc, prettier,
  conventions green.

## Boundaries (parallel task #417 builds 3D field + playout NOW)

- YOURS: RecordList/RankDisplay/card/lens surfaces, store extensions
  for lens spans, the read-only span endpoint.
- NOT YOURS: FieldView/camera/3D/timeline — #417 owns those. Shared
  seam: selection state on InvariantFieldApp — consume/emit through
  it; keep your diff out of FieldView.vue.

## Inner loop

Drive the real browser: select records, open lenses on real citations
(the two known-dead citations from #414 are your negative fixtures —
a dead citation must show an honest "does not resolve" lens, not a
crash). Contracts after: tests for span extraction (present + absent
arms), path confinement (an outside-root request must refuse), and
highlighted-output determinism.

## End state

Cards + relationships + working lenses with TS and Vue highlighting
against real repo code, driven and described; tests green incl. both
arms; one full merge gate GATE_EXIT=0; commit before READY; v1 diff
empty.

## Invariants in scope

Brief 415-1's set, plus: the span endpoint is READ-ONLY and
path-confined to the repository root (state this in your report — it
is a new capability and its confinement is the invariant).

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
