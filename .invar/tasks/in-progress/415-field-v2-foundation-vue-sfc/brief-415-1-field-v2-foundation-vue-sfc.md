# Brief 415-1 — Field v2 foundation: Vue SFC toolchain, ivue, strict conventions

## Mission

USER DIRECTIVE (2026-07-31): v2 is built on a CLONE. First act: copy
tools/invariant-field/ wholesale to tools/invariant-field-v2/ and do ALL
v2 work there. tools/invariant-field/ (v1, the first agent's build)
stays byte-untouched as the living reference — both must keep working.
Default ports must differ (give v2 --port default 4314) so both can run
side by side.

Rebuild the Invariant Field frontend (in the v2 clone) on a Vue 3
single-file-component foundation with script setup lang ts, keeping the
ivue class architecture, and bring the whole tool under the SAME strict
conventions as the Invar app itself. This is the FOUNDATION task of a
5-task program (#415-#419): #417 (3D field + timeline playout) and #418
(code-lens explorer) build directly on your toolchain, and #419 (Opus
synthesis) integrates everything. Your job is a rock-solid, convention-
clean skeleton with the EXISTING features working — not new features.

## Read first (all in-repo)

1. [the ivue operating manual](../../../../.claude/skills/ivue/SKILL.md)
   IN FULL — the class template, the SFC wiring template (it already
   uses script setup lang ts), one-template-one-logic-owner, the state
   destructure rules, DO/NEVER table.
2. [project conventions](../../../../project.conventions.md) IN FULL —
   the user's order: "make them use [project.conventions.md](../../../../project.conventions.md) same as
   invar itself, let's make it strict, same policy". Check whether the
   conventions gate scripts currently walk tools/ — if they exclude it,
   extend the gate config so tools/invariant-field is governed
   identically to src/ (that extension is in scope for this task).
3. The current tool: every file under tools/invariant-field/ — you are
   migrating its clone, and nothing may regress in EITHER copy (v1
   stays untouched).
4. [the IBR framework](../../../../.claude/skills/ibr/IBR.md) — the
   instrument's conceptual ground; reason with it, plain language out.

## The work

1. TOOLCHAIN: Vue 3 SFCs compiled in the Bun pipeline (bun add vue plus
   a Bun .vue loader plugin, or a minimal build step if HTML-import
   plugins cannot compile SFCs — investigate, pick the simplest thing
   that works, document the decision in the README). Dev loop must stay
   one command: bun tools/invariant-field/server.ts [--host=...]. Keep
   the no-watcher no-timer property of the server.
2. MIGRATE the five ivue logic owners (InvariantFieldApp,
   HistoryTimeline, FieldView, RecordList, RankDisplay) into SFCs:
   class stays the logic owner per the ivue skill; the SFC script setup
   block is wiring only; templates carry named bindings, no logic
   expressions. TypeScript everywhere; zero .js sources.
3. STRICT CONVENTIONS: the v2 tool passes the repo conventions gate
   (naming, no abbreviations, full identifiers), prettier, typecheck,
   and the invariant checker untouched. Scanner/rank/server backend
   stays as-is except where the gate demands renames.
4. DESIGN-TOKEN SEAM: extract current colors/spacing/type into one
   tokens module (CSS custom properties generated from a TS tokens
   file) so #416's design language can be applied by changing tokens,
   not hunting hex codes.
5. Drive it: the app must render the field, list, accordion, time
   slider, composition lighting — feature parity with today, verified
   in the real browser surface, plus bun test tools/invariant-field
   green.

## End state

Feature-parity app on Vue SFC + ivue + tokens seam; conventions gate
covers tools/invariant-field-v2; v1 diff is EMPTY (git diff --stat on
tools/invariant-field/ shows nothing); one full merge gate green (GATE_EXIT=0
read from the log); commit before READY; report in this folder names
the toolchain decision and the token seam.

## Invariants in scope

- The scanner remains read-only toward contracts (brief 413-1 rule).
- [Cost tracks the actively observed set](../../../../project.invariants.md)
  — the dev server stays timer-free.
- The parser/checker parity test must stay green — do not touch parsing.

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
