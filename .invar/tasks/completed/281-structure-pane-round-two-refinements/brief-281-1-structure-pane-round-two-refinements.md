# Brief — #281: structure pane round two — no imports, visibility/$cache/override/getter marks, in-pane depth gear

Read first: [task-281-structure-pane-round-two-refinements.md](task-281-structure-pane-round-two-refinements.md)
— the record governs; arms are user-verbatim refinements on the landed
#274 pane.

Seven arms, one vocabulary:

1. **No imports in the outline** — filter import declarations at the
   analyzer source for every file type the TS analyzer serves.
2. **Visibility marks** — public vs private/#private per the pane's
   existing glyph/color vocabulary, both themes.
3. **$cache marks** — members under the ivue $cache namespace/manifest
   read distinctly from plain members (see
   [project.ivue-reference.md](../../../../project.ivue-reference.md)).
4. **Override detection** — a member overriding a parent's is marked;
   needs inheritance awareness in the analyzer arm.
5. **Inheritance line** — remove, or keep behind a default-off setting
   IF it is one flag on the existing settings seam; else remove. Report
   which you chose and why.
6. **Getter glyph + subtle color** — accessors read distinctly from
   methods and fields, both themes.
7. **In-pane depth gear** — the depth selector reachable from a gear
   affordance near the filter field; the SAME setting underneath — a
   second surface on the one generator, never a second source of truth.

Extend [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) (#274's records), don't fork. All arms
under real defaults, positive control each, labels stable at both
scales.

## Invariants in scope

[structure.invariants.md](../../../../src/modules/structure/structure.invariants.md); settings records; ivue $cache conventions.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report in the task folder: seven arms driven with evidence +
positive controls, the arm-5 decision stated, green `bun test` +
structure smokes + manifest smoke. The conductor gates at landing.
