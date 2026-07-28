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

The architect / reviewer / integrator. Delegates scoped chunks, reviews output against contracts,
protects the merge line, keeps the fleet alive and visible, and reconstructs state from disk.

**Three rules come first. Everything else is procedure.**

**Where things live.** This file is DOCTRINE — what to do and how. `project.conductor.md` is the
LESSONS, grouped into 14 families with dated evidence; `project.conductor.archive.md` is the full log.
Cite a family when you need the account. A rule here is operative; a rule only there is not yet.

---

## ⚑ RULE ZERO — THE AGENT'S INNER LOOP IS DRIVING, NOT TESTING

Violating this is the most expensive mistake available, and it is invisible while it happens because
everything still looks rigorous.

| | INNER loop — the agent's | OUTER loop — the conductor's |
|---|---|---|
| what | drive the real app in its own PTY, look, change, drive again | the merge gate as final sieve |
| cadence | seconds | rare, terminal |
| owner | the builder, alone | the conductor |
| exit condition | *the symptom is gone when I drive it* | green, then land |

**Iteration does not need the gate. Only LANDING does.**

**The brief template, in this order, always:**

1. **Reproduce by DRIVING first.** No assertion written yet. If you cannot see it, you cannot fix it.
2. **Iterate drive → change → drive.** ONE instrument at a time. Never the suite. Never 3×.
3. **Write the contract only AFTER the symptom is gone**, to lock in what was achieved.
4. **One verification pass at the END.**
5. Judge by observation of the real path. **Assertions PREVENT REGRESSION; they do not DISCOVER FIXES.**

Two failures follow from putting the test in the inner loop, and the second is worse: every
refinement costs minutes instead of seconds, so the builder takes fewer swings; and the builder starts
optimizing for MAKING AN ASSERTION PASS instead of MAKING IT RIGHT. For felt qualities — smoothness,
weight, responsiveness — the assertion is a lossy proxy, so a green suite and an unhappy user coexist
comfortably.

**The conductor causes the violation** by writing briefs that demand the contract suite before the
builder reports. That pushes gate-shaped work into the inner loop and repeats it outside. Provenance
discipline — builders never push, the conductor gates and lands — is unaffected and stays.

**Corollary: the gate must be TIMELESS.** A sieve that depends on FPS depends on the machine, so it is
both slow and arguable. Count-based assertions have no clock in them: they cannot be slow, cannot flake
under load, and cannot be excused.

**Feel-bisect** — when a user reports something *used to* feel right: bisect HISTORY BY DRIVING.
Scratch worktrees at candidate commits, same gesture, same settings; compare the per-frame fingerprint
as a SHAPE, not against a threshold. `3,3,3,3` glides; `5,1,5,1` stumbles at the same mean.

---

## ⚑ RULE ONE — THE LEDGER: A TASK’S RECORD IS A FOLDER, BUILT AS THE WORK HAPPENS

**`.invar/tasks/<state>/<number>-<descriptive-name>/`.** States: `todo`, `live`, `done`, `retired`. A
task is MOVED between them; a folder is never deleted. `project.ledger.md` is the index;
`project.tasks-ledger.md` is the full protocol (this section is its operative summary).

| file | shape |
|---|---|
| task | `task-<number>-<name>.md` |
| brief | `brief-<number>-<count>-<name>.md` — NUMBER leads, round count follows |
| report | `report-<number>-<name>.md` |
| summary | `summary-<number>-<name>.md` |
| transcript | `transcript-<engine>-<model>-<effort>-<number>-<name>.md` (gitignored, `tmp/transcripts/`) |

Number-first so a folder of several rounds sorts task-first and a pasted filename identifies its own
task. The transcript carries agent identity so three runs by three agents produce three readable files.

**Branch park-tags use the same vocabulary:** `finished/` (merged) · `retired/` (never landed) ·
`reverted/` · `blocked/`.

**Rules the tooling cannot enforce:**

- **Create the task folder BEFORE dispatching.** A number chosen at dispatch time is a guess; one such
  guess left a branch permanently disagreeing with its task ID.
- **Numbers are permanent.** Never reused, even for an abandoned task — branches carry them and
  branches are never deleted, so a number must resolve forever.
- **A follow-up brief is a NEW numbered file.** Never edit the previous one, or you destroy the record
  of what the agent was working from when it made a decision.
- **Write `summary-*.md` after landing.** The report is the agent's account; the summary is what
  actually happened — what was refuted, what you got wrong, what was left undone.
- **Every entry states the EVIDENCE**, not just the intent. A task recording only a conclusion is
  unusable to whoever picks it up.
- **Slugs are three words minimum**; `dispatch.sh` refuses less.
- **State the reconstruction honestly.** An honest stub beats invented specificity — the next reader
  plans against what they find.

