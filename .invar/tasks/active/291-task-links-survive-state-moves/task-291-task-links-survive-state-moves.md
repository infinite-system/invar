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

## Scope constraint (user, 13:2x): the wildcard applies ONLY to task-state paths

The state-fallback and any --fix rewriting fire ONLY when the resolved
path matches `.invar/tasks/<state>/<task-folder>/...` — a structural
match on the four state dirs and a task-folder-shaped name. EVERY other
relative link (src/, scripts/, project.*.md, docs) keeps plain
resolution: exists, or dead. No fuzzy search, no basename hunting, no
"smart" recovery outside the one seam whose move semantics we OWN —
guessing at general paths would repair typos into wrong targets and
launder real rot. Negative arm in the self-test: a dead src/ link must
NOT be rescued by any fallback.

## Arm 4b (user, 13:3x): move-class --fix runs automatically at land and dispatch

Wire `--fix --moved-only` (the identity-preserving class ONLY: task-state
path rewritten to the file's current, verified location) into land.sh
(the report + task file at landing) and dispatch.sh (the brief at
filing) — silent, logged one line each ("N moved link(s) refreshed").
The judgment classes stay manual: bare references and dead links refuse/
warn with suggestions exactly as today — an auto-fix must never choose a
target or alter testimony, only refresh a path to the same proven file.
Self-test arm: --moved-only must not touch a bare reference even when
its suggestion is unambiguous.

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
