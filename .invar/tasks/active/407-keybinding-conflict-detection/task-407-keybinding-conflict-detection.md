# #407 — keybinding registry accepts silent chord collisions

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #402 bycatch 6 (lived experience)

Registering Ctrl+Shift+M twice (already the agent terminal-follow cycle,
KeybindingDefaults.ts:692) was silently accepted; the gate surfaced it
as two UNRELATED red smokes ("you broke the agent pane") instead of
"your chord is taken". Add duplicate detection in the keybindings
registry: same chord + same context = a loud registration error naming
both actions; a unit test enumerating the default table for duplicates
(the census arm); and a negative test proving the error fires. This is
also the conflict-check surface #388 (shortcut discoverability) wants.