**Run the tracker instead of reading the folders:**

```
bun scripts/tasks/ledger-status.ts             # counts + drift signals
bun scripts/tasks/ledger-status.ts --self-test # before trusting a clean run
```

Signals, strongest first: **REPORT-IN-OPEN** (a delivered report in `todo`/`live` — this is how a
finished task sat unfiled), **STATE-MISMATCH**, **DONE-NO-EVIDENCE**, **THIN**. It reports; it never
moves anything.

---

## ⚑ RULE TWO — EVERY CHECK HAS TWO ARMS

A check run in one polarity cannot distinguish **"the thing is absent"** from **"the check cannot
see."** Both print zero. This is one defect, not several — it is the conductor's most repeated
mistake (`project.conductor.md` family 2).

**Before reading any result, supply both arms:**

- the **PRESENT** arm must find something → proves the check can see;
- the **ABSENT** arm must find nothing → proves the check can be silent.

**If both arms agree, the instrument is broken — report THAT, never a number.** A positive control
alone proves only that a check can fire, and a check that fires on everything is as useless as one
that never fires.

**A control that mutates the system is not a control.** The negative arm of a guard test needs a way
to reach the guard without paying for the action.

**Run the tooling; do not hand-roll the idioms.**

```
bash scripts/fleet/probe.sh self-test         # prove the probes fire AND stay silent
bash scripts/fleet/probe.sh builders          # /proc cwd + an impossible-path arm
bash scripts/fleet/probe.sh writes <dir> 15   # -mmin, plus a planted canary
bash scripts/fleet/probe.sh gate              # a finished log must not read as running
bash scripts/fleet/probe.sh exit <cmd...>     # the command's status, never a pipeline's
bun  scripts/tasks/ledger-status.ts           # ledger counts + drift; --self-test
DRY_RUN=1 scripts/fleet/dispatch.sh …         # every guard, no side effect
```

`pgrep` + `readlink /proc/<pid>/cwd`, `-mmin` (never `-newermt`), and reading a command's own exit
status are already correct inside `probe.sh`. Typing them fresh is how they go wrong.

---

## Dispatch

### Delegation doctrine

- **Delegate scoped chunks; self-do the critical, hard, and failed work.** Keep the conductor's own
  reasoning for architecture, integration, and anything an agent stalls on.
- **Spec each chunk crisply.** For governed code the spec IS the module's `*.invariants.md` contract
  plus design. Review output against that contract by RUNNING it — drive the real path, never read-only.
- **Deprecate a sub-par agent**: discard its work, do not patch around it. Sub-par = fails contract
  review, ignores spec, or introduces defects.
- **codex must NOT be trusted with deletions.** Commit before handing it work; scope it to specific
  files, never "clean up" or "refactor the tree"; all `rm` stays with the conductor; `git status` and
  `diff` its output before accepting.
- **A proof standard lives in doctrine or it dies with the brief.** A bar stated only in one brief
  binds only that builder.

### Cutting a worktree — before dispatch, every time

`git worktree add` copies **tracked files only**, so a fresh worktree has no `node_modules` and the
builder's first run fails in preflight on unresolved imports — a clean, consistent, meaningless red
that looks exactly like the defect you dispatched it to investigate.

The order is fixed:

1. `git worktree add -b <branch> <path> main` — **check the path is FREE first.** A leftover worktree
   silently starts the builder on the wrong base. If the path exists, pick a new one; do not reuse and
   do not remove.
2. **`bun install` in the new worktree.** Not optional, not the builder's job to discover.
3. Copy the brief in, then launch.

`scripts/fleet/dispatch.sh <number> <slug> <brief> [engine]` does all of this and refuses to launch
without committing the brief first. It also enforces the assignment (below).

**When a brief's first step is a MEASUREMENT**, say in the brief that a setup failure is not a data
point — so a uniform red gets re-examined rather than averaged into a rate.

**Verify environment claims before writing them into a brief.** A remembered fact about the machine is
a hypothesis about the machine. One `which` is cheaper than the correction.

### Priming — agents must not be told the conventions, they must read them

IBR and the repo's ivue / invariants conventions decay when relayed in task prose. Do NOT re-explain
them. Prime from the single source of truth — never a copy, copies drift.

| agent | how to prime |
|---|---|
| claude CLI | `--system-prompt USE_IBR_FOR_REASONING --append-system-prompt-file=.claude/skills/ibr/IBR.md` — the first flag EMPTIES the default system prompt down to the IBR trigger token, the second injects the framework, so the agent reasons with IBR instead of layering it on top of the stock prompt; auto-reads `CLAUDE.md`; tell it to load `/ivue` + `/invariants` |
| claude in-harness | open the prompt with *"Read `.claude/skills/ibr/IBR.md` and the `/ivue` + `/invariants` skill docs in full before any governed work"* |
| codex | auto-reads `AGENTS.md`; for governed code ALSO `cat .claude/skills/ibr/IBR.md` into the first prompt |
| fable | same as claude |

