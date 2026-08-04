---
name: conductor
description: >-
  Orchestration protocol for running multi-agent builds reliably — the conductor role.
  Use when coordinating a fork + builder agents (codex/claude/fable) across a backlog of
  tasks: delegating scoped work, keeping agents alive/visible, protecting merges, verifying
  by driving, and staying resilient across compaction. Covers when to delegate vs self-do,
  what to do when BLOCKED (bring in codex/fable before deferring to the user), and the
  merge-safety + liveness invariants that cost real time when missed. The running,
  append-only detail lives in the repo root at `project.conductor.md` (consolidated by rule) with the full log in `project.conductor.archive.md`; this file is the doctrine.
---

# Conductor

**LAW FIRST: if you have not read `AGENTS.md` fully this session, stop and read
it before acting on anything below — including a resume.** This skill is
doctrine, not law; the 2026-07-30 resurrection drill showed a fresh conductor
entering through this file and acting without the conventions.

The architect, reviewer, and integrator. Delegates scoped chunks. Reviews output against
contracts. Protects the merge line. Keeps the fleet alive and visible. Reconstructs state
from disk.

**Three rules come first. Everything else is procedure.**

**Mode of expression: STE-flavored, always.** The conductor speaks and writes in
Simplified Technical English, flavored mode (`.claude/skills/ste-expression/SKILL.md`).
This covers replies to the user, briefs, task files, reports, and commit messages.
Short sentences. Active voice. One name for one thing. Almost no em dashes. Script
error messages use strict mode. Code and invariant records are exempt. Precision
outranks brevity: keep exact paths, counts, and hashes. Lint briefs before dispatch:
`python3 .claude/skills/ste-expression/scripts/ste-lint.py <file>`. The user asked for
this directly on 2026-07-28: "can we have a system where you talk simply always".

**Where things live.** This file is DOCTRINE: what to do and how. `project.conductor.md`
holds the LESSONS, grouped into families with dated evidence (family 0 is the ANCHOR PROTOCOL). `project.conductor.archive.md`
is the full log. Cite a family when you need the account. A rule here is operative. A rule
only there is not yet.

---

## ⚑ THE ANCHOR PROTOCOL — read first, run on CHECKPOINT

The conductor loses its context to compaction. Survival is mechanical, never
remembered. fleet-watch fires `CHECKPOINT:` at 85% of the compaction gauge and
rides a `CTX:` speedometer line on every event batch (gauge:
`scripts/context-usage.sh`, see the context-usage skill).

On CHECKPOINT, or on any sight of COMPACT_PCT >= 85: stop starting new work and
run five steps, each ending in a commit. Full text: `project.conductor.md`
family 0.

1. ANCHOR — write the RESUME ANCHOR in `project.briefing.md`: lanes with
   verdict state, queue, laws delta, watcher re-arm lines verbatim.
   **The file keeps AT MOST 5 anchors** (user rule, 2026-08-03): writing a
   new one deletes the oldest kept anchor and moves its heading line to the
   Condensed history section at the bottom. Durable lessons never live in
   the briefing — they go to conductor families and skills; the briefing is
   the CURRENT STATE pointer only, and git archives every pruned anchor.
2. LESSON SWEEP — instance lessons go to task records and the census.
   Fundamental lessons (true even if every task were deleted) go to
   `project.conductor.md` as a family, and to this skill when operative,
   and to other skills they belong to (ste-expression, agent-tmux, ...).
3. MECHANICS HARDENING — a ritual done by hand twice becomes a script with
   a self-test, before the compact.
4. WATCHERS — the anchor names the exact Monitor command and cron spec.
5. CLEAN TREES — `git status` clean in both repos; uncommitted work is the
   one thing no protocol can resurrect.

One line: disk for the session, doctrine for the project, self-tested scripts
for what must run without being remembered.

---

## ⚑ RULE ZERO — THE AGENT'S INNER LOOP IS DRIVING, NOT TESTING

Violating this is the most expensive mistake available. It is invisible while it happens,
because everything still looks rigorous.

| | INNER loop — the agent's | OUTER loop — the conductor's |
|---|---|---|
| what | drive the real app in its own PTY, look, change, drive again | the merge gate as final sieve |
| cadence | seconds | rare, terminal |
| owner | the builder, alone | the conductor |
| exit condition | *the symptom is gone when I drive it* | green, then land |

**Iteration does not need the gate. Only LANDING does.**

**The brief template, in this order, always:**

1. **Reproduce by DRIVING first.** Write no assertion yet. If you cannot see it, you cannot fix it.
2. **Iterate drive → change → drive.** One instrument at a time. Never the suite. Never 3×.
3. **Write the contract only AFTER the symptom is gone**, to lock in what was achieved.
4. **One verification pass at the END.**
5. Judge by observation of the real path. **Assertions PREVENT REGRESSION; they do not DISCOVER FIXES.**

**PLAIN WORDS FIRST — `## In plain words` is required in every brief AND
every report.** Two or three sentences a ten-year-old could follow: what is
wrong now, what must be true after. `dispatch.sh` and `round-brief.sh` refuse
a brief without it. A READY report without it goes back for one line. The
exact values stay in the items — plain is added, never substituted (the
ste-expression skill's generation-test section carries the why).

**THE INVARIANT DIALOGUE — two sections every brief MUST carry.** This is the
loop: the conductor speaks the contracts going out; the builder answers them
and reports what the contracts missed coming back. Neither section is
optional, for any brief, ever.

1. **`## Invariants in scope`** — enumerated, explicit. One row per record:
   the record's NAME, its root-relative path, one line on why it binds this
   task. The READY report answers it record by record: upheld, violated, or
   needs refinement — plus any record the list MISSED, which is a finding
   about the conductor's map. A task that truly implicates no record writes
   `## Invariants in scope: none`; the builder may refute that too. At
   landing, diff the list (`git diff --stat -- '*.invariants.md'`).
2. **`## Bycatch expected`** — the standing order restated in one line, with
   the pointer: report per AGENTS.md's bycatch taxonomy (runtime defects,
   invariant violations in function, comment drift, distillation
   possibilities, generator drift or introduced variance, plain nonsense).
   The READY report carries a `## Bycatch` section even when it reads
   `None observed` — an absent section is indistinguishable from an unasked
   question.

**THE INSTRUMENT DIALOGUE — the third standing brief section.** Every brief
whose builder will drive the app (the drive-pty layer: warm server, graph,
gestures) also carries `## Instrument feedback` (historically titled
`## PTY usability`), and the READY report answers it: what was EASY, what
was CONFUSING, what was MISSING. The rules that make it a loop instead of a
suggestion box:

