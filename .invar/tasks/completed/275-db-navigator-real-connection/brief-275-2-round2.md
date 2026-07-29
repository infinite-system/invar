# Brief — #275 round 2: absorb main, resolve your three conflicts

Main moved while you built: #274 landed (structure scrollbar/depth/filter
+ the TextInputKey distillation). Your branch conflicts in:

- src/modules/app/Bootstrap.ts
- src/modules/keybindings/KeybindingDefaults.ts
- src/modules/ui/PaneContent.interface.ts

Merge main into your branch and resolve as the author who knows both
intents (#274 added structure keybindings + the shared TextInputKey —
your database pane's bindings and pane registration must coexist).
Re-run the database smoke + manifest smoke after the merge; commit the
merge (the enforcing pre-commit gate must pass — do not SKIP_GATE the
merge commit). Update your report's Verification with the merge commit
sha and the post-merge smoke exits.

If the machine shuts down before you finish: your current commit
cec0e374 is the recovery point; this brief re-fires on resume.

## Invariants in scope

- Round 1's set; #274's structure/keybinding records (absorb, do not
  undo).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.
