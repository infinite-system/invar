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
| `task-<number>-<name>.md` | the outline — what the task IS, its state, its resolution |
| `brief-<number>-<count>-<name>.md` | each brief sent to an agent; `count` is the send order |
| `report-<number>-<name>.md` | the agent's READY report, verbatim |
| `summary-<number>-<name>.md` | what actually happened, written after landing |
| `meta.json` | branch, worktree, engine, base commit, timestamps |

**The task NUMBER leads every filename, before the round count.** A folder holding several rounds then
sorts task-first rather than round-first, and a filename pasted into a message identifies its task
without needing the directory it came from.

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

## What each task actually has

Every `task-*.md` ends with a **Sources** section stating plainly what exists: the briefs and reports in
its own folder, or `None. Only the subject line above survives.` There is no hedged middle — a reader
either has the primary source or knows there is not one.

The backfill placed archive documents ONLY where the document names its own task number in its header.
Fuzzy slug matching was tried and rejected: it proposed `panel-chrome-flake` for #164 and
`quiet-lock-validity` for #183, while those documents declare #159 and #147 themselves. A wrong mapping
files real evidence under the wrong task, which is worse than leaving it where it is.

`agent-dispatches/_archive-2026-07-27/` still holds 139 briefs and reports whose headers carry no task
number. They are not lost and not misfiled — they are unplaced, and placing one requires reading it.