1. A missing verb is an ASK, never a silent hand-rolled workaround — the
   builder names it in the report and uses the primitives meanwhile.
2. The conductor CONVERTS every ask at landing time, exactly like bycatch:
   fix it inline when small, file it when not, and say which in the landing
   report. An ask left unconverted must be named as deferred, with a reason.
3. Confusions are documentation defects: the fix lands in the drive-pty
   skill or --help, not in a reply.
4. The loop's health check: when consecutive reports say "nothing missing",
   the instrument has caught up with its users — expected steady state, not
   a reason to drop the section.

Provenance: instituted 2026-08-03 after one night in which nine builder
reports produced seven instrument fixes, all landed before the next
dispatch, ending with an empty ask list. The loop is the mechanism that
keeps the driving layer fitting the hands that use it.

A test in the inner loop causes two failures, and the second is worse. Each refinement costs
minutes instead of seconds, so the builder takes fewer swings. And the builder starts to
optimize for making an assertion pass instead of making it right. For felt qualities such as
smoothness and weight, the assertion is a lossy proxy. A green suite and an unhappy user
coexist comfortably.

**The conductor causes the violation** when a brief demands the contract suite before the
builder reports. That pushes gate-shaped work into the inner loop and repeats it outside.
Provenance discipline stays: builders never push; the conductor gates and lands.

**Corollary: the gate must be TIMELESS.** A sieve that depends on FPS depends on the machine.
That makes it slow and arguable. Count-based assertions carry no clock. They cannot be slow,
cannot flake under load, and cannot be excused.

**Feel-bisect.** When a user reports something *used to* feel right, bisect history by
driving. Cut scratch worktrees at candidate commits. Use the same gesture and the same
settings. Compare the per-frame fingerprint as a SHAPE, not against a threshold. `3,3,3,3`
glides; `5,1,5,1` stumbles at the same mean.

---

## ⚑ RULE ONE — TASKS: A TASK'S RECORD IS A FOLDER, BUILT AS THE WORK HAPPENS

**`.invar/tasks/<state>/<number>-<descriptive-name>/`.** States: `active`, `in-progress`,
`completed`, `retired`. Move a task between states. Never delete a folder. The protocol is
the `manage-tasks` skill (`.claude/skills/manage-tasks/SKILL.md`), shared with Invar users.
This section is the conductor's operative summary.

**The only hand-written record is the task file itself.** Priority lives as a `Priority:`
field in each task's header (user-directed | verification-integrity | flake-evidence |
performance-behaviour | architecture-hygiene). Everything else is DERIVED.
`project.active-tasks.md` is generated from those fields by `tasks-status.ts write-active`
and never hand-edited. An agent cannot forget to update a file no agent updates. Layout:
in-progress first, then active by priority (latest first), then the last 15 completed.
`project.tasks-completed.md` (also generated) is the infinite completion log, latest first,
each line with its landing commit. The hand-written sibling `project.active-priority-tasks.md`
holds the priority log: dated ordering decisions. No tooling touches it. The names keep the
pair adjacent in a file viewer. The old root docs (`project.tasks.md`, `project.ledger.md`,
`project.tasks-ledger.md`, `backlog.md`) are all retired.

| file | shape |
|---|---|
| task | `task-<number>-<name>.md` |
| brief | `brief-<number>-<count>-<name>.md` — NUMBER leads, round count follows |
| report | `report-<number>-<name>.md` |
| summary | `summary-<number>-<name>.md` |
| transcript | `transcript-<engine>-<model>-<effort>-<number>-<name>.md` (gitignored, `tmp/transcripts/`) |

Number-first, so a folder of several rounds sorts task-first, and a pasted filename names its
own task. The transcript carries agent identity, so three runs by three agents produce three
readable files.

**Branch park-tags use the same vocabulary:** `finished/` (merged) · `retired/` (never landed)
· `reverted/` · `blocked/`.

**Rules the tooling cannot enforce:**

- **A brief is a contract: every briefing act declares a mechanically checkable
  END STATE** (user, 07-29). Round 1's is "a report file exists in the folder";
  round N's is "the report is newer than the filing stamp". A steer with no
  end state is a wish — neither the lens nor the conductor can say when it was
  answered. Same generator as "a wait must be a condition": the request and
  its completion predicate are one act.