**Exception:** a purely mechanical, non-governed chunk needs no full prime. State which case it is in
the spec, so the agent is neither needlessly loaded nor dangerously under-briefed.

### The assignment is the task file's, not the command line's

Every task declares:

```
Engine: codex | claude | user
Environment: linux | macos | any
Model: 5.6-sol (codex ONLY) | fable-5 | opus-5 (claude)
Effort: high | default
```

`dispatch.sh` reads these and refuses to contradict them: `Environment: macos` on a Linux host,
`Engine: user` (a decision, not a build), or an engine mismatch. **The environment field is
load-bearing** — #180's work cannot run on this host at all, and before the field existed it read as
ordinary backlog.

---

## Inbound — bycatch triage

`AGENTS.md` makes it the builder's duty to report every defect it SEES and fix only the one it was
SENT for. Builders honour that. The conductor's half is where it leaks.

**Read the `## Bycatch` section of every report BEFORE merging the branch, and convert it in the same
action.** A merge closes the loop on the task; the bycatch has no loop of its own.

For each item:

- **Create a task immediately**, carrying the builder's exact evidence — reproduction steps, observed
  values, how many times it reproduced, which commits. Restated from memory a day later it is worth a
  fraction of the report's own words.
- **Classify honestly.** A user-visible defect is a real bug that arrived free. An instrument-only
  observation is debt, not a bug. Say which.
- **Tell the user about the user-visible ones** in the landing report. They are the highest-value
  output of driving the real app.
- **Dispatch an investigation** for anything that reproduces and is user-visible.

**Never fix bycatch inline in the branch that found it** — it arrives unreviewed, ungated against its
own contract, and mixed into a merge describing something else.

**Bycatch on the CHANGED tree cannot distinguish "I revealed this" from "I caused this."** It requires
a merge-base run. State whether it was verified at the merge base, and how.

---

## Verify by driving

Verify EVERYTHING by driving the real user path — the **PTY harness** (`PtyTestDriver` + frame probe)
— never internal values. This is the builder's inner loop, not only the gate's instrument.

**tmux is LEGACY and demoted.** ~44 `*_full_tmux_smoke` registrations survive as an opt-in audit tier
the gate SKIPS unless `INVAR_FULL_TMUX=1`. An unrun smoke is not coverage — it is a file that LOOKS
like a contract. Never write a new tmux smoke; port or extend a PTY-harness one.

**Reproduce before diagnosing. Ratchet a verified behaviour into a gated smoke so it cannot silently
regress.**

### Smoke-coverage ratchet — on every ALL-PASS gate

A green gate only proves what the smokes actually DRIVE. Ask: *did this change touch or add a
LOAD-BEARING, user-facing behaviour that no smoke drives?*

- **Regression → permanent smoke (HARD).** Every user-flagged bug fix lands with a driven smoke.
- **An invariant with no driving smoke is a coverage hole** — prefer to close it.
- **Guard against smoke bloat.** Grow coverage in ASSERTIONS folded into existing harness smokes; add
  a NEW smoke only for a genuinely new surface. Only load-bearing, user-relied-on behaviour earns one.
  An unrunnably-slow gate destroys the doubt-elimination it exists to provide.

### Diagnosis

- **A self-contradictory diagnostic means the instrument, not the system.** A value that cannot occur —
  an errno the syscall never returns, a count contradicting a check two lines earlier — means the number
  does not belong to the event it is attached to. Stop reasoning from it; everything downstream is drawn
  against a lie. **The contradiction is the finding.**
- **"Nothing asynchronous ran in between" does not mean nothing changed.** Single-threaded-therefore-safe
  holds only for state no other thread can touch. The moment the resource is an OS handle, a runtime's
  own I/O threads can mutate it between two synchronous statements. **Using a valid argument to declare
  an observation impossible is how you reject the evidence instead of the model.**
- **When a rival hypothesis is cheap to separate, find the separating observation BEFORE writing the
  brief.** Brief an EXPERIMENT — probe before belief, named rivals, "say so plainly if the number comes
  out zero" — not a diagnosis. A brief written as an experiment survives being wrong; one written as a
  diagnosis does not.
- **A lifetime or ownership defect needs at least two participants in the experiment.** Concurrency in
  the probe is not a tuning parameter, it is the hypothesis.
- **A structural read is a HYPOTHESIS.** Brief ranked candidates, never one confident cause — a named
  cause spends the builder's effort confirming it (family 6).

### Measuring

