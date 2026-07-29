# 167 — audio-narration still times out in the parallel pool

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

`audio-narration` times out in the parallel pool **after #141 closed it** — so this is a recurrence of a
smoke already declared fixed, not a new sighting. `move-line` shows the same signature.

### Its origin — a batch nobody was looking for

Converted into the #161–#167 batch during a sweep. Worth stating what that batch contained, because it
is the argument for the sweep itself:

> Three were **user-visible defects**: Quick Open opening [project.tasks.md](../../../../project.tasks.md) while publishing and
> rendering [TASK.md](../../../../TASK.md); the Files pane blank at settled boot with `treeRows=50` published; the Settings
> selection moving below the painted viewport at 80×24. **A user would have hit all three, and none of
> them came from anyone looking for them.**

### Ownership

The investigation half may be **absorbed** by the shared-generator flake work if that finds one cause
behind the retry population — together with #164 (panel-chrome expand-heading) and #176 (tabs). Those
stay open until it reports rather than being closed on the expectation that it will.

A caution specific to this one: it was **closed once already** (#141, as a hard-red gate blocker) and
came back. A second close needs to survive more than the run that produced it.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
