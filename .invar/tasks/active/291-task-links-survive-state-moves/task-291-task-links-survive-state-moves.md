# 291 — task links survive state moves: the name is the identity, the state is a wildcard

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 13:1x — "we move things, so links go stale; any mechanical way to fix that across the system?")

## Outline

Task folders MOVE between state dirs (active -> in-progress ->
completed/retired) but the folder NAME is stable for life. Links that
encode the state path rot on every move (proven twice today by the
conductor's own links). Fix at the resolvers, ONCE each:

1. **The app's link opener** (markdown click path, #276): when a
   relative target under `.invar/tasks/<state>/<name>/...` does not
   exist, retry the SAME tail (`<name>/<file>`) under the other three
   state dirs before declaring the miss. The stated-miss behavior stays
   for genuinely absent files. Jump ends unchanged.
2. **lint-task-links.ts**: same fallback — a link that resolves under a
   sibling state dir is VALID but flagged as "moved; current location
   is X" with --fix rewriting to the current state path. (A link that
   resolves nowhere stays dead.) Self-test arms for: current-state link
   (silent), moved link (flagged + fixable), dead link (red).
3. **The retro-sweep** (named by #288 as follow-up): run --fix across
   ALL .invar/tasks/**/ records + the generated views, committing the
   rewrite as one sweep commit. write-active already emits
   current-state links each regeneration, so the views self-heal; the
   hand-written records are what the sweep repairs.
4. RECORD the convention in the manage-tasks skill: link to task
   folders by name; the state dir in a written path is a HINT, not the
   identity — resolvers must treat it as such.

Both polarities throughout; the linter's moved-vs-dead distinction is
the load-bearing new behavior — a dead link must NOT pass because the
fallback exists.

## Arm 5 (user, 13:2x): the preview paints dead links RED

The markdown preview styles a relative link by the resolver's verdict:
resolves (normal link style), resolves-under-another-state (normal — it
works), DEAD (red, both themes). The click-time stated-miss stays; the
red is the same truth surfaced at render. Verdicts are computed per
parse revision and cached (no per-frame fs probing — the settled-frame
contract must not gain filesystem work per paint). http(s) links are
out of scope for the check (no network). Both polarities driven: a dead
link paints red; fixing the file live (watcher revision) repaints it
normal.

## Invariants in scope

- #276's link-walk records (extend with the wildcard-state component);
  the lint-task-links self-test contract (#288); the manage-tasks skill
  convention.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## Sources

- User message 2026-07-29 13:1x; today's two live instances (the
  conductor's #282 and text.invariants links).