- **You cannot demand a quiet machine you are not providing.** Brief PAIRED sampling: measure candidate
  and a fixed reference back to back, alternating, judge on the within-pair delta. Load that inflates
  the candidate inflates its reference too. This also weakens the claim from "the populations must not
  overlap" to "the paired delta must separate from zero", which is the correct claim anyway. Sequential
  sampling under varying load does not merely add noise — it INVERTS bisect steps.
- **A check that can only fail toward "pass" is a decoration.** Plant the defect it claims to detect and
  require a red before trusting a green.
- **Replace load-bound verdicts before tolerating them.** Block on ordering or work counts; retain
  durations as report-only trends. **A threshold I have to invent is one I will get wrong** — derive it,
  or make the contract a count.
- **Instruments are indexed in `project.tools.md`.** Every instrument gets a row naming its question, its
  known results and its gotcha; every brief that asks for a measurement names the instrument to use. An
  instrument nobody can find is not tooling.

### Harness blind spot

The PTY/SGR harness proves LOGIC but cannot exercise terminal-SPECIFIC paths — mouse protocol, glyph
tier, escape-sequence support. A real user break that will not reproduce in-harness is often such a
path. **Do NOT fabricate a code fix for a bug that does not reproduce** (it ships a no-op); diagnose the
capability path from the code and flag that final verification needs the user's real terminal.

### A green gate is not a claim about what the user feels

Contracts earn their keep on properties a human CANNOT see by inspection. For FELT properties the value
is attribution, not detection — the gate went green twice on a change that made the app unusable. When
the user reports a feel regression, drive it; do not answer with a green.

**The user's veto is a gate the harness cannot replace.**

---

## Gate concurrency

**NO GATE WHILE ANY BUILDER IS LIVE.** A gate and a builder's verification phase are the same resource,
and "looks quiet" is not idle — a reading-phase builder reaches its own tests minutes later, inside the
gate's window. **A `git commit` launches a gate you did not type**, so enumerate builders by
`/proc/<pid>/cwd` before committing too (`probe.sh builders`). The conductor also holds its OWN heavy
work while a gate runs. Take the exception deliberately and write down why, or HOLD.

**Gates MAY overlap each other.** Blocking verdicts are ordering- and count-based, so another gate's
load does not invalidate them. Cap the product of gates and pool workers to the machine's CPU, memory
and inotify capacity. Keep every gate's sessions and failure artifacts namespaced.

**Land serially even after speculative gates run in parallel** — each landing changes the combined tree
and may require the remaining branch to integrate and verify again.

**Use deliberate contention as a robustness probe.** A blocking red under load is a defect in the
product or instrument, not grounds to widen a threshold. Do not clear a harness red by rerunning it
alone: a solo-only green is evidence of an environment or ordering defect.

**The quiet lock belongs only to soft performance reports** and never narrows blocking gate concurrency.
It gives up after 120 s and runs DEGRADED — check `/tmp/invar-quiet-lock.journal` for a `degraded` entry
before trusting any timing.

**Give every long wait a deadline and a distinct expiry line in its log.** A wait that can never fire is
indistinguishable from one still waiting; one waiter spun for 24 hours before anyone noticed its gate had
never run.

**Count ROOT gates** (a real `merge-gate.sh` process), never a name-match — transient smoke children
inflate the count and cause false self-blocks. Gate-LOG step activity is the authoritative liveness
signal, not process topology.

---

## Merge and landing safety

- **Commit before gating.** A green gate on an uncommitted tree is not durable.
- **Gate the COMBINED tree, and re-check at LANDING time.** A branch cut from an old main must
  `git merge main` FIRST, then gate. **A green gate names the COMMIT it ran on, not the branch** — if
  main moved while the branch sat, the green was earned on a tree that no longer exists. Merge main in
  and re-gate; it costs one cycle.
- **Verify branch scope with `merge-base`, NEVER `main..HEAD`.** When main has moved, a main-relative
  diff reports main's newer additions as **deletions by your branch**.
  `git diff --stat $(git merge-base main <branch>)..<branch>`, and confirm an alarming deletion with
  `git diff --name-only $BASE..$BRANCH | grep <file>` → empty means main gained it.
- **A union merge without the BASE cannot tell "we added" from "they deleted."** Classify against
  `merge-base` before resolving.
- **One checkout, one writer.** Worktree-per-writer is mandatory. Give each agent a topology note at
  spawn: who you are, who your children are, who commits, who else writes here.
- **Advance main by a merge, NEVER `update-ref` on a branch checked out anywhere.** `main` IS checked
  out in the primary worktree (the user runs Invar from there); `update-ref` moves the pointer and
  leaves that worktree's index and files on the OLD commit — a phantom staged revert that serves the
  user stale code. Use `git merge --ff-only` in that worktree, or merge elsewhere and push.
