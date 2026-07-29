# 296 — terminals double on workspace open; design: each workspace owns its terminal world

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 ~16:5x, verbatim)

## Outline

User, verbatim: "when opening another workspace the terminals double in
the bottom pane, but i was thinking maybe the terminals for each
workspace are in a separate parallel reality, meaning workspaces
terminals do not overlap, they are separate worlds."

Two components, the second is the DESIGN INTENT:

1. **Bug**: opening another workspace doubles the terminals in the
   bottom pane — the new workspace's terminal set joins the old
   instead of replacing the view.
2. **Design (user-ratified direction)**: terminals are PER-WORKSPACE
   worlds. Each workspace owns its terminal set (and by the same law,
   its agent panes — coordinate with the capsule-lite notes; capsule
   proper remains HELD). Switching workspaces switches the visible
   terminal world; the other world's terminals keep running unseen and
   return intact on switch-back. No overlap, no doubling.

Both polarities: workspace A's terminals never appear in B; switching
A->B->A restores A's exact set (running processes intact, scrollback
preserved); closing a workspace disposes ONLY its world (define the
disposal semantics — likely keep-running until app exit or explicit
close; state the decision from the workspace/plugin lifetime records).

Coordinate with #294 (per-workspace language wiring) — same
per-workspace generator family, different seams; do not couple the
fixes.

## Invariants in scope

- The terminal records; PanelHost/pane-citizen records; workspace
  records (WorkspaceSet); plugin lifetime records; capsule-lite note in
  the conductor briefing (context only, capsule HELD).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~16:5x (verbatim above).
