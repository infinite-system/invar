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

## Conductor analysis (2026-07-30, answers "extracted or not listed?")

BOTH module and gap confirmed. src/modules/agent/ IS a fully extracted
module (own AgentBackend interface, provider registry, agent.invariants.md
contract; terminal imports nothing from agent). But NO AgentPlugin exists:
src/modules/plugins/DefaultPlugins.ts registers TerminalPlugin,
DatabaseProviderPlugin/DatabaseConsumerPlugin, ExtensionsPlugin, etc. —
no agent entry. Instead the agent pane is HARD-WIRED into the app shell:
src/modules/app/Bootstrap.ts and src/modules/ui/RootView.ts reference
AgentPaneContent/AgentFactory directly (also narration/TtsFactory,
app/AppStatusProjection, theme/ThemeIcons).

So the work is: wrap the existing module in an AgentPlugin
ApplicationContributor, move the Bootstrap/RootView wiring into it,
register it in DefaultPlugins, and let the extensions section's existing
knob mechanics govern it. The database plugin pair (provider/consumer) is
the in-repo model to follow. This also makes the Database-pane parity the
user named automatic: same registry, same knob.

## Naming decision (user, 2026-07-30)

The agent is named "Invar Agent". It can use claude or codex underneath,
but it is OUR wrapper around them, not claude directly — named so we can
layer custom behaviors on it. UI labels, plugin registry entry, and docs
say "Invar Agent"; the backend provider (claude/codex) is a detail inside
it. Apply the name as part of the plugin extraction.

## Evidence from #487 (2026-08-03) — the special-casing is now a recorded contract disagreement

The #487 builder confirmed by inspection: Bootstrap.ts branches on
`AgentPaneContent.Class` and `agent.*` action prefixes BEFORE the
generic PaneContent route. This disagrees with two records:
ui.invariants.md (the panel host must not name a pane class or action
prefix) and agent.invariants.md (the agent pane is not a special
case). This task is where that disagreement gets repaired. Also
inherit: #488's coupling census will enumerate the full site list.