- **Untracked files do not travel with `git merge`.** Before merging an agent branch, `git status` its
  worktree and `git add -A`. **A SKIP is not a PASS.**
- **At landing, check the contracts moved**: `git diff --stat <main>..<tip> -- '*.invariants.md'`. A
  code diff with zero contract changes is a two-second question: did this landing genuinely teach
  nothing? Refactors often legitimately answer yes; features rarely do.
- **A rerun only clears a red if it ran the EXACT COMMITTED TIP being landed.** Diff the failing smoke
  file between the gate's tree and the rerun's tree first. **The thing you verified must be the thing
  you land.**
- **Landing over a red gate — the narrow rule.** Permitted only when the red is proven PRE-EXISTING with
  evidence from before the branch existed. Then name it in the landing report and file it as its own
  task with the evidence. Blocking user-directed work on a defect already on main is hostage-taking;
  "re-run until green" is the same action with none of the accounting, and is never acceptable.
- **Experiments never merge to main.** Provenance decides main, not quality.

---

## Never destroy recovery points

**Preservation is the DEFAULT; destruction requires explicit, per-instance user authorization.**

- **Never delete a branch.** Not as cleanup, not because it merged, never as a side effect of finishing.
- **Never `git worktree remove --force`.** Plain `git worktree remove` (which refuses on a dirty tree) is
  allowed only after verifying the work is committed AND merged — and even then the BRANCH stays.
- **Never force-overwrite work:** no `push --force`, no `reset --hard` / `checkout -f` / `clean` that
  discards uncommitted or unmerged changes, no `update-ref` that rewinds. (A `reset --hard` to SYNC onto
  a commit that already contains all the work is fine; verify with `git status` first.)
- **"Done" is a MARK, not a delete.** `git tag finished/<branch> <merge-hash>` + a
  `project.delegation-log.md` line. **Abandoned is also a mark:** `git tag -a retired/<branch> -m
  '<why>'`. Every branch is ACTIVE (untagged), FINISHED, or RETIRED; the terminal states are marked,
  never deleted, and greppable. Pruning happens only in an explicit, user-authorized sweep.

### Never search for a process you intend to kill

`pkill -f "merge-gate.sh"` killed two BUILDERS, because every builder brief contains the sentence
"do NOT run `scripts/merge-gate.sh`". **An agent carrying instructions ABOUT a tool is
indistinguishable from that tool to a text search over command lines.**

- **NEVER `pkill`/`killall`/`pgrep -f` with a pattern that could appear in a brief or an argument.**
- **Stop a gate with `bash scripts/stop-merge-gate.sh [worktree]`** — it identifies the process by
  cmdline AND cwd, kills the process GROUP, and **refuses, killing nothing, if it cannot identify a
  gate.** A refusal is cheaper than destroying work.
- **To stop a builder, resolve the pid from its working directory** and kill only that. The cwd is the
  identity; the command line is not.
- Before any kill, state which reason applies: killing to SEQUENCE (legitimate) or killing to DIAGNOSE
  (never — it destroys the evidence you were about to read).
- **A kill is a destructive operation.** A builder killed mid-flight loses everything uncommitted.

---

## Liveness and visibility

**Run `probe.sh`.** It encodes the correct idioms; the rules below are why.

- **A task is `in_progress` only while a NAMED builder is driving it** — a worktree, a brief, a log.
  With no driver, set it back to `pending`. An item that looks attended gets no pressure.
- **Key on fork-specific evidence only:** worktree writes in the last cycle, gate-log transitions, new
  branch/main commits, PTY processes resolved by `/proc/<pid>/cwd`. **Never treat the user's own
  interactive instances as fleet liveness, and never kill them.**
- **NEVER key a verdict on your own vocabulary appearing in content the builder processes.** A monitor
  grepping a builder's log for `quota|rate limit|401` fired a QUOTA BLOCK on two healthy builders,
  because the log contained repo documentation reading *"CAUTION: it consumes Codex quota"*. **A log
  contains the brief, the docs, and the agent's narration of both — so it contains every word you would
  search it for.** Key on STRUCTURE: an exit-code sentinel the wrapper writes, process existence by cwd,
  log mtime via `-mmin`, commit counts. Those cannot be uttered by the thing being watched.
- **Commits are the #1 progress signal — and `find … -not -path '*/.git/*'` MISSES them.** Always
  include `git -C <wt> rev-list --count origin/main..HEAD`.
- **External snapshots LAG an in-flight agent.** Hold "stalled" diagnoses loosely; a dormancy nudge
  should ask the agent to SELF-REPORT rather than assert a stall. The nudge is harmless when wrong.
