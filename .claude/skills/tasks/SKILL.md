---
name: tasks
description: >-
  Operate the durable task system: one folder per task under .invar/tasks/, moved between
  todo/live/done/retired and never deleted. Use when filing, dispatching, steering, landing,
  retiring, or auditing tasks — each lifecycle step is a command, every file is named
  number-first, and the tracker (scripts/tasks/tasks-status.ts) reports drift with a
  self-test. Built for the Invar repo and reusable by any repo that adopts the layout.
---

# Tasks — the task-system protocol

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

## Counting the task system

```
bun scripts/tasks/tasks-status.ts             # counts + drift signals
bun scripts/tasks/tasks-status.ts --self-test # positive control
```

It counts each state and reports four drift signals, strongest first: **REPORT-IN-OPEN** (a delivered
report sitting in `todo`/`live`), **STATE-MISMATCH** (the file's `State:` line disagrees with its
directory), **DONE-NO-EVIDENCE** (done with neither a report nor a commit in its `State:` line), and
**THIN** (a task filed without its reasoning).

It reports; it never moves anything. Deciding a task is finished is a judgement, and these are evidence
for it.

**Run `--self-test` before trusting a clean run.** It builds a throwaway task tree with one planted
instance of each signal plus a clean control, and requires all four to fire and the control to stay
silent. A checker whose only possible output is "clean" is indistinguishable from a healthy repo.

**One standing finding is expected**: #114 holds a report because Wave A landed (`d5ba738`) while
Wave B is open. The signal is correct — the report IS delivered work — and it is left firing rather
than suppressed. If standing findings ever outnumber real ones, the signal needs refining, not muting.

## Numbers

Permanent. A number is never reused, even for an abandoned task, because branches carry it
(`fleet/<n>-<slug>`) and branches are never deleted here — so a number must resolve forever.

**Create the task folder before dispatching**, so the number is backed rather than guessed. Violated
once: `fleet/205-flake-population` was labelled before its task existed and the tracker then assigned
205 elsewhere. Both records carry a note; the branch was not renamed.

## Where the other records live

`project.active-tasks.md` is the GENERATED backlog view. `project.conductor.md` holds
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

## The lifecycle — every task walks these steps, and each step is a command

**1. FILE** — the moment work is identified (user request, bycatch, your own finding):

```
mkdir -p .invar/tasks/todo/<number>-<three-word-minimum-slug>
$EDITOR  .invar/tasks/todo/<n>-<slug>/task-<n>-<slug>.md
```

The task file holds THE TASK and nothing else: heading `# <n> — <subject>`, then
`State: TODO` / `Created:` / `Engine:` / `Environment:` / `Model:` / `Effort:` / `Priority:`
(user-directed | verification-integrity | flake-evidence | performance-behaviour |
architecture-hygiene) (+ `Assignment note:`
when the assignment needs explaining), then `## Outline` with mechanism, evidence, refutations, and
`## Sources`. Pick the next number ABOVE the tracker's `highest task number` — never reuse, never
guess at dispatch time.

**2. DISPATCH** — when a builder starts:

```
DRY_RUN=1 scripts/fleet/dispatch.sh <n> <slug> <brief-file> [engine]   # guards only, no side effect
          scripts/fleet/dispatch.sh <n> <slug> <brief-file> [engine]   # the real launch
```

`dispatch.sh` moves the folder to `live/`, writes `brief-<n>-1-<slug>.md` and `meta.json`, commits the
brief BEFORE launching (a record that needs a second step eventually does not happen), cuts the
worktree, runs `bun install`, and pipes the transcript to
`tmp/transcripts/transcript-<engine>-<model>-<effort>-<n>-<slug>.md`. It refuses an engine or
environment that contradicts the task file.

**3. STEER** — every follow-up instruction to a running builder is a NEW file, next count up:

```
$EDITOR .invar/tasks/live/<n>-<slug>/brief-<n>-2-<slug>.md   # then send it; a brief is read at LAUNCH
```

**4. DELIVER** — when the builder reports READY, copy the report verbatim into the folder:

```
cp /tmp/<n>-*-READY.md .invar/tasks/live/<n>-<slug>/report-<n>-<slug>.md
```

Read its `## Bycatch` section NOW and convert each item to a new task (step 1) before merging.

**5. LAND** — gate green, merge, then move the record in the SAME action as the merge:

```
git mv .invar/tasks/live/<n>-<slug> .invar/tasks/done/
sed -i '0,/^State: .*/s//State: DONE — <merge-commit-sha>/' .invar/tasks/done/<n>-<slug>/task-<n>-<slug>.md
git tag finished/<branch> <merge-sha>
$EDITOR .invar/tasks/done/<n>-<slug>/summary-<n>-<slug>.md   # what ACTUALLY happened, incl. refutations
```

The `State:` line MUST name the commit — a bare `DONE` is the tracker's DONE-NO-EVIDENCE signal, and
eight of those were created in one evening by writing the SHA into the body instead.

**6. RETIRE** — a task that will never be done (superseded, refuted, declined):

```
git mv .invar/tasks/todo/<n>-<slug> .invar/tasks/retired/
sed -i '0,/^State: .*/s//State: RETIRED — <why, or SUPERSEDED BY #m>/' .invar/tasks/retired/<n>-<slug>/task-<n>-<slug>.md
git tag -a retired/<branch> -m '<why>' # only if a branch with unique commits exists
```

**7. AUDIT** — every reconciliation sweep, and before claiming the backlog state to the user:

```
bun scripts/tasks/tasks-status.ts              # counts + drift
bun scripts/tasks/tasks-status.ts backlog      # the active backlog, grouped by Priority
bun scripts/tasks/tasks-status.ts write-active # regenerate project.active-tasks.md
```

`project.active-tasks.md` is GENERATED — the at-a-glance root view derived from each task file's
`Priority:` field. Never edit it by hand; a hand-maintained backlog needs a second edit per task,
and a record that needs a second step eventually does not happen. `dispatch.sh` and step 5/6 moves
regenerate it.

Act on findings: REPORT-IN-OPEN → run step 5 or explain why not (a multi-wave task like #114
legitimately holds a report while later waves are open — leave the signal firing rather than mute a
true positive); STATE-MISMATCH → one side is stale, find which from git; DONE-NO-EVIDENCE → resolve
the commit from `git log` and write it into the State line; THIN → the task was filed without its
reasoning, recover it or mark the stub honest.

**One task, one folder, forever.** `git mv` between states — never `cp`, never `rm`. A commit or
`SKIP_GATE=1` commit accompanies every move so the task system's history is the audit trail.
