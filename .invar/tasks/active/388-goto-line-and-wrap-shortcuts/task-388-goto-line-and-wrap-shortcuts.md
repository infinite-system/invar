# #388 — go to line and wrap line get keyboard shortcuts

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30 ~09:1x)

1. Go to line "prolly should have a keyboard shortcut" — the icon exists
   in the status area; add the chord (convention: Ctrl+G is the editor
   standard — check the existing keybinding table for conflicts and the
   project's reserved-chord rules before choosing; state the choice).
2. Wrap line toggle gets a shortcut too (VS Code uses Alt+Z — same
   conflict check).

## Boundaries

- Register through the existing keybindings module (one registry, no
  parallel path); both appear in the keybindings help/settings surface
  and in tooltips ("Go to Line (Ctrl+G)" pattern) so the chords are
  discoverable.
- Welcome/help text stays truthful (#354's class — if any help surface
  lists shortcuts, update it in the same change).
- Smoke: drive both chords in the harness (extend the relevant existing
  smokes).
