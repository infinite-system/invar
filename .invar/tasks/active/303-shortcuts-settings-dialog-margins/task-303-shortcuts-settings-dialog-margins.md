# 303 — shortcuts + settings dialogs: breathe from the canvas edges, narrow to their content

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: USER-DIRECTED (2026-07-29 ~17:3x, verbatim)

## Outline

User, verbatim: "shortcuts and settings dialogs, should have more
margine from top/bottom so the window appear smaller than the total
canvas also can me less wide, cause content is not so wide"

Two arms at the dialog layout seam:

1. **Vertical margin**: the shortcuts (keybindings) and settings
   dialogs get more top/bottom margin so the window reads as a window
   over the canvas, not a full-height sheet.
2. **Width**: both dialogs narrow toward their content width — the
   content is not wide; the dialog should not be either. Derive the
   width from content (longest row class + padding) with a sensible
   max, rather than a canvas fraction, if the layout seam allows.

Check the shared overlay/dialog layout generator first: if both
dialogs (and others — palette, quick open) derive size from one place,
add the margin/width policy THERE with per-dialog parameters; two
point fixes only if no shared seam exists (then report that). Driven:
dialog rect vs canvas rect asserts (top/bottom gap >= chosen margin;
width <= content-derived bound) at two terminal geometries; scrolling
inside still works at the smaller height; both themes.

Both polarities: small terminals degrade gracefully (margin yields
before content clips — state the rule).

## Invariants in scope

- The overlay/dialog records; the settings + keybindings dialog
  records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:3x (verbatim above).
