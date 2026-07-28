# `.invar/tasks/` — the task ledger

One folder per task. A task lives in exactly one state directory and is MOVED between them; it is never
copied, and a folder is never deleted (the repo rule is that things are parked, not removed).

```
.invar/tasks/todo/     not started
.invar/tasks/live/     dispatched, an agent is working
.invar/tasks/done/     landed on main
.invar/tasks/retired/  abandoned, declined, or superseded — kept with the reason
```

Folder name: `<number>-<descriptive-name>`, **three words minimum** in the name.
`dispatch.sh` refuses a shorter slug. `fold-flyweight` required opening the brief to learn what it
meant; `folded-editing-scale-invariance` does not. A folder name is read far more often than typed.

## Files

| File | Holds |
| --- | --- |
| `task.md` | the outline — what the task IS, its state, its resolution |
| `brief-N-<date>.md` | each brief sent to an agent, in send order |
| `report.md` | the agent's READY report, verbatim |
| `summary.md` | what actually happened, written after landing |
| `meta.json` | branch, worktree, engine, base commit, timestamps |

**A follow-up brief is a NEW file, never an edit of the previous one.** Steering that overwrites its
predecessor destroys the record of what the agent was actually working from when it made a decision —
and on 2026-07-28 three rounds of steering on one task each changed the acceptance criteria, so the
final brief alone would have made the first two rounds' results unreadable.

**Transcripts are not stored here.** They are gitignored under `tmp/transcripts/`.

## Numbers

Permanent. A number is never reused, even for an abandoned task, because branches carry it
(`fleet/<n>-<slug>`) and branches are never deleted here — so a number must resolve forever.

**Create the task folder before dispatching**, so the number is backed rather than guessed. Violated
once: `fleet/205-flake-population` was labelled before its task existed and the tracker then assigned
205 elsewhere. Both records carry a note; the branch was not renamed.

## Where the other records live

`project.ledger.md` is the index and carries the full spec per open task. `project.conductor.md` holds
orchestration lessons, `project.decisions.md` settled design calls, `project.handoff.md` the resume
anchor. This directory holds the per-task detail those files point at.

## Provenance of the backfill

Folders created by `scripts/tasks/migrate-task-ledger.ts` on 2026-07-28 carry an explicit
RECONSTRUCTED marker in `task.md`. Those outlines were rebuilt from the session task list, which was the
only complete record at the time. Where a brief or report sits beside such an outline, THOSE are
primary. Where none does, the outline is a stub with an honest label rather than invented specificity —
`project.ledger.md` and the closing commit hold what detail exists.
