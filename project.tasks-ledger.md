# project.tasks-ledger.md — the task ledger protocol (`.invar/tasks/`)

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

## Counting the ledger

```
bun scripts/tasks/ledger-status.ts             # counts + drift signals
bun scripts/tasks/ledger-status.ts --self-test # positive control
```

It counts each state and reports four drift signals, strongest first: **REPORT-IN-OPEN** (a delivered
report sitting in `todo`/`live`), **STATE-MISMATCH** (the file's `State:` line disagrees with its
directory), **DONE-NO-EVIDENCE** (done with neither a report nor a commit in its `State:` line), and
**THIN** (a task filed without its reasoning).

It reports; it never moves anything. Deciding a task is finished is a judgement, and these are evidence
for it.

**Run `--self-test` before trusting a clean run.** It builds a throwaway ledger with one planted
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

## The backlog, in priority order

The per-task detail lives in each folder; this is only the ORDERING, which folders cannot express.
Landed and retired tasks are not listed — `done/` and `retired/` are the list.

**OPEN — user-directed:** #202 (tab re-activation re-reads the file), #199 (Find reveal blank row at
500k), #205 (peak-RSS launch contract).

**OPEN — verification integrity (highest leverage):** #90 provenance guard · #177 retry ratchet
(needs 3–5 clean gates first) · #179 gate self-comparison · #183 quiet-lock decision · #180 macOS
gate (CRITICAL; claude on macos) · #181 platform-choice test · #182 collectUntil false-success ·
#105 unrun smokes · #190 pool membership · #75 in-gate exit-1 · #210 mutation probes.

**OPEN — known flakes with evidence:** #167 audio-narration · #164 panel-chrome ASCII tier · #176
tabs retry · #124 terminal-follow Escape (resolve its state discrepancy first) · #109
agent-permissions quiet-tail (dispatch condition: no other builder live) · #193 fold-dense 995 rows ·
#174 markdown ragged table · #173 wrapping-split predicates · #198 pre-satisfied wheels · #165
zero-margin canary · #166 one-sample crash · #200 input-byte p50.

**OPEN — performance and behaviour:** #175 boot attribution · #185 behavioral-contracts fixtures
(after #136) · #153 hover-card fling (user's feel call) · #86 85 ms wheel constant (user's feel
call) · #160 wheel double-dispatch · #94 popup Left/Right · #104 glide monotonicity (deferred) ·
#140 freeze capture (waiting on one user check) · #154 perf-baselines verdict.

**OPEN — architecture and hygiene:** #114 modularity umbrella (Wave B) → #122 editor capstone → #35
structure pane · #46 terminal observer (design with #157) · #31 getter census (hold for #110) · #62
ports-object sweep · #59 prettier (LAST by design) · #136 shared fixtures · #107/#108 are done.
