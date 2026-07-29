---
name: manage-tasks
description: >-
  Operate the durable task system: one folder per task under .invar/tasks/, moved between
  active/in-progress/completed/retired and never deleted. Use when filing, dispatching, steering,
  landing, retiring, or auditing tasks. Each lifecycle step is a command. Every file is named
  number-first. The tracker (scripts/tasks/tasks-status.ts) reports drift and has a self-test.
  Built for the Invar repo and reusable by any repo that adopts the layout.
---

# Tasks — the task-system protocol

One folder per task. A task lives in exactly one state directory. Move it between states.
Never copy it. Never delete it. The repo rule is: park things, do not remove them.

```
.invar/tasks/active/       actionable, not yet dispatched
.invar/tasks/in-progress/  dispatched — an agent works on it
.invar/tasks/completed/    landed on main
.invar/tasks/retired/      abandoned, declined, or superseded — kept with the reason
```

Folder name: `<number>-<descriptive-name>`, three words minimum. `dispatch.sh` refuses a
shorter slug. `fold-flyweight` forced a reader to open the brief. `folded-editing-scale-invariance`
did not. A folder name is read far more often than it is typed.

Write all task prose in plain language. Follow `.claude/skills/ste-expression/SKILL.md`,
flavored mode. This applies to task files, briefs, reports, and summaries. Keep exact paths,
counts, and hashes. Lint a brief before dispatch:
`python3 .claude/skills/ste-expression/scripts/ste-lint.py <brief-file>`.
Write every document reference as a Markdown link. Make the destination relative to the file
that contains it. Before dispatch or steering, run
`bun scripts/tasks/lint-task-links.ts <brief-file>`. If the draft is outside its task folder,
add `--base-directory <task-folder>`. Before READY, run
`bun scripts/tasks/lint-task-links.ts <report-file>` and fix every finding.

## Files

| File | Holds |
| --- | --- |
| `task-<number>-<name>.md` | the outline: what the task is, its state, its resolution |
| `brief-<number>-<count>-<name>.md` | each brief sent to an agent; `count` is the send order |
| `report-<number>-<name>.md` | the agent's READY report, verbatim |
| `summary-<number>-<name>.md` | what actually happened, written after landing |
| `meta.json` | branch, worktree, engine, base commit, timestamps |

The task number leads every filename, before the round count. A folder with several rounds
then sorts task-first. A filename pasted into a message names its own task.

A follow-up brief is a new file. Never edit the previous one. An edit destroys the record of
what the agent worked from when it made a decision. On 2026-07-28 three steering rounds on
one task each changed the acceptance criteria. The final brief alone would have made the
first two rounds unreadable.

Transcripts are not stored here. They are gitignored under `tmp/transcripts/`.