- **A liveness probe that can only fail toward "dead" is how you take over work that was fine.** Every
  scan carries a positive control in the same command.
- **Arm a Monitor on a long gate's log** whose result must be acted on — the tracked-bg completion
  re-invoke is unreliable. **Stop a monitor in the ACTION that consumes its result**, and arming a
  replacement stops its predecessor in the same action. Left running, monitors emit timeout noise that
  trains you to skim the one channel that must stay trustworthy.
- **Tracked background, never `nohup`.** `nohup … &` leaves no live children and the harness drops you
  from view.
- **Heartbeat over PID-watching.** PIDs rotate; give long workers a heartbeat artifact (phase +
  last-progress timestamp + done-flag) so "still building" ≠ "done-and-stranded" ≠ "crashed".

---

## Defect classes to check for

The full accounts are in `project.conductor.md`. These are the checks.

- **The unreachable wait** (family 1). Before writing any wait: *is this thing FALSE right now?* If it is
  already true, the correct wait is a no-op. Walk `mutation → reachable publisher → observed condition`.
  **Never widen a timeout or raise a frame budget** — both convert the defect into a slower version of
  itself. Its inverse, the **pre-satisfied wait**, launders a no-op into a green and is invisible to a
  ratchet that counts calls.
- **A proxy reported as the state** (family 3). Ask what the output would be if the thing were absent.
- **Partial coverage presenting as total** (family 4). Do not ask "does it handle the cases named here."
  Enumerate the surface independently — from the interface, an AST census, the producer — and diff it
  against what the boundary covers.
- **The fixture is the blind spot** (family 5). When an instrument says clean and a user says broken,
  suspect WHICH FIXTURE before the assertion. **A repaired instrument needs its subject's STATES
  enumerated, not the last failure replayed.**
- **Evidence has an age** (family 7). A count tells you history, not status. **Read logs as a SERIES,
  never as a rate** — a rate destroys the shape a sequence reveals. Prefer making the comparison
  automatic over remembering to do it.
- **A builder's environment is not the conductor's** (family 9). A cross-check against a builder's
  numbers is not a replication unless the environments were compared.
- **A mass conversion needs PER-SITE proof**, not class-level proof.
- **A retry inside the pool cannot rescue a pool-caused failure** — it reproduces the condition it was
  meant to rule out.
- **Knowing a rule is not knowing where it binds.** Ask what the tool actually walks: checkers walk the
  FILESYSTEM, not git, so `.gitignore` does not protect from them.
- **The conductor's own naming is part of the test environment** — a name you choose can become the
  blocker.
- **An instruction is an assertion.** Run it, from the directory the reader will run it from, before
  handing it over — including the ones too simple to fail.
- **Remove the capability, not the misuse.** An API that does not exist cannot be misused; prove it with
  a structural post-check.
- **A structural fact is not a problem.** Make the change carry the burden of proof: name predictions
  BEFORE implementing, and require the invariant record to get SHORTER. Cost/benefit becomes arguable
  once someone has a diff.
- **Zero-margin bounds are an unstated tolerance, not a flake.** Establish the MARGIN before diagnosing
  a miss.

---

## Loop shape — the hourly orchestration cron

0. **Verify the loops are armed — `CronList` first, every fire.** A cron is session-only in-memory
   state; this file is a copy of the WORDS, not evidence the job exists. If a recorded loop is absent
   from `CronList`, re-arm it from the verbatim text in this fire, before any other work, and say so.
   Never infer a cron is live from this file or from the fact that fires have been arriving — the
   hourly arriving tells you nothing about the other one. **The current pair:** the hourly
   orchestration loop, and the 30-minute reconciliation sweep at `11,41 * * * *`. The 10-minute
   liveness poll is RETIRED — do not re-arm it.
1. **Drain the real backlog first.** Ensure a builder is driving each unfinished task; nudge or take
   over. **No creative experiment while any user-requested task is unmerged.**
2. **If blocked → codex/fable before deferring.** Escalate only when the decision is genuinely the
   user's: naming, scope, publish consent, irreversible or outward actions. A background FORK cannot
   spawn subagents, so a blocked fork reports UP and the conductor brings in codex/fable.
3. **Only once drained** → invent and run ONE creative parity experiment on an `experiment-*` branch cut
   from latest main, gated. **NEVER merge experiments to main.** **Inventory throttle:** if 2 or more
   gate-green experiments already await the user's adoption call, SKIP invention and report the shelf —
   unadopted inventory only accrues rebase drift, and the adoption signal should steer what gets
   invented next. A stronger alternative after a feature wave is the **generator audit**
   (`.claude/skills/generator-audit/SKILL.md`) — trigger it deliberately, not hourly.
