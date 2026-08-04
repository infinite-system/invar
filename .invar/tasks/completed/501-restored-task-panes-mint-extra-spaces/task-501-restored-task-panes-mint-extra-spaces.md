# Task 501 — restored task-kind panes mint extra panel spaces

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: COMPLETED — faa06188 — restored task panes stay in their saved space; layouts self-heal

## In plain words

The user's real Invar shows extra "Claude" and "Terminal" tabs in the
panel tab row. Their saved settings hold panes with task-keyed kinds
(task:<root>:0 "Claude", task:<root>:1 "Terminal") that historically
lived INSIDE the Terminal space. #405 replaced the forced
kind-to-terminal fallback with a declaration map, so on restore each
undeclared task kind now mints its OWN space and tab. Restore must
keep undeclared or dynamic kinds in their persisted space; existing
settings should heal on next save.

## Driven evidence (2026-08-03, conductor)

- Fresh drive home: tab row "Terminal x ... + Plugin", Add menu shows
  Terminal | Database only — no extras.
- The user's ~/.config/invar/settings.json (READ ONLY — never write):
  panelWorkspaceStates for /home/parallels/dev/invar contains the two
  task-kind panes inside the terminal space AND two minted spaces
  "Claude" / "Terminal" keyed to the task kinds.
- Suspect: #405's contentSpaceKind replacement (landed eb4660f6..)
  interacting with saved panes; also check the #356 identity
  reservation path for restore ordering.

## Invariants in scope (candidates)

- Panel content order is one persisted sequence (ui.invariants.md)
- A persisted pane identity is never reissued (ui.invariants.md)
- An emptied space survives its last instance (ui.invariants.md)

## Note

HOLD dispatch: the user is reporting more bugs; batch by surface per
the ui-task skill.
