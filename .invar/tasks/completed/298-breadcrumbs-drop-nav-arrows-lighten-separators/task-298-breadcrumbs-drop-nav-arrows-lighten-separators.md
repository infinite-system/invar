# 298 — breadcrumbs: drop prev/forward (workspace bar owns them); separators a bit lighter

State: COMPLETED — f3603a8f — breadcrumbs: drop nav arrows, theme-derived lighter separators
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: USER-DIRECTED (2026-07-29 ~17:0x, verbatim)

## Outline

User, verbatim: "the prev / forward should removed in the breadcrumbs
we already have it at the top workspace bar, arrows in breadcrumbs
color blends with background, should be a bit lighter."

Two arms:

1. **Remove prev/forward from the breadcrumbs row.** The top workspace
   bar already owns Back/Forward — one owner per affordance; the
   breadcrumb copies go away entirely (bindings and jump recording stay
   with the workspace-bar owner; verify nothing routed exclusively
   through the breadcrumb buttons — if something did, move it to the
   owner, don't keep the buttons).
2. **Lighten the breadcrumb separator arrows.** They currently blend
   with the background; pick the semantic slot a step lighter (per the
   theme vocabulary — a real slot, not a hex), BOTH themes, and assert
   the contrast (separator foreground != row background, and lighter
   than today's value) in the driven contract.

Both polarities: Back/Forward still fully works from the workspace bar
after removal; breadcrumb click-to-navigate segments unchanged.

## Invariants in scope

- The breadcrumbs records; the navigation/jump records; theme slot
  vocabulary records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:0x (verbatim above).
