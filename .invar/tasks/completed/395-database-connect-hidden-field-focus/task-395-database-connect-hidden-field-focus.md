# #395 — Database Connect can focus a hidden path input

State: COMPLETED — 300b5bff — Already-fixed by #404; builder honestly declined to fabricate and ratcheted the repair into contracts instead. Bycatch: hook-vs-brief conflict (known, no task); one unreferenced ui.lattice record noted pre-existing.
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Origin — #346 bycatch, reproduced three times (user-visible)

After a failed connection, the command Database: Connect can make the
Database path input the active editable while ANOTHER content space is
visible. Keystrokes then edit nothing the user can see. The #346 drive
works around it by selecting the Database tab before editing.

## Task

Reproduce per the recipe above, then fix at the focus/visibility seam: a
command that activates an input must also reveal its content space (or the
focus request must route through the pane host's reveal path). Contract:
after Database: Connect, the focused input's space IS the visible space —
count-based, driven.
