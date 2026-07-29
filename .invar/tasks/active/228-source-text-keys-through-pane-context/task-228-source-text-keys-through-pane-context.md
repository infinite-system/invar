# 228 — source-text keystrokes flow through the pane keybinding context

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: #219's named boundary 1. Keyboard ROUTING, deliberately kept out of the render retrofit. After #220 is a sensible slot; it is not a blocker for it.

## Outline

After #219, the source pane declares no keybinding context and `handleKey`
returns false; source-text keys are still owned by the command layer. Moving
them is a routing change with the exact shape of the #114 Wave B regression: a
hand-generalised dispatch branch silently dropping a scope filter.

Constraints from the record:
- Write the invariant for whatever implicit scope rule the current command-layer
  ownership enforces BEFORE moving any binding (the folder/comment/order/habit
  lesson, fourth verse).
- The instrument is `scripts/smoke-keyboard-invariant.sh` plus
  `smoke-reserved-chord-harness` — both went red on Wave B's version of this
  mistake and both must be driven green before and after.
- The editor is the hottest surface: the reserved set must still outrank it,
  and pass-through must still reach a focused terminal child untouched.

## Sources

- `report-219-...md` — "What I did not do", item 1.
- #114 Wave B v2 report — the scoped-binding regression and its fix.