**The task folder is the builder's durable workspace.** A builder that authors
a one-off census, a proposed checker, or an analysis document commits it into
its OWN task folder on its branch. It rides the merge home and outlives the
worktree. Tooling written to `/tmp` dies; tooling written to the task folder
is part of the record (#222 is the founding example).

## Counting the task system

```
bun scripts/tasks/tasks-status.ts             # counts + drift signals
bun scripts/tasks/tasks-status.ts --self-test # positive control
bun run tasks:live                            # in-progress + attach commands
bun run tasks:active                          # backlog by priority
bun run tasks:done                            # completion log, latest first
```

The command reference for humans is `project.tasks.md` in the repo root.

The tracker counts each state and reports five drift signals, strongest first:

- **REPORT-IN-OPEN** — a delivered report sits in `active/` or `in-progress/`.
- **STATE-MISMATCH** — the file's `State:` line disagrees with its directory.
- **DONE-NO-EVIDENCE** — completed with neither a report nor a commit in its `State:` line.
- **THIN** — a task filed without its reasoning.
- **STALE-ACTIVE-VIEW** — a generated view file differs from what regeneration would write.

The tracker reports. It never moves anything. Deciding a task is finished is a judgement.
These signals are evidence for that judgement.

Run `--self-test` before you trust a clean run. It builds a throwaway task tree with one
planted instance of each signal plus a clean control. All signals must fire. The control must
stay silent. A checker whose only possible output is "clean" looks identical to a healthy repo.

A standing finding is allowed when it is true. Example: a multi-wave task holds a report while
a later wave is open. Leave a true signal firing. If standing findings ever outnumber real
ones, refine the signal. Do not mute it.

## Numbers

Numbers are permanent. Never reuse one, even for an abandoned task. Branches carry the number
(`fleet/<n>-<slug>`) and branches are never deleted here. A number must resolve forever.

Create the task folder before you dispatch. Then the number is backed, not guessed. This was
violated once: `fleet/205-flake-population` got its label before its task existed, and the
tracker assigned 205 elsewhere. Both records carry a note. The branch kept its name.

## Where the other records live

`project.active-tasks.md` is the generated backlog view. `project.conductor.md` holds
orchestration lessons. `project.decisions.md` holds settled design calls. `project.handoff.md`
is the resume anchor. This directory holds the per-task detail those files point at.

## What each task actually has

Every `task-*.md` ends with a **Sources** section. It states plainly what exists: the briefs
and reports in its own folder, or `None. Only the subject line above survives.` There is no
hedged middle. A reader either has the primary source or knows there is none.

The backfill placed archive documents only where the document names its own task number.
Fuzzy slug matching was tried and rejected. It proposed wrong homes for two documents that
declared different numbers themselves. A wrong mapping files real evidence under the wrong
task. That is worse than leaving it unplaced.

`agent-dispatches/_archive-2026-07-27/` still holds 139 briefs and reports with no task number
in their headers. They are not lost. They are unplaced, and placing one requires reading it.

## The lifecycle — seven steps, each one a command

**1. FILE** — the moment work is identified (user request, bycatch, your own finding):

```
mkdir -p .invar/tasks/active/<number>-<three-word-minimum-slug>
$EDITOR  .invar/tasks/active/<n>-<slug>/task-<n>-<slug>.md
```

The task file holds the task and nothing else. Heading: `# <n> — <subject>`. Then
`State: ACTIVE`, `Created:`, `Engine:`, `Environment:`, `Model:`, `Effort:`, `Priority:`
(user-directed | verification-integrity | flake-evidence | performance-behaviour |
architecture-hygiene). Add `Assignment note:` when the assignment needs a reason. Then
`## Outline` with mechanism, evidence, and refutations. Then `## Sources`. Pick the next
number above the tracker's `highest task number`.

**2. DISPATCH** — when a builder starts:

```
DRY_RUN=1 scripts/fleet/dispatch.sh <n> <slug> <brief-file> [engine]   # guards only, no side effect
          scripts/fleet/dispatch.sh <n> <slug> <brief-file> [engine]   # the real launch
```

`dispatch.sh` moves the folder to `in-progress/`, writes `brief-<n>-1-<slug>.md` and
`meta.json`, regenerates the views, and commits the whole record before it launches anything.
The record commit always lands on main, even when another branch is checked out. It cuts the
worktree, runs `bun install`, and pipes the transcript to
`tmp/transcripts/transcript-<engine>-<model>-<effort>-<n>-<slug>.md`. It refuses an engine or
environment that contradicts the task file. It prints the tmux attach command. Relay that
command to the user.

**3. STEER** — every follow-up round is a MECHANICAL act, filed before the steer:

```
$EDITOR /tmp/brief-<n>-round2.md                                # write it (both dialogue sections required)
scripts/fleet/round-brief.sh <n>-<slug> /tmp/brief-<n>-round2.md   # file + stamp, THEN steer
```

`round-brief.sh` copies the brief in as `brief-<n>-<round>-…md` and stamps
`meta.json` (`round`, `roundBriefedAtMs`) at the filing moment. **A brief is a
contract: every briefing act declares a mechanically checkable end state.**
Round 1's end state is "a report file exists" (dispatch enforces it); round
N's is "the report is newer than the filing stamp" — the lenses key READY on
exactly that, so a backfilled brief can never demote a delivered report, and
a live round always shows `building round N`. A steer that lives only in a
tmux message is a record nobody can replay: file first, steer second.

**4. DELIVER** — the report is born in the task folder. `dispatch.sh` points the builder at
`.invar/tasks/in-progress/<n>-<slug>/report-<n>-<slug>.md` (absolute path), so delivery
normally needs no copy. Verify the file is there. If the builder used the /tmp fallback
(it says so in the report), copy it in:

```
cp /tmp/<n>-*-READY.md .invar/tasks/in-progress/<n>-<slug>/report-<n>-<slug>.md
```

Read its `## Bycatch` section now. Convert each item to a new task (step 1) before you merge.
A follow-up round's report is a NEW numbered file, like a follow-up brief.

**5. LAND** — gate green, merge, then move the record in the same action as the merge:

```
bash scripts/fleet/land.sh <n> <slug> <merge-message-file> "<one-line summary>"
sed -i '0,/^State: .*/s//State: COMPLETED — <merge-commit-sha>/' .invar/tasks/completed/<n>-<slug>/task-<n>-<slug>.md
git tag finished/<branch> <merge-sha>
bash scripts/fleet/archive-session.sh <n>-<slug>             # native session file -> tmp/native-sessions/
$EDITOR .invar/tasks/completed/<n>-<slug>/summary-<n>-<slug>.md   # what ACTUALLY happened, incl. refutations
bun scripts/tasks/tasks-status.ts write-active               # the landed task leaves the active view
```

The archive step copies the engine's own structured record (full tool inputs and
outputs) into the repo, because upstream retention is not ours to trust. The link
was written at dispatch: `tmp/transcripts/session-link-<n>-<slug>.txt`.

