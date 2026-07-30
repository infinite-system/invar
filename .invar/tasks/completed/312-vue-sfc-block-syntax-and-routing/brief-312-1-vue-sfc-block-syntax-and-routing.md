# Brief — #312: Vue SFC integration, phase 1+2 from the accepted map

Read FIRST, in order:
1. [task-312-vue-sfc-integration-implement.md](../../active/312-vue-sfc-integration-implement/task-312-vue-sfc-integration-implement.md)
   — the user accepted ALL FIVE map recommendations verbatim; they and
   his quoted words GOVERN.
2. [the #311 map](../../completed/311-vue-sfc-integration-map/project-vue-integration-map.md)
   — the implementation spec: architecture, five phases, per-phase
   acceptance drives, boundaries. Follow it; do not re-derive it.

## Scope of THIS dispatch: phases 1 and 2 only

- Phase 1: generic syntax-source port + plural language-service routing
  behind one host router (fixes the single-provider shadowing defect
  the map names). Includes writing the MISSING syntax module domain record (a new invariants file in src/modules/syntax)
  (bycatch pre-work in the record) and fixing the LanguageRegistry
  comment drift when the real registration port lands.
- Phase 2: block-aware Vue highlighting through that port — script
  setup as TypeScript, template as template, style as its declared
  language INCLUDING true SCSS (user decision 5). Rounded by the map's
  phase-2 acceptance drives at both scales.
- Phases 3-5 (server spike, semantics, formatting/folding) are LATER
  dispatches — do not start them. If phase 1 reveals the map got a seam
  wrong, STOP that arm, report the delta, finish what stands.

## Discipline

- Cleanly pluggable is the TEST (user's words): Vue ships as a plugin;
  core carries no .vue special case. The "core untouched" polarity from
  the record applies from phase 1: removing the Vue plugin returns .vue
  to plain text with zero dangling references.
- One commit per coherent step, full gate through the enforcing hook,
  NO SKIP_GATE product commits; both polarities per the map's
  acceptance drives; derive colours from theme tokens.

## Invariants in scope

plugins records, syntax module (new record to write), editor/language
records the map names.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: phase-1 router + port landed with the new syntax record,
phase-2 .vue block highlighting driven per the map's drives (TS script,
template, CSS + SCSS styles) at both scales, core-untouched polarity
proven, GATE_EXIT=0 through the hook. The conductor gates at landing.