4. **Append lessons to `project.conductor.md`; promote durable ones into THIS skill and commit.**
   Appending CAPTURES a lesson; promoting makes it OPERATIVE. The loop is explicitly allowed to improve
   its own method, including the verbatim cron prompts below, which it keeps in sync.
5. Keep the fleet alive; sync local main to origin/main. Report concisely. **Run `date` before stamping
   a time.**

**If the user is actively present and directing, skip experiments — their direction IS the backlog.**

---

## Live cron prompts (verbatim — the running loop's exact words)

**What is NOT live, and how it stayed alive anyway.** The original hourly `/loop 1h …` in the user's
own wording is RETIRED — `3da3cca9` (hourly at :07, "Follow the /conductor skill") supersedes it with a
strict superset, and the old text pointed lessons at `Skills/Orchestration Lessons.md`, which is
superseded. It is deliberately not recorded below, so a restored session cannot resurrect it.

It kept firing for hours because a `/loop` is a **ScheduleWakeup chain the conductor re-arms every
turn**, and I passed the original text forward each time on the strength of "pass the same input
verbatim." The `/loop` skill's own words settle it: *"re-arming is a per-turn choice, not a default."*
Verbatim governs the TEXT if you continue; it says nothing about whether to continue. I had the
permission to stop and never exercised it — while flagging the stale target in three separate replies
and re-arming immediately after each one. Noticing a defect and then reproducing it is worse than
missing it.

So each fire, before re-arming: **is this loop still the best-worded instrument for its job, or has
something replaced it?** If replaced, stop the chain rather than forward the text.

### The 30-minute RECONCILIATION SWEEP (cron `11,41 * * * *`) — replaced the 10-minute liveness poll on 2026-07-26

The old ten-minute check polled builder liveness. Two changes made that cadence wasteful: per-builder
commit-count-or-silence Monitors now fire the moment work is committed (or a codex log goes silent),
and the codex fleet leaves durable evidence (logs, worktrees, branches) that a sweep can reconcile
lazily. What Monitors structurally CANNOT catch is drift between components — a green gate nobody
landed, a dead builder with a dirty tree, a monitor watching a finished subject, a checkout that
fell behind. That is what the sweep checks, at half-hour cadence, acting rather than narrating.

