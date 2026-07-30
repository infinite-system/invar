# #349 — extensions pane: toggle knobs, icons, hover, tighter layout, detail view

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The request (user, 2026-07-30, verbatim intent)

1. No doubled titles: the pane must not render "Database" then "Database"
   again on the next line (same for "Extensions Extensions"). One title at
   the top is enough.
2. Hovering a plugin list item highlights its background (theme hover
   token). The hover highlight REPLACES the current selection arrow — no
   arrow glyph.
3. Each plugin row gets an on/off KNOB: a switch built from block glyphs
   that looks pressable (like a physical toggle), replacing the current
   [X] checkbox. Click toggles. No "Space/Enter to toggle" instruction
   text anywhere — the affordance is the look.
4. Each plugin row gets an ICON on its left.
5. Less padding all around the pane.
6. Under each plugin name: a one-line description, ellipsed to the pane
   width.
7. Pressing (clicking) a list item opens a DETAIL view with the full
   description: either an .md file rendered in preview mode or a dedicated
   plugin-description pane (builder proposes which — "keep it simple,
   expand later"; differentiate it visibly from a normal file preview if
   the pane route is chosen).

## Boundaries

- ASCII glyph tier needs fallbacks for knob and icons.
- Hover/hit-testing through the shared geometry model; one handler path.
- Toggling off a plugin follows the existing plugin enable/disable seam
  (ExtensionsPlugin) — no new disable mechanism.
- Drive it: hover highlight span, knob click toggles state, detail view
  opens on item press, doubled-title absence asserted.
