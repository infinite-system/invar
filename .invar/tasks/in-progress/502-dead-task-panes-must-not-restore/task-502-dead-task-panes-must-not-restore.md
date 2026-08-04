# Task 502 — dead task panes must not restore

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## In plain words

After #501, saved task-kind panes (task:<root>:N, labeled Claude or
Terminal) restore INTO the Terminal space instead of minting spaces —
but they still restore, as tabs, even though their tasks died long
ago. The user sees stale Claude and Terminal tabs on every boot. A
task-kind pane must restore only if its task still exists; dead ones
are dropped, and the healed layout saves.

## Driven evidence (conductor, 2026-08-03 ~23:50)

Byte-copy of the user's real settings into a scratch home, fixed
build: panelSpaceLabels=["Terminal","Database"] (heal works) but
panelContentLabels ends with ...,"Claude","Terminal" — the dead task
panes as tabs. The user reports seeing exactly these after rebuild +
relaunch.

## Open design question for the builder to answer in the report

What is the liveness test for a task-kind pane at restore time (the
task registry? the task configuration file? the encoded root:index)?
If a restored task pane CAN legitimately reattach to a live task,
keep that path; only provably-dead ones drop.

## Invariants in scope (candidates)

- Panel content order is one persisted sequence (ui.invariants.md)
- A persisted pane identity is never reissued (ui.invariants.md)
- A pane runtime owns its processes (ui.invariants.md)
