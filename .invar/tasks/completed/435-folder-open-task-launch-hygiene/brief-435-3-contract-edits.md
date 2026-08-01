# Brief 435-3 — contract edits confirmed; apply and commit

The conductor confirms your contract proposal as written in
[report section Contract proposal](report-435-folder-open-task-launch-hygiene.md):

1. Replace the first paragraph of `Folder open starts declared tasks`
   with your proposed wording, verbatim.
2. Update the mechanism clause of `File sources report displaced
   built-ins`: name the task notice pane; the notice remains
   discoverable without hiding the first task group.
3. Update `Unsupported tasks fail visibly`: normalization issues become
   task notice panes with label, severity, and message, and no process
   runtime.

Bump each record's `Last refined` to 2026-08-01. Run
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
after the edit; zero problems is the done condition. Commit with
`SKIP_GATE=1` (the conductor gates at landing). Reply READY with a
short report file named report-435-3-contract-edits (extension .md) naming the commit.

## Invariants in scope

The three records named above, in
[tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md).
This round EDITS them per the confirmed proposal; the code already
upholds the new wordings (your driven evidence).

## Bycatch expected

Report per the [AGENTS.md](../../../../AGENTS.md) taxonomy; carry a
`## Bycatch` section even when it reads `None observed`.
