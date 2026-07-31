# #388 — go to line and wrap line get keyboard shortcuts

State: COMPLETED — 59d28c7a — Alt+G/Alt+Z registered, discoverable, driven; hints follow effective bindings. Bycatch (welcome Ctrl+P mislabel) already owned by #354 — no new task.
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

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


## Scope shrunk after #346 landed (068a7375)

Both chords ALREADY exist and were driven green in the #346 round-6 drive:
Alt+G opens go-to-line (Ctrl+G belongs to the Git contribution; Alt+G
keeps the mnemonic — KeybindingDefaults.ts near line 405), Alt+Z toggles
word wrap (near line 715). Remaining work is DISCOVERABILITY only:

1. The wrap and go-to-line buttons on the panel row show the chord in
   their tooltip/hover text ("Go to Line (Alt+G)" pattern).
2. Any keybindings help/settings surface lists both truthfully.
3. Driven assertion for the tooltip text.
