# Brief 417-1 — Field v2: 3D field, polished 2D, timeline playout

## Mission

Implement the FIELD SURFACE of the reimagined instrument in
tools/invariant-field-v2/ (never touch tools/invariant-field/ — v1 is
the frozen reference). Two modes and a playout:

1. 2D — the measuring surface: exact radial geometry per the design
   language; silhouette encodes kind, rim encodes verification, rot
   renders as fracture with an outward trace.
2. 3D — the constrained exploration: three.js (bun add three), orbital
   camera that is cancellable and never changes rank geometry (radius
   is truth; 3D adds presentation depth only). Reduced-motion mode
   stays 2D.
3. TIMELINE PLAYOUT: a play control that animates history — birth,
   inward strengthening, outward weakening, rot, removal as DISTINCT
   visual events per the interaction spec (140ms confirm, eased,
   cancellable; user called it "make the timeline playout").

## Ground truth to read first

- tools/invariant-field-v2-design/ — ALL FIVE artifacts (design
  language spec, interaction spec, TS+CSS tokens, sources, mockup).
  The mockup is the visual north star; tokens are LAW (style via
  DesignTokens.ts / tokens; no ad-hoc hex).
- tools/invariant-field-v2/ — the Vue SFC + ivue foundation (#415):
  server does one-shot Bun.build with an in-memory vue compiler
  plugin; five SFC owners exist; FieldView.vue is yours to extend or
  split (one template one logic owner; new logic owners are new ivue
  classes per the ivue skill, .claude/skills/ivue/ read in full).
- Strict conventions: [project.conventions.md](../../../../project.conventions.md) governs this tree; run
  vue-tsc, prettier, conventions before READY.

## Boundaries (a parallel task #418 builds the record explorer NOW)

- YOURS: field rendering (2D+3D), camera, timeline playout, dot-level
  hover/select visuals, mode switching.
- NOT YOURS: the record card, code lenses, list — #418 owns those.
  Shared seam: selection state on InvariantFieldApp (selected record /
  composition already exist) — consume and emit through it, do not
  redesign it; keep your diff out of RecordList/RankDisplay SFCs.

## Inner loop

Drive the real browser surface (Chromium) against the real generated
store; look, change, look. Contracts AFTER it feels right: extend the
v2 tests with deterministic assertions (mode switch, playout event
sequence over a fixture history, reduced-motion fallback) — no
duration/FPS assertions; count and ordering only.

## End state

Both modes + playout working against the real store, driven and
described in the READY report (with what you SAW); v2 tests green;
vue-tsc/prettier/conventions green; one full merge gate GATE_EXIT=0;
commit before READY; v1 diff empty.

## Invariants in scope

Unchanged from brief 415-1 (scanner read-only; server timer-free —
playout animation runs client-side on interaction, never a server
timer; parser untouched).

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
