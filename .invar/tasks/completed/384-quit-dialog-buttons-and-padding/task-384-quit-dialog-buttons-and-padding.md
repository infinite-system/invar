# #384 — quit dialog: bracketless buttons and breathing room

State: COMPLETED — e6ed1b0f — quit dialog: bracketless padded buttons with theme affordances
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30 ~08:3x, verbatim intent)

The quit confirmation ("Are you sure you want to quit"):
1. The buttons render as [ Yes ] [ No ] — REMOVE the square brackets.
   Buttons read as buttons via highlight/background, not bracket
   punctuation (the extensions-pane knob direction from #349: controls
   look pressable without ASCII decoration).
2. Padding: the dialog text needs left/right padding on all lines (or
   the whole dialog gains inner left/right padding), and likely bottom
   padding too — it currently sits tight against the dialog edges.

Context quote worth keeping: "our app looks like real vscode in terminal
lmao, doesn't look like terminal app at all" — the direction is LESS
terminal-ASCII decoration, more real-UI affordances.

## The shape

- Find the dialog painter (overlay/dialog family — smoke-overlay-dialog
  covers it). Buttons: background/highlight affordance for focus and
  hover, no brackets; keyboard focus ring stays visible in both themes
  and glyph tiers (ASCII tier may need SOME marker — decide and state,
  since color alone may not survive a mono tier).
- Inner padding: one cell left/right minimum on every text line, one row
  bottom; keep the dialog compact (no oversizing — density matters, see
  #346's direction).
- Check OTHER dialogs sharing the painter — apply the same style once at
  the generator, not per-dialog (confirm dialogs, the #341 drop-confirm
  when it lands).
- Update overlay-dialog smoke assertions that match the old [ Yes ]
  text; drive both themes.

## Invariants in scope (candidates)

- Overlay dialog records (ui.invariants.md: dialogs stay inside the
  terminal; bounded popups geometry). Button affordance may deserve a
  line in the record if it is a rule ("dialog controls carry background
  affordance, not bracket decoration").