The `State:` line must name the commit. A bare `COMPLETED` fires DONE-NO-EVIDENCE. Eight of
those appeared in one evening because the sha went into the body instead of the State line.

**6. RETIRE** — a task that will never be done (superseded, refuted, declined):

```
git mv .invar/tasks/active/<n>-<slug> .invar/tasks/retired/
sed -i '0,/^State: .*/s//State: RETIRED — <why, or SUPERSEDED BY #m>/' .invar/tasks/retired/<n>-<slug>/task-<n>-<slug>.md
git tag -a retired/<branch> -m '<why>' # only if a branch with unique commits exists
bun scripts/tasks/tasks-status.ts write-active  # the retired task leaves the active view
```

**7. AUDIT** — every reconciliation sweep, and before you claim the backlog state to the user:

```
bun scripts/tasks/tasks-status.ts              # counts + drift
bun scripts/tasks/tasks-status.ts backlog      # the active backlog, grouped by Priority
bun scripts/tasks/tasks-status.ts write-active # regenerate the views
```

Three sibling files, one owner each, named to sit together in a file viewer:

- `project.active-tasks.md` — GENERATED. In-progress first (latest first), then active grouped
  by `Priority:` (latest first within each group), then the last 15 completed. Never hand-edit
  it. `dispatch.sh` and the step 5/6 moves regenerate it. A hand edit is destroyed on the next
  regeneration and reads as STALE-ACTIVE-VIEW until then.
- `project.tasks-completed.md` — GENERATED. Every completed task ever, latest first, each with
  its landing commit. Derivable forever, because completed folders are never deleted.
- `project.active-priority-tasks.md` — HAND-WRITTEN. The priority log: dated reasons for the
  current ordering, re-prioritisation decisions, holds. No tooling reads or writes it.

Act on findings. REPORT-IN-OPEN: run step 5, or state why not. STATE-MISMATCH: one side is
stale, find which from git. DONE-NO-EVIDENCE: resolve the commit from `git log` and write it
into the State line. THIN: recover the reasoning, or mark the stub honest.
STALE-ACTIVE-VIEW: run `write-active`, then find what skipped it.

One task, one folder, forever. `git mv` between states. Never `cp`, never `rm`. A commit
accompanies every move, so the task system's history is the audit trail.
