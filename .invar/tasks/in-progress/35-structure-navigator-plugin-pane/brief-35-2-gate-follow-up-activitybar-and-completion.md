# Brief — #35 round 2: two gate reds, bisect-confirmed, both yours to resolve

(Record of the conductor steers sent 04:0x via tmux; this file is the durable
copy. The batch gate on main+#233+#35 exited 1.)

## Red 1 — activitybar smoke, yours alone, deterministic

`smoke-activitybar-harness` times out on "Alt+Up moves the active Extensions
item through the activity order". Bisect: green on plain main, green on
main+#233, red on main+#35 alone. Your ninth DefaultPlugins contributor
shifts the dock order the smoke walks. Reproduce in your worktree:
`bun scripts/harness/smoke-activitybar-harness.ts`. The fix direction is your
judgment: the smoke may assert positions that should derive from the
manifest, or your insertion point may be wrong against the stated design
(structure before Extensions).

## Red 2 — completion smoke, the INTERACTION

`smoke-completion-harness` (first arm, mock Rust provider) times out on
`status.ready === true` — the app never finishes boot. Green on main, on
main+#233, and on main+#35; deterministically red solo-run on the combined
tree. Suspect: your boot-time LSP changes (LspWorkspaceProvider registers on
construction; LanguageCapabilities edits) under #233's fully isolated
HOME/XDG app environment (scripts/tui-harness.sh passes the complete set and
pins geometry). Reproduce: scratch branch off yours,
`git merge fleet/233-wrap-contract-red-settings-leak`, then run the smoke.
The fix belongs on YOUR branch (app side) unless you prove the harness env
wrong — then say so with evidence and the conductor routes it to #233.

## Also

Run `bun scripts/behavioral-contracts.sh` once on the scratch merge — its
plugin-manifest arm also red in the gate ("installed provider starts and
publishes diagnostics" timeout) and may share a generator with either red.

## Invariants in scope

Same set as round 1 (your branch's records), plus: the activity-order rule —
find whether any record states the dock order; if none does, that gap is
bycatch.

## Bycatch expected

Per AGENTS.md's taxonomy. The follow-up report carries `## Bycatch` even if
it reads `None observed`.

## Verification

Both smokes green in your worktree AND on the scratch merge with #233.
Behavioral-contracts arm outcome quoted either way. Update your READY report
in place with a `## Gate follow-up` section. Do not run merge-gate.
