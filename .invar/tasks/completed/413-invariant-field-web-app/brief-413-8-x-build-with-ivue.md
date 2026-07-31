# Brief 413 — the app is built with ivue; read the skill

Scope unchanged. One standing convention we failed to state: this
project's frontend logic is written with ivue (class-based Vue 3
reactivity) — that is a GLOBAL convention here, and the Field app is
not exempt.

1. Read, in full, before writing or refactoring any app logic:
   [the ivue operating manual](../../../../.claude/skills/ivue/SKILL.md). It covers:
   Reactive() classes, state as ref-getters, derived values as plain
   getters, namespace exports, the SFC wiring shape, naming and
   spacing conventions.
2. Check package.json for ivue; if missing, bun install ivue (or use a
   vendored engine module if one exists — never both).
3. Apply it to the Field app: the field view, list/accordion, time
   slider, and rank display each get their logic in Reactive classes
   per the skill's templates (one template, one logic owner; no logic
   in template expressions — named getters). The scanner/snapshot
   builder stays plain TypeScript — ivue governs reactive UI logic,
   not batch scripts.
4. If you already wrote UI logic another way, convert it now — before
   the surface grows. Cheaper today than in round 3.

## End state

The app's UI logic lives in ivue Reactive classes following the
skill's checklist; your READY report states ivue was used and names
the classes. Report newer than this brief's stamp.

## Invariants in scope

Unchanged from brief 413-1.

## Bycatch expected

Unchanged from brief 413-1.
