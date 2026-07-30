# #356 — the agent pane becomes a decoupled module with an on-off switch

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30, verbatim intent)

"Agent pane in Invar is actually also a module that should be enabled
disabled and completely decoupled from terminal etc, has to be separate if
it's not already cause i don't see it in the plugins section."

## The shape

1. Audit the current coupling: where the agent pane's code lives, what it
   imports from / is imported by the terminal module, and whether any seam
   already separates them.
2. Make the agent pane a first-class module like the others: it appears in
   the plugins/extensions section, with the same enable/disable knob the
   other plugins get (#349 refines that section's look; do not collide —
   coordinate if both are in flight).
3. Disabled means fully absent: no pane, no activity-bar entry, no key
   chords, no background processes. Enabled restores all of it.
4. Complete decoupling from terminal: the terminal module must work with
   the agent module absent, and vice versa. No shared mutable state; any
   genuinely shared generator (PTY plumbing?) gets a named seam, not a copy
   (seam-at-shared-generator rule).

## Relations

- #326 (vendor modularity / third-party plugins) defines the module
  registry and kernel-seal composition — the agent module should ride the
  SAME mechanism, not a parallel one. If #326 stage 2 lands first, build on
  it; if not, keep the seam compatible with its plan.
- #349 (extensions pane refinements) restyles the plugins list this module
  must appear in.

## Invariants in scope (candidates at dispatch)

- Module/plugin contracts from #326's work; terminal + agent pane records
  in their modules' *.invariants.md if present.