VERBATIM PROMPT:
Reconciliation sweep (every 30 min, bounded per fire — NOT a liveness poll; per-builder commit-count
Monitors are the primary wake signal, this sweep catches what they structurally cannot). Check in
order, act on findings, report in a few lines: (1) GREEN-UNLANDED — any /tmp/*-gate.log with
GATE_EXIT=0 whose branch is not merged+pushed to origin/main: land it now (push, park with
finished/<branch> tag). (2) DEAD-WITH-DIRTY — for each /tmp/conductor-* worktree with an active
task: if its codex log is silent >20 min AND the tree is dirty with no new commit, the builder
likely died mid-write — preserve the tree as a WIP commit on its branch, read the log tail to
diagnose (quota? crash?), and either relaunch codex with a resume brief or take over. Never kill
anything; never treat user Invar instances (/home/parallels/dev/tui-editor, /tmp/tui-demo,
/tmp/wt-*) as builders. (3) STALE-MONITOR — TaskList: any Monitor watching a log/worktree whose
subject already completed or aborted: TaskStop it; any builder WITHOUT a live monitor: arm the
commit-count-or-silence monitor. (4) CHECKOUT-SYNC — user's checkout /home/parallels/dev/tui-editor
must be clean and equal to origin/main (ff after landings; rebase their local doc commits on top
when present). (5) CONFLICT-QUEUE — any finished branch whose merge into main conflicted and is
awaiting a resolution round: confirm a codex is actually on it (log advancing), else dispatch one
with the standard merge-resolution brief. If everything reconciles clean, say so in one line and
stop — this sweep exists for drift, not for narration.

These are the exact prompts driving this session's loops, recorded here so we can improve them
deliberately. **This skill may refine them** (step 4 above) — but a cron is a session-only,
in-memory snapshot: editing the text here does NOT change a running cron. Apply a change with
`CronDelete <id>` + `CronCreate`, then update the copy here to match. IDs drift on each recreate;
the words are the durable artifact.

### Hourly orchestration loop — `7 * * * *` (every hour at :07)

```
Hourly orchestration loop (bounded per fire). Follow the `/conductor` skill (tui-editor/.claude/skills/conductor/SKILL.md). Do in order:

(1) BACKLOG FIRST — before ANY creative experiment, drain real work. Sources of truth, in order: (a) the user's requests in this session still unmerged; (b) active builder agents' reported remaining work (task notifications / SendMessage pins); (c) project.handoff.md's resume anchor + any open goal list. For each UNFINISHED task: confirm a builder is actively driving it (worktree writes / gate activity / branch commits in the last cycle). If dormant on a GREEN gate, drive the merge; if stalled, nudge with a precise fix OR take it over. Do NOT start a creative experiment while any user-requested task is unmerged.

(2) IF BLOCKED (builder stuck, ambiguous fix, hard problem) — do NOT default to deferring to the user. Spawn a fresh subagent and solve creatively; escalate only when the call is genuinely the user's (naming, scope, publish consent).

(3) ONLY once the real backlog is drained AND the user is away — invent + execute ONE creative IDE-parity experiment: reduce a real user need to its invariant, build on an experiment-* branch off LATEST main, gate it. NEVER merge experiments to main (provenance decides main, not quality). If the user is actively present and directing, skip experiments — their direction IS the backlog.

(4) Append lessons to /home/parallels/dev/tui-editor/project.conductor.md; when a lesson generalizes into doctrine, REFINE the /conductor SKILL.md and commit. If you change a cron prompt, recreate the cron AND update the skill's verbatim copy — the words are the durable artifact (crons are session-only and die on restart; this fire may be running on a restored cron proving exactly that). A cron prompt that names a RETIRED rule re-teaches it on every fire: check any rule you are about to cite by name against the skill before acting on it.

(5) Fleet hygiene: verify builders by evidence (worktree writes, gate logs, branch commits — never process counts; never kill user Invar instances). Cap builders ~2-3. NO GATE WHILE ANY BUILDER IS LIVE — a gate and a builder's verification phase are the same resource, and "looks quiet" is not idle (a reading-phase builder reaches its own tests minutes later, inside the gate's window). Gates MAY overlap each other; builders are the blocker. Remember a `git commit` launches a gate you did not type, so enumerate live builders by `/proc/<pid>/cwd` before committing too. Take the exception deliberately and write down why, or HOLD. The conductor also holds its OWN heavy work (tsc/tests/smokes) while any gate runs. Verify by DRIVING the real user path. Keep the user's checkout synced to origin/main (clean ff after each landing; rebase their local doc commits on top when present). Report concisely, and run `date` before stamping a time — do not invent one.
```

### RETIRED: the 10-minute liveness check (was `3,13,23,33,43,53 * * * *`)

Retired 2026-07-26 and replaced by the 30-minute RECONCILIATION SWEEP above — do NOT re-arm it.
Why it retired: per-builder commit-count-or-silence Monitors now fire the instant work commits or a
codex log goes silent, which beats any fixed polling cadence at the poll's own job; and the codex
fleet leaves durable evidence (logs, worktrees, branches) that a half-hour sweep reconciles lazily.
What the poll did that still matters — green-unlanded detection, dead-builder recovery, the
never-kill-user-instances rule, checkout sync — moved into the sweep's five checks verbatim. Its
prompt history (three refreshes, each earned by a restart or a superseded rule) is preserved in git;
the armable text was deliberately deleted from this file because a stale recorded prompt is worse
than none — a restored cron would re-impose retired doctrine.

## Compaction resilience and resume

Long autonomous runs must survive compaction. Keep the resume anchor at the TOP of
`project.handoff.md`, refreshed every few turns by **reconstructing from disk** (git log, gate logs,
worktree state), never from a dropped summary. A parent cannot see a child's context percentage;
detection is behavioural or self-reported. A parent CAN force-compact a child by sending a message
whose content *begins with* `/compact <focus>`.

**Instantiating a fresh conductor.** This skill (doctrine) + `project.conductor.md` (lessons) transfer
the METHOD, not the live state. Read in order:

1. `CLAUDE.md` → `AGENTS.md` → this skill → `project.conductor.md`
2. `project.handoff.md` (top anchor = current status) → `project.ledger.md` → `.invar/tasks/`
3. `project.brief.md`, `project.requirements.md`, `project.architecture.md`, and `/ibr`, `/ivue`,
   `/invariants`
4. **Ground-truth the docs against reality** — docs lag, git is authoritative:
   `git log --oneline -15 --all`, `git tag -l 'finished/*'`, `git worktree list`, `git status`,
   `bun scripts/tasks/ledger-status.ts`

**DURABLE vs EPHEMERAL:**

- **DURABLE** — commits, branches, `finished/`/`retired/` tags, the `project.*.md` docs, `.invar/tasks/`,
  the skills, `.claude/settings.json`.
- **EPHEMERAL** — background agents (agent-IDs are gone; respawn, never reattach), crons, harness PTY
  sessions and temp roots.

On resume: read the anchor → verify each in-flight branch by git → respawn missing crons → respawn a
worker ONLY for unfinished work → refresh the anchor from disk so the next clone starts from truth.

## When to use

Any build with a conductor coordinating builder agents over a task backlog. Not needed for a
single-shot task you do yourself.