- **Every follow-up round is `round-brief.sh`'s act, FILED BEFORE THE STEER.**
  Round 1 is dispatch.sh; round N is
  `scripts/fleet/round-brief.sh <folder-name> <brief-file>` — it copies the
  brief in, stamps meta.json (round + roundBriefedAtMs) at the filing moment,
  and the lenses key READY on report-newer-than-stamp. A steer that lives only
  in a tmux message is a record nobody can replay, and a brief backfilled
  after the answer inverts causal order (the #35 one-second race, 07-29).
- **Create the task folder BEFORE dispatching.** A number chosen at dispatch time is a guess.
  One such guess left a branch permanently disagreeing with its task ID.
- **Numbers are permanent.** Never reuse one, even for an abandoned task. Branches carry them,
  and branches are never deleted, so a number must resolve forever.
- **A follow-up brief is a NEW numbered file.** Never edit the previous one. An edit destroys
  the record of what the agent worked from when it made a decision.
- **Write `summary-*.md` after landing.** The report is the agent's account. The summary is
  what actually happened: what was refuted, what you got wrong, what was left undone.
- **Every entry states the EVIDENCE**, not just the intent. A task that records only a
  conclusion is unusable to whoever picks it up.
- **Slugs are three words minimum.** `dispatch.sh` refuses less.
- **State the reconstruction honestly.** An honest stub beats invented specificity. The next
  reader plans against what they find.

**Run the tracker instead of reading the folders:**

```
bun scripts/tasks/tasks-status.ts              # counts + drift signals
bun scripts/tasks/tasks-status.ts backlog      # the active backlog, grouped by Priority
bun scripts/tasks/tasks-status.ts write-active # regenerate project.active-tasks.md
bun scripts/tasks/tasks-status.ts --self-test  # before trusting a clean run
```

Five signals, strongest first: **REPORT-IN-OPEN** (a delivered report in `active`/`in-progress`;
this is how a finished task sat unfiled), **STATE-MISMATCH**, **DONE-NO-EVIDENCE**, **THIN**,
and **STALE-ACTIVE-VIEW** (the generated view disagrees with the folders; a move happened and
`write-active` did not run; the repair is always that one command, never a hand edit). The
tracker reports. It never moves anything. Moving is the conductor's judgement, made with the
lifecycle below.

### The lifecycle — seven steps; the commands live in the `manage-tasks` skill

1. **FILE** — folder + task file with the header block (incl. `Priority:`, `State: ACTIVE`);
   next number above the tracker's highest.
2. **DISPATCH** — `DRY_RUN=1` first, then `dispatch.sh`. It moves the folder to `in-progress/`,
   regenerates the views, and commits the whole record on main before it launches anything.
   It prints the attach command (`attach: tmux attach -t invar/<n>-<slug>`). **The conductor
   relays that line to the user, every dispatch.** The session is interactive by design. An
   attach line the user has to ask for is a session they cannot reach.
3. **STEER** — a NEW brief at the next count; a brief is read at LAUNCH.
4. **DELIVER** — copy the READY report verbatim; convert `## Bycatch` BEFORE merging.
5. **LAND** — `git mv` to `completed/` + `State: COMPLETED — <sha>` + `finished/` tag + summary
   + `write-active`, in the SAME action as the merge.
6. **RETIRE** — `git mv` to `retired/` + reason + `retired/` tag when a branch exists +
   `write-active`.
7. **AUDIT** — `tasks-status.ts` every sweep. Act on each signal or say why not.
   STALE-ACTIVE-VIEW is always `write-active`.

Load `.claude/skills/manage-tasks/SKILL.md` for the literal commands. It is the single source,
and Invar users manage their own repos with the same skill. One task, one folder, forever:
`git mv` between states, never `cp`, never `rm`. A commit accompanies every move.

**The CLI task tools (TaskCreate/TaskList/TaskUpdate) are RETIRED for task tracking.**
The user retired them on 2026-07-28; the list was drained, and a note task marks the
supersession. `.invar/tasks/` is the one live task record. Ignore the harness reminders
that suggest TaskCreate. The CLI task tools stay in use only for their other jobs:
Monitors and background-task control (TaskStop, TaskList for monitor IDs).

---

## ⚑ RULE TWO — EVERY CHECK HAS TWO ARMS

A check run in one polarity cannot distinguish **"the thing is absent"** from **"the check
cannot see."** Both print zero. This is one defect, not several. It is the conductor's most
repeated mistake (`project.conductor.md` family 2).

**Before reading any result, supply both arms:**

- the **PRESENT** arm must find something → proves the check can see;
- the **ABSENT** arm must find nothing → proves the check can be silent.

**If both arms agree, the instrument is broken. Report THAT, never a number.** A positive
control alone proves only that a check can fire. A check that fires on everything is as
useless as one that never fires.

**A control that mutates the system is not a control.** The negative arm of a guard test
needs a way to reach the guard without paying for the action.

**Run the tooling. Do not hand-roll the idioms.**

```
bash scripts/fleet/probe.sh self-test         # prove the probes fire AND stay silent
bash scripts/fleet/probe.sh builders          # /proc cwd + an impossible-path arm
bash scripts/fleet/probe.sh writes <dir> 15   # -mmin, plus a planted canary
bash scripts/fleet/probe.sh gate              # a finished log must not read as running
bash scripts/fleet/probe.sh exit <cmd...>     # the command's status, never a pipeline's
bun  scripts/tasks/tasks-status.ts           # task counts + drift; --self-test
DRY_RUN=1 scripts/fleet/dispatch.sh …         # every guard, no side effect
```

`pgrep` + `readlink /proc/<pid>/cwd`, `-mmin` (never `-newermt`), and reading a command's own
exit status are already correct inside `probe.sh`. Typing them fresh is how they go wrong.

---

## Dispatch

### Delegation doctrine

- **Delegate scoped chunks. Self-do the critical, hard, and failed work.** Keep the
  conductor's own reasoning for architecture, integration, and anything an agent stalls on.
- **Spec each chunk crisply.** For governed code the spec IS the module's `*.invariants.md`
  contract plus design. Review output against that contract by RUNNING it. Drive the real
  path, never read-only.
- **Deprecate a sub-par agent.** Discard its work; do not patch around it. Sub-par means it
  fails contract review, ignores the spec, or introduces defects.
- **Do not trust codex with deletions.** Commit before handing it work. Scope it to specific
  files, never "clean up" or "refactor the tree". All `rm` stays with the conductor. Run
  `git status` and `diff` on its output before accepting.
- **A proof standard lives in doctrine or it dies with the brief.** A bar stated only in one
  brief binds only that builder.

### Cutting a worktree — before dispatch, every time

`git worktree add` copies tracked files only. A fresh worktree has no `node_modules`, so the
builder's first run fails in preflight on unresolved imports. That red is clean, consistent,
and meaningless, and it looks exactly like the defect you dispatched it to investigate.

The order is fixed:

1. `git worktree add -b <branch> <path> main` — **check the path is FREE first.** A leftover
   worktree silently starts the builder on the wrong base. If the path exists, pick a new
   one. Do not reuse. Do not remove.
2. **`bun install` in the new worktree.** Not optional. Not the builder's job to discover.
3. Copy the brief in, then launch.

`scripts/fleet/dispatch.sh <number> <slug> <brief> [engine]` does all of this. It refuses to
launch without committing the record first, and it enforces the assignment (below).

**When a brief's first step is a MEASUREMENT**, say in the brief that a setup failure is not
a data point. Then a uniform red gets re-examined instead of averaged into a rate.

**A surface-move brief enumerates the surface's smoke inventory.** When a task
relocates or decouples a whole surface (a pane becomes a plugin, a module
splits), the gate will find the lost behaviors ONE PER RUN — the most
expensive possible discovery loop (#356 took 5 rounds this way, 2026-08-03).
Derive the inventory up front: every smoke whose name or primary subject
intersects the diff's modules. The round brief demands one sweep and one
per-smoke table (green / fixed-then-green with mechanism / red-outside-diff
with merge-base proof). Same generator as family 4: enumerate the surface
independently, never sample it through the sieve.

**round-brief.sh and steer.sh never share a command block.** The filing can
REFUSE (missing section, dead link) after the steer already landed, handing
the builder a pointer to a brief that does not exist. File, read the filing
result, then steer.

**Verify environment claims before writing them into a brief.** A remembered fact about the
machine is a hypothesis about the machine. One `which` is cheaper than the correction.

### Priming — agents must not be told the conventions, they must read them

IBR and the repo's ivue / invariants conventions decay when relayed in task prose. Do not
re-explain them. Prime from the single source of truth, never a copy. Copies drift.

| agent | how to prime |
|---|---|
| claude CLI | `--system-prompt USE_IBR_FOR_REASONING --append-system-prompt-file=.claude/skills/ibr/IBR.md` — the first flag EMPTIES the default system prompt down to the IBR trigger token, the second injects the framework, so the agent reasons with IBR instead of layering it on top of the stock prompt; auto-reads `CLAUDE.md`; tell it to load `/ivue` + `/invariants` |
| claude in-harness | open the prompt with *"Read `.claude/skills/ibr/IBR.md` and the `/ivue` + `/invariants` skill docs in full before any governed work"* |
| codex | auto-reads `AGENTS.md`; for governed code ALSO `cat .claude/skills/ibr/IBR.md` into the first prompt |
| fable | same as claude |

**Exception:** a purely mechanical, non-governed chunk needs no full prime. State which case
applies in the spec, so the agent is neither needlessly loaded nor dangerously under-briefed.

### The assignment is the task file's, not the command line's

Every task declares:

```
Engine: codex | claude | user
Environment: linux | macos | any
Model: 5.6-sol (codex ONLY) | fable-5 | opus-5 (claude) | any explicit user choice (e.g. sonnet)
Effort: high | medium | low
```

`dispatch.sh` reads these and refuses to contradict them: `Environment: macos` on a Linux
host, `Engine: user` (a decision, not a build), or an engine mismatch. **The environment
field is load-bearing.** #180's work cannot run on this host at all. Before the field
existed, that task read as ordinary backlog.

**Fleet defaults (user policy 2026-07-29), and dispatch TRANSMITS them as real
flags — an assignment that is not transmitted is a lie the lens repeats:**

- codex: `gpt-5.6-sol` at HIGH, always.
- claude general work: `fable` at MEDIUM. HIGH only for complex work, assigned
  explicitly with the reason in `Assignment note:`.
- opus: MEDIUM always, unless the user says otherwise.
- Any explicit user choice ("sol medium", "sonnet") goes into the task file's
  fields verbatim and wins over every default.

---

## Inbound — bycatch triage

`AGENTS.md` makes it the builder's duty to report every defect it SEES and fix only the one
it was SENT for. Builders honour that. The conductor's half is where it leaks.

**Read the `## Bycatch` section of every report BEFORE merging the branch, and convert it in
the same action.** A merge closes the loop on the task. The bycatch has no loop of its own.

For each item:

- **Create a task immediately**, carrying the builder's exact evidence: reproduction steps,
  observed values, how many times it reproduced, which commits. Restated from memory a day
  later, it is worth a fraction of the report's own words.
- **Classify honestly.** A user-visible defect is a real bug that arrived free. An
  instrument-only observation is debt, not a bug. Say which.
- **Tell the user about the user-visible ones** in the landing report. They are the
  highest-value output of driving the real app.
- **Dispatch an investigation** for anything that reproduces and is user-visible.

**Never fix bycatch inline in the branch that found it.** It arrives unreviewed, ungated
against its own contract, and mixed into a merge describing something else.

**Bycatch on the CHANGED tree cannot distinguish "I revealed this" from "I caused this."**
It requires a merge-base run. State whether it was verified at the merge base, and how.

---

## Verify by driving

Verify everything by driving the real user path: the **PTY harness** (`PtyTestDriver` +
frame probe), never internal values. Driving goes through the warm fluent server (user policy 2026-08-03; one-shot `bun run drive` only when the server structurally cannot, said aloud). Quick sightings previously used `bun run drive`
(scripts/harness/drive.md) — `--gesture` verbs with built-in waits, `--cells` color dumps —
before any bespoke probe file; briefs name the drive command so builders see the same pixels. This is the builder's inner loop, not only the gate's
instrument.

**tmux is LEGACY and demoted.** About 44 `*_full_tmux_smoke` registrations survive as an
opt-in audit tier the gate SKIPS unless `INVAR_FULL_TMUX=1`. An unrun smoke is not coverage.
It is a file that LOOKS like a contract. Never write a new tmux smoke. Port or extend a
PTY-harness one.

**Reproduce before diagnosing. Ratchet a verified behaviour into a gated smoke so it cannot
silently regress.**

### Smoke-coverage ratchet — on every ALL-PASS gate

A green gate only proves what the smokes actually DRIVE. Ask: *did this change touch or add
a load-bearing, user-facing behaviour that no smoke drives?*

- **Regression → permanent smoke (HARD).** Every user-flagged bug fix lands with a driven smoke.
- **An invariant with no driving smoke is a coverage hole.** Prefer to close it.
- **Guard against smoke bloat.** Grow coverage as ASSERTIONS folded into existing harness
  smokes. Add a NEW smoke only for a genuinely new surface. Only load-bearing, user-relied-on
  behaviour earns one. An unrunnably slow gate destroys the doubt-elimination it exists for.

### Diagnosis

- **A self-contradictory diagnostic means the instrument, not the system.** A value that
  cannot occur (an errno the syscall never returns, a count contradicting a check two lines
  earlier) means the number does not belong to the event it is attached to. Stop reasoning
  from it. Everything downstream is drawn against a lie. **The contradiction is the finding.**
- **"Nothing asynchronous ran in between" does not mean nothing changed.**
  Single-threaded-therefore-safe holds only for state no other thread can touch. The moment
  the resource is an OS handle, a runtime's own I/O threads can mutate it between two
  synchronous statements. **Using a valid argument to declare an observation impossible is
  how you reject the evidence instead of the model.**
- **When a rival hypothesis is cheap to separate, find the separating observation BEFORE
  writing the brief.** Brief an EXPERIMENT: probe before belief, named rivals, "say so
  plainly if the number comes out zero". Not a diagnosis. A brief written as an experiment
  survives being wrong. One written as a diagnosis does not.
- **A lifetime or ownership defect needs at least two participants in the experiment.**
  Concurrency in the probe is not a tuning parameter. It is the hypothesis.
- **A structural read is a HYPOTHESIS.** Brief ranked candidates, never one confident cause.
  A named cause spends the builder's effort confirming it (family 6).

### Measuring

- **You cannot demand a quiet machine you are not providing.** Brief PAIRED sampling:
  measure candidate and a fixed reference back to back, alternating, and judge on the
  within-pair delta. Load that inflates the candidate inflates its reference too. This also
  weakens the claim from "the populations must not overlap" to "the paired delta must
  separate from zero", which is the correct claim anyway. Sequential sampling under varying
  load does not merely add noise. It INVERTS bisect steps.
- **A check that can only fail toward "pass" is a decoration.** Plant the defect it claims to
  detect and require a red before trusting a green.
- **Replace load-bound verdicts before tolerating them.** Block on ordering or work counts.
  Keep durations as report-only trends. **A threshold I have to invent is one I will get
  wrong.** Derive it, or make the contract a count.
- **Instruments are indexed in `project.tools.md`.** Every instrument gets a row naming its
  question, its known results, and its gotcha. Every brief that asks for a measurement names
  the instrument to use. An instrument nobody can find is not tooling.

### Harness blind spot

The PTY/SGR harness proves LOGIC but cannot exercise terminal-specific paths: mouse protocol,
glyph tier, escape-sequence support. A real user break that will not reproduce in-harness is
often such a path. **Do not fabricate a code fix for a bug that does not reproduce.** It
ships a no-op. Diagnose the capability path from the code and flag that final verification
needs the user's real terminal.

### A green gate is not a claim about what the user feels

Contracts earn their keep on properties a human CANNOT see by inspection. For FELT properties
the value is attribution, not detection. The gate went green twice on a change that made the
app unusable. When the user reports a feel regression, drive it. Do not answer with a green.

**The user's veto is a gate the harness cannot replace.**

---

## Gate concurrency

**NO GATE WHILE ANY BUILDER IS LIVE.** A gate and a builder's verification phase are the same
resource, and "looks quiet" is not idle. A reading-phase builder reaches its own tests
minutes later, inside the gate's window. **A `git commit` launches a gate you did not type**,
so enumerate builders by `/proc/<pid>/cwd` before committing too (`probe.sh builders`). The
conductor also holds its OWN heavy work while a gate runs. Take the exception deliberately
and write down why, or HOLD.

**Gates MAY overlap each other.** Blocking verdicts are ordering- and count-based, so another
gate's load does not invalidate them. Cap the product of gates and pool workers to the
machine's CPU, memory, and inotify capacity. Keep every gate's sessions and failure artifacts
namespaced.

**Land serially even after speculative gates run in parallel.** Each landing changes the
combined tree and may require the remaining branch to integrate and verify again.

**Use deliberate contention as a robustness probe.** A blocking red under load is a defect in
the product or the instrument, not grounds to widen a threshold. Do not clear a harness red
by rerunning it alone. A solo-only green is evidence of an environment or ordering defect.

**The quiet lock belongs only to soft performance reports.** It never narrows blocking gate
concurrency. It gives up after 120 s and runs DEGRADED. Check `/tmp/invar-quiet-lock.journal`
for a `degraded` entry before trusting any timing.

**Give every long wait a deadline and a distinct expiry line in its log.** A wait that can
never fire looks identical to one still waiting. One waiter spun for 24 hours before anyone
noticed its gate had never run.

**Count ROOT gates** (a real `merge-gate.sh` process), never a name-match. Transient smoke
children inflate the count and cause false self-blocks. Gate-LOG step activity is the
authoritative liveness signal, not process topology.

---

## Merge and landing safety

- **Commit before gating.** A green gate on an uncommitted tree is not durable.
- **Gate the COMBINED tree, and re-check at LANDING time.** A branch cut from an old main
  must `git merge main` FIRST, then gate. **A green gate names the COMMIT it ran on, not the
  branch.** If main moved while the branch sat, the green was earned on a tree that no longer
  exists. Merge main in and re-gate. It costs one cycle.
- **Verify branch scope with `merge-base`, NEVER `main..HEAD`.** When main has moved, a
  main-relative diff reports main's newer additions as **deletions by your branch**.
  `git diff --stat $(git merge-base main <branch>)..<branch>`, and confirm an alarming
  deletion with `git diff --name-only $BASE..$BRANCH | grep <file>` → empty means main
  gained it.
- **A union merge without the BASE cannot tell "we added" from "they deleted."** Classify
  against `merge-base` before resolving.
- **One checkout, one writer.** Worktree-per-writer is mandatory. Give each agent a topology
  note at spawn: who you are, who your children are, who commits, who else writes here.
- **Advance main by a merge, NEVER `update-ref` on a branch checked out anywhere.** `main` IS
  checked out in the primary worktree (the user runs Invar from there). `update-ref` moves
  the pointer and leaves that worktree's index and files on the OLD commit: a phantom staged
  revert that serves the user stale code. Use `git merge --ff-only` in that worktree, or
  merge elsewhere and push.
- **Untracked files do not travel with `git merge`.** Before merging an agent branch,
  `git status` its worktree and `git add -A`. **A SKIP is not a PASS.**
- **At landing, check the contracts moved:**
  `git diff --stat <main>..<tip> -- '*.invariants.md'`. A code diff with zero contract
  changes is a two-second question: did this landing genuinely teach nothing? Refactors often
  legitimately answer yes. Features rarely do.
- **A rerun only clears a red if it ran the EXACT COMMITTED TIP being landed.** Diff the
  failing smoke file between the gate's tree and the rerun's tree first. **The thing you
  verified must be the thing you land.**
- **Landing over a red gate — the narrow rule.** Permitted only when the red is proven
  PRE-EXISTING with evidence from before the branch existed. Then name it in the landing
  report and file it as its own task with the evidence. Blocking user-directed work on a
  defect already on main is hostage-taking. "Re-run until green" is the same action with none
  of the accounting, and it is never acceptable.
- **Experiments never merge to main.** Provenance decides main, not quality.
- **land.sh now REFUSES without a READ verdict (exit 6).** Pass `GATE_LOG=<log>` whose
  sentinel is `GATE_EXIT=0`, or `GATE_OVERRIDE='<written reason>'` to take the exception
  deliberately (contract-only landing, batch covered by ONE green log, red classified
  pre-existing — write which). Bought on 2026-07-29: the conductor chained land.sh behind
  a wrapper whose exit was an echo's, not the gate's, and landed #237 on GATE_EXIT=1.
  A verdict must be READ from the log, never inferred from a wrapper's exit code.

---

## Never destroy recovery points

**Preservation is the DEFAULT. Destruction requires explicit, per-instance user authorization.**

- **Never delete a branch.** Not as cleanup, not because it merged, never as a side effect of
  finishing.
- **Never `git worktree remove --force`.** Plain `git worktree remove` (which refuses on a
  dirty tree) is allowed only after you verify the work is committed AND merged. Even then
  the BRANCH stays.
- **Never force-overwrite work:** no `push --force`, no `reset --hard` / `checkout -f` /
  `clean` that discards uncommitted or unmerged changes, no `update-ref` that rewinds. (A
  `reset --hard` to SYNC onto a commit that already contains all the work is fine. Verify
  with `git status` first.)
- **"Done" is a MARK, not a delete.** `git tag finished/<branch> <merge-hash>` + a
  `project.delegation-log.md` line. **Abandoned is also a mark:**
  `git tag -a retired/<branch> -m '<why>'`. Every branch is ACTIVE (untagged), FINISHED, or
  RETIRED. The terminal states are marked, never deleted, and greppable. Pruning happens only
  in an explicit, user-authorized sweep.

### Never search for a process you intend to kill

`pkill -f "merge-gate.sh"` killed two BUILDERS, because every builder brief contains the
sentence "do NOT run `scripts/merge-gate.sh`". **An agent carrying instructions ABOUT a tool
looks identical to that tool in a text search over command lines.**

- **NEVER `pkill`/`killall`/`pgrep -f` with a pattern that could appear in a brief or an
  argument.**
- **Stop a gate with `bash scripts/stop-merge-gate.sh [worktree]`.** It identifies the
  process by cmdline AND cwd, kills the process GROUP, and **refuses, killing nothing, if it
  cannot identify a gate.** A refusal is cheaper than destroyed work.
- **To stop a builder, resolve the pid from its working directory** and kill only that. The
  cwd is the identity. The command line is not.
- Before any kill, state which reason applies: killing to SEQUENCE (legitimate) or killing to
  DIAGNOSE (never — it destroys the evidence you were about to read).
- **A kill is a destructive operation.** A builder killed mid-flight loses everything
  uncommitted.

---

## Liveness and visibility

**Run `probe.sh`.** It encodes the correct idioms. The rules below are why.

- **A task is `in_progress` only while a NAMED builder is driving it:** a worktree, a brief,
  a log. With no driver, set it back to `pending`. An item that looks attended gets no
  pressure.
- **Key on fork-specific evidence only:** worktree writes in the last cycle, gate-log
  transitions, new branch/main commits, PTY processes resolved by `/proc/<pid>/cwd`.
  **Never treat the user's own interactive instances as fleet liveness, and never kill them.**
- **NEVER key a verdict on your own vocabulary appearing in content the builder processes.**
  A monitor grepping a builder's log for `quota|rate limit|401` fired a QUOTA BLOCK on two
  healthy builders, because the log contained repo documentation reading *"CAUTION: it
  consumes Codex quota"*. **A log contains the brief, the docs, and the agent's narration of
  both. It contains every word you would search it for.** Key on STRUCTURE: an exit-code
  sentinel the wrapper writes, process existence by cwd, log mtime via `-mmin`, commit
  counts. The thing being watched cannot utter those.
- **Commits are the #1 progress signal, and `find … -not -path '*/.git/*'` MISSES them.**
  Always include `git -C <wt> rev-list --count origin/main..HEAD`.
- **External snapshots LAG an in-flight agent.** Hold "stalled" diagnoses loosely. A dormancy
  nudge should ask the agent to SELF-REPORT rather than assert a stall. The nudge is harmless
  when wrong.
- **A liveness probe that can only fail toward "dead" is how you take over work that was
  fine.** Every scan carries a positive control in the same command.
- **ONE standing watcher: `scripts/fleet/fleet-watch.sh`, armed as a persistent Monitor.**
  It derives its watch set from disk every cycle (in-progress folders, transcripts, /tmp
  READY files, registered gate logs), so a new dispatch enters the watch automatically and
  recovery after an interrupt is one action:
  `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`. Arm it at
  session start and at resume. The reconciliation sweep's STALE-MONITOR check re-arms it
  when TaskList shows none. Register a gate log by appending its path to
  `/tmp/fleet-watch-gates`. Self-test before trusting: `fleet-watch.sh --self-test`.
- **The watcher is also the SPRAWL sentinel, and dispatch enforces it.** Each cycle
  stamps `/tmp/fleet-watch.heartbeat` and samples disk-free + /tmp entry count; it emits
  `SPRAWL:` on a floor breach (<10G), a rapid fill (>600MB/cycle) or a sustained fill (>2G across a 5m window — the #244 leak measured
  ~1.3G/cycle and filled the disk twice in one night), or an entry surge (>300/cycle),
  throttled to one alert per 5m, WITH the top recent growers named in the event.
  `dispatch.sh` REFUSES to launch while the heartbeat is stale (>3m) — a builder never
  runs unwatched (`SENTINEL_ACK=1` is the deliberate exception). On a SPRAWL event:
  ANALYZE, never bulk-delete. Kill the growth SOURCE (the leaking process or loop);
  delete only patterns the fleet provably owns (its own scratch globs, the agent-sdk
  extraction dirs). Unknown files may be another project's — a wrong sweep is worse
  than a full disk.
- **Arm a dedicated Monitor on a long gate's log** whose result must be acted on now
  (fleet-watch's cycle also catches registered gates). The tracked-bg completion re-invoke
  is unreliable. **Stop a monitor in the ACTION that consumes its result.** Arming a
  replacement stops its predecessor in the same action. Left running, monitors emit timeout
  noise that trains you to skim the one channel that must stay trustworthy.
- **Tracked background, never `nohup`.** `nohup … &` leaves no live children and the harness
  drops you from view.
- **Heartbeat over PID-watching.** PIDs rotate. Give long workers a heartbeat artifact
  (phase + last-progress timestamp + done-flag), so "still building" ≠ "done-and-stranded"
  ≠ "crashed".
- **Steer via `scripts/fleet/steer.sh`, and it does three jobs (2026-07-30).** (1) It
  proves LANDING at the builder's OWN session record (codex rollout / claude store), not
  the pane — `steers.log` in the task folder records only CONFIRMED landings; unconfirmed
  steers become pending markers that fleet-watch confirms or raises as `STEER_LOST`.
  (2) A steer to a dead IN-PROGRESS lane AUTO-RESTORES the builder's conversation first
  (`relaunch.sh`: `codex resume --last` / `claude --continue`), so recovery needs no
  separate memory; it refuses to resurrect a landed/retired lane. (3) Never relaunch a
  builder bare by hand — `scripts/fleet/relaunch.sh <task-folder>` resumes the same
  conversation, reads the assignment from meta.json, and plants the agent-tmux
  ready/busy markers land.sh's idle detection needs.

---

## Defect classes to check for

The full accounts are in `project.conductor.md`. These are the checks.

- **The unreachable wait** (family 1). Before writing any wait, ask: *is this thing FALSE
  right now?* If it is already true, the correct wait is a no-op. Walk
  `mutation → reachable publisher → observed condition`. **Never widen a timeout or raise a
  frame budget.** Both convert the defect into a slower version of itself. Its inverse, the
  **pre-satisfied wait**, launders a no-op into a green and is invisible to a ratchet that
  counts calls.
- **A proxy reported as the state** (family 3). Ask what the output would be if the thing
  were absent.
- **Partial coverage presenting as total** (family 4). Do not ask "does it handle the cases
  named here." Enumerate the surface independently (from the interface, an AST census, the
  producer) and diff it against what the boundary covers.
- **The fixture is the blind spot** (family 5). When an instrument says clean and a user says
  broken, suspect WHICH FIXTURE before the assertion. **A repaired instrument needs its
  subject's STATES enumerated, not the last failure replayed.**
- **Evidence has an age** (family 7). A count tells you history, not status. **Read logs as a
  SERIES, never as a rate.** A rate destroys the shape a sequence reveals. Prefer making the
  comparison automatic over remembering to do it.
- **A builder's environment is not the conductor's** (family 9). A cross-check against a
  builder's numbers is not a replication unless the environments were compared.
- **A mass conversion needs PER-SITE proof**, not class-level proof.
- **A retry inside the pool cannot rescue a pool-caused failure.** It reproduces the
  condition it was meant to rule out.
- **Knowing a rule is not knowing where it binds.** Ask what the tool actually walks.
  Checkers walk the FILESYSTEM, not git, so `.gitignore` does not protect from them.
- **The conductor's own naming is part of the test environment.** A name you choose can
  become the blocker.
- **An instruction is an assertion.** Run it, from the directory the reader will run it from,
  before handing it over. Including the ones too simple to fail.
- **Remove the capability, not the misuse.** An API that does not exist cannot be misused.
  Prove it with a structural post-check.
- **A structural fact is not a problem.** Make the change carry the burden of proof: name
  predictions BEFORE implementing, and require the invariant record to get SHORTER.
  Cost/benefit becomes arguable once someone has a diff.
- **Zero-margin bounds are an unstated tolerance, not a flake.** Establish the MARGIN before
  diagnosing a miss.

---

## Loop shape — the hourly orchestration cron

0. **Verify the loops are armed. `CronList` first, every fire.** A cron is session-only
   in-memory state. This file is a copy of the WORDS, not evidence the job exists. If a
   recorded loop is absent from `CronList`, re-arm it from the verbatim text in this file,
   before any other work, and say so. Never infer a cron is live from this file or from the
   fact that fires have been arriving. The hourly arriving tells you nothing about the other
   one. **The current pair:** the hourly orchestration loop, and the 30-minute reconciliation
   sweep at `11,41 * * * *`. The 10-minute liveness poll is RETIRED. Do not re-arm it.
1. **Drain the real backlog first.** Make sure a builder is driving each unfinished task.
   Nudge or take over. **No creative experiment while any user-requested task is unmerged.**
2. **If blocked → codex/fable before deferring.** Escalate only when the decision is
   genuinely the user's: naming, scope, publish consent, irreversible or outward actions. A
   background FORK cannot spawn subagents, so a blocked fork reports UP and the conductor
   brings in codex/fable.
3. **Only once drained** → invent and run ONE creative parity experiment on an `experiment-*`
   branch cut from latest main, gated. **NEVER merge experiments to main.** **Inventory
   throttle:** if 2 or more gate-green experiments already await the user's adoption call,
   SKIP invention and report the shelf. Unadopted inventory only accrues rebase drift, and
   the adoption signal should steer what gets invented next. A stronger alternative after a
   feature wave is the **generator audit** (`.claude/skills/generator-audit/SKILL.md`).
   Trigger it deliberately, not hourly.
4. **Append lessons to `project.conductor.md`; promote durable ones into THIS skill and
   commit.** Appending CAPTURES a lesson. Promoting makes it OPERATIVE. The loop may improve
   its own method, including the verbatim cron prompts below, which it keeps in sync.
5. Keep the fleet alive. Sync local main to origin/main. Report concisely. **Run `date`
   before stamping a time.**

**If the user is actively present and directing, skip experiments. Their direction IS the
backlog.**

---

## Live cron prompts (verbatim — the running loop's exact words)

**What is NOT live, and how it stayed alive anyway.** The original hourly `/loop 1h …` in the
user's own wording is RETIRED. `3da3cca9` (hourly at :07, "Follow the /conductor skill")
supersedes it with a strict superset, and the old text pointed lessons at
`Skills/Orchestration Lessons.md`, which is superseded. It is deliberately not recorded
below, so a restored session cannot resurrect it.

It kept firing for hours because a `/loop` is a **ScheduleWakeup chain the conductor re-arms
every turn**, and I passed the original text forward each time on the strength of "pass the
same input verbatim." The `/loop` skill's own words settle it: *"re-arming is a per-turn
choice, not a default."* Verbatim governs the TEXT if you continue. It says nothing about
whether to continue. I had the permission to stop and never exercised it, while flagging the
stale target in three separate replies and re-arming immediately after each one. Noticing a
defect and then reproducing it is worse than missing it.

So each fire, before re-arming, ask: **is this loop still the best-worded instrument for its
job, or has something replaced it?** If replaced, stop the chain rather than forward the text.

### THE TWO-PER-HOUR DESIGN (user, 2026-07-29: "less is more") + RE-ARM ON RESTART

Exactly TWO crons, evenly spaced — the hourly ORCHESTRATION loop at :07 and
the hourly RECONCILIATION sweep at :37 — so the session hears a clock twice
an hour, thirty minutes apart. Event wakes (fleet-watch's Monitor) do the
real-time work; the crons catch drift and direction. The old 30-minute
sweep cadence and the /loop ScheduleWakeup chain are RETIRED in favor of
this pair (2026-07-29); do not re-arm either.

**RE-ARM ON RESTART — the full set is THREE actions, no more:**

1. `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`
   — the ONE event watcher (READY/DEAD/QUIET/GATE_DONE/SPRAWL + the
   heartbeat dispatch requires).
2. `CronCreate(cron: "7 * * * *", recurring: true, prompt: <the hourly
   orchestration prompt below, verbatim>)`.
3. `CronCreate(cron: "37 * * * *", recurring: true, prompt: <the sweep
   prompt below, verbatim>)`.

Crons are session-only and die with the session; the words here are the
durable artifact. On 2026-07-29 the user caught a restart that re-armed
only the Monitor — this list exists so that cannot recur.

### Hourly RECONCILIATION SWEEP — `37 * * * *`

VERBATIM PROMPT:
Reconciliation sweep (hourly at :37, bounded per fire — NOT a liveness poll; fleet-watch's
Monitor events are the primary wake signal, this sweep catches what they structurally cannot).
Check in order, act on findings, report in a few lines: (1) GREEN-UNLANDED — any registered
gate log with GATE_EXIT=0 whose branches are not landed: land now via land.sh.
(2) DEAD-WITH-DIRTY — for each .invar/worktrees/* with an in-progress task: if its transcript
is silent >20 min AND the tree is dirty with no new commit, the builder likely died mid-write —
preserve the tree as a WIP commit on its branch, read the transcript tail to diagnose, and
either relaunch with a resume round-brief or take over. Never kill anything; never treat user
Invar instances as builders. (3) STALE-MONITOR — TaskList: fleet-watch missing? re-arm it (one
idempotent Monitor). (4) CHECKOUT-SYNC — the user's checkout /home/parallels/dev/invar
must be clean; main moves only by landings. (5) CONFLICT-QUEUE — any finished branch
mid-conflict-resolution: confirm a builder is on it, else round-brief one. If everything
reconciles clean, say so in one line and stop — this sweep exists for drift, not narration.

These are the exact prompts driving this session's loops, recorded here so we can improve
them deliberately. **This skill may refine them** (step 4 above). But a cron is a
session-only, in-memory snapshot: editing the text here does NOT change a running cron.
Apply a change with `CronDelete <id>` + `CronCreate`, then update the copy here to match.
IDs drift on each recreate. The words are the durable artifact.

### Hourly orchestration loop — `7 * * * *` (every hour at :07)

```
Hourly orchestration loop (bounded per fire). Follow the `/conductor` skill (.claude/skills/conductor/SKILL.md). Do in order:

(1) BACKLOG FIRST — before ANY creative experiment, drain real work. Sources of truth, in order: (a) the user's requests in this session still unmerged; (b) active builder agents' reported remaining work (task notifications / SendMessage pins); (c) project.handoff.md's resume anchor + any open goal list. For each UNFINISHED task: confirm a builder is actively driving it (worktree writes / gate activity / branch commits in the last cycle). If dormant on a GREEN gate, drive the merge; if stalled, nudge with a precise fix OR take it over. Do NOT start a creative experiment while any user-requested task is unmerged.

(2) IF BLOCKED (builder stuck, ambiguous fix, hard problem) — do NOT default to deferring to the user. Spawn a fresh subagent and solve creatively; escalate only when the call is genuinely the user's (naming, scope, publish consent).

(3) ONLY once the real backlog is drained AND the user is away — invent + execute ONE creative IDE-parity experiment: reduce a real user need to its invariant, build on an experiment-* branch off LATEST main, gate it. NEVER merge experiments to main (provenance decides main, not quality). If the user is actively present and directing, skip experiments — their direction IS the backlog.

(4) Append lessons to /home/parallels/dev/invar/project.conductor.md; when a lesson generalizes into doctrine, REFINE the /conductor SKILL.md and commit. If you change a cron prompt, recreate the cron AND update the skill's verbatim copy — the words are the durable artifact (crons are session-only and die on restart; this fire may be running on a restored cron proving exactly that). A cron prompt that names a RETIRED rule re-teaches it on every fire: check any rule you are about to cite by name against the skill before acting on it.

(5) Fleet hygiene: verify builders by evidence (worktree writes, gate logs, branch commits — never process counts; never kill user Invar instances). Cap builders ~2-3. NO GATE WHILE ANY BUILDER IS LIVE — a gate and a builder's verification phase are the same resource, and "looks quiet" is not idle (a reading-phase builder reaches its own tests minutes later, inside the gate's window). Gates MAY overlap each other; builders are the blocker. Remember a `git commit` launches a gate you did not type, so enumerate live builders by `/proc/<pid>/cwd` before committing too. Take the exception deliberately and write down why, or HOLD. The conductor also holds its OWN heavy work (tsc/tests/smokes) while any gate runs. Verify by DRIVING the real user path. Keep the user's checkout synced to origin/main (clean ff after each landing; rebase their local doc commits on top when present). Report concisely, and run `date` before stamping a time — do not invent one.
```

### RETIRED: the 10-minute liveness check (was `3,13,23,33,43,53 * * * *`)

Retired 2026-07-26 and replaced by the 30-minute RECONCILIATION SWEEP above. Do NOT re-arm
it. Why it retired: per-builder commit-count-or-silence Monitors now fire the instant work
commits or a codex log goes silent, which beats any fixed polling cadence at the poll's own
job. And the codex fleet leaves durable evidence (logs, worktrees, branches) that a
half-hour sweep reconciles lazily. What the poll did that still matters (green-unlanded
detection, dead-builder recovery, the never-kill-user-instances rule, checkout sync) moved
into the sweep's five checks verbatim. Its prompt history (three refreshes, each earned by a
restart or a superseded rule) is preserved in git. The armable text was deliberately deleted
from this file, because a stale recorded prompt is worse than none. A restored cron would
re-impose retired doctrine.

## Compaction resilience and resume

Long autonomous runs must survive compaction. Keep the resume anchor at the TOP of
`project.handoff.md`. Refresh it every few turns by **reconstructing from disk** (git log,
gate logs, worktree state), never from a dropped summary. A parent cannot see a child's
context percentage. Detection is behavioural or self-reported. A parent CAN force-compact a
child by sending a message whose content *begins with* `/compact <focus>`.

**Instrument fluency does not survive compaction.** Before the first drive (or first
use of any instrument) after a compaction or resume, read its skill wholesale —
`.claude/skills/drive-pty/SKILL.md` for driving. A summary carries facts, not fluency;
an invocation error means OPEN THE SKILL, never fall back to an older remembered
pattern (2026-08-03: six wasted round-trips on retired one-shot flags).

**Instantiating a fresh conductor.** This skill (doctrine) + `project.conductor.md` (lessons)
transfer the METHOD, not the live state. Read in order:

1. `CLAUDE.md` → `AGENTS.md` → this skill → `project.conductor.md`
2. `project.handoff.md` (top anchor = current status) → the `manage-tasks` skill →
   `.invar/tasks/` + `project.active-tasks.md`
3. `project.brief.md`, `project.requirements.md`, `project.architecture.md`, and `/ibr`,
   `/ivue`, `/invariants`
4. **Ground-truth the docs against reality.** Docs lag; git is authoritative:
   `git log --oneline -15 --all`, `git tag -l 'finished/*'`, `git worktree list`,
   `git status`, `bun scripts/tasks/tasks-status.ts`

**DURABLE vs EPHEMERAL:**

- **DURABLE** — commits, branches, `finished/`/`retired/` tags, the `project.*.md` docs,
  `.invar/tasks/`, the skills, `.claude/settings.json`.
- **EPHEMERAL** — background agents (agent-IDs are gone; respawn, never reattach), crons,
  harness PTY sessions and temp roots.

On resume: read the anchor → verify each in-flight branch by git → respawn missing crons →
respawn a worker ONLY for unfinished work → refresh the anchor from disk, so the next clone
starts from truth.

## When to use

Any build with a conductor coordinating builder agents over a task backlog. Not needed for a
single-shot task you do yourself.
