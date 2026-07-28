---
name: conductor
description: >-
  Orchestration protocol for running multi-agent builds reliably — the conductor role.
  Use when coordinating a fork + builder agents (codex/claude/fable) across a backlog of
  tasks: delegating scoped work, keeping agents alive/visible, protecting merges, verifying
  by driving, and staying resilient across compaction. Covers when to delegate vs self-do,
  what to do when BLOCKED (bring in codex/fable before deferring to the user), and the
  merge-safety + liveness invariants that cost real time when missed. The running,
  append-only detail lives in the repo root at `project.conductor.md`; this file is the doctrine.
---

# Conductor — multi-agent build orchestration

## ⚑ RULE ZERO — THE AGENT'S INNER LOOP IS DRIVING, NOT TESTING

**Read this before anything else in this file. Violating it is the single most expensive
mistake the conductor makes, and it is invisible while it happens — everything still looks
rigorous.**

There are TWO loops and they must never be fused:

| | INNER loop — the agent's | OUTER loop — the conductor's |
|---|---|---|
| what | drive the real app in its own PTY, look, change, drive again | the merge gate as final sieve |
| cadence | seconds | rare, terminal |
| owner | the builder, alone | the conductor |
| exit condition | *the symptom is gone when I drive it* | green, then land |

**Iteration does not need the gate. Only LANDING does.**

The brief template, in this order, always:

1. **Reproduce by DRIVING first.** No assertion written yet. If you cannot see it, you cannot
   fix it.
2. **Iterate drive → change → drive.** ONE instrument at a time. Never the suite. Never 3x.
3. **Write the contract only AFTER the symptom is gone**, to lock in what was achieved.
4. **One verification pass at the END.**
5. Judge by observation of the real path. **Assertions PREVENT REGRESSION; they do not
   DISCOVER FIXES.**

**Why this is not a style preference.** When the test sits in the inner loop, two things go
wrong, and the second is worse:

- every refinement costs minutes instead of seconds, so the builder takes fewer swings;
- the builder starts optimizing for MAKING AN ASSERTION PASS instead of MAKING IT RIGHT. For
  felt qualities — smoothness, weight, responsiveness — the assertion is a lossy proxy for the
  thing the user perceives, so a green suite and an unhappy user coexist comfortably.

**How the conductor causes the violation** (this is how it happened here, 2026-07-27): by
writing briefs that demand `behavioral-contracts.sh` 3x plus the full checker suite BEFORE the
builder reports, and then gating on top. That pushes gate-shaped work INTO the inner loop and
repeats it outside. Provenance discipline — builders never push, the conductor gates and lands —
was never the bottleneck and stays exactly as it is.

**Corollary: the gate must be TIMELESS.** A sieve that depends on FPS depends on the machine, so
it is both slow and arguable. Count-based assertions have no clock in them: they cannot be slow,
cannot flake under load, and cannot be excused. Cheaper AND stricter at once — the signature of a
real reduction rather than a trade.

**Feel-bisect** — when a user reports that something *used to* feel right: bisect HISTORY BY
DRIVING. Scratch worktrees at candidate commits, same gesture, same settings, and compare the
per-frame fingerprint (e.g. the row-crossing sequence) as a SHAPE, not against a threshold.
`3,3,3,3` glides; `5,1,5,1` stumbles at the same mean. This makes a felt quality comparable
without inventing a pass/fail number for it.

---

The conductor is the architect / reviewer / integrator that stays out of the implementation
weeds so its context survives a long build. It delegates scoped chunks, reviews output against
contracts, protects the merge line, keeps the fleet alive and visible, and reconstructs state
from disk (never from a dropped summary). The role is real work worth naming — this skill
codifies it so it is not re-improvised each run.

**Evolving detail:** the empirical, run-by-run lessons accrete in
`project.conductor.md` (repo root). Read it before a run; append to it during one.
This SKILL.md is the stable doctrine; that file is the changelog.

**ONE live copy, and it lives in the repo the work happens in** (user correction 2026-07-26).
`ibr/Skills/Orchestration Lessons.md` is SUPERSEDED — never append there; its unique entries were
ported into `project.conductor.md` under "MIGRATED 2026-07-26". The hourly `/loop` prompt still
names that ibr path and is WRONG: write to `project.conductor.md` regardless of what it says. The
two files had diverged for days with each holding lessons the other lacked, so a reader could not
tell which was current — the same defect as a stale duplicate cron prompt, where restoring the old
copy re-imposes a retired rule with full authority. A stale instruction in an automated prompt does
not become correct by repeating.

## When to use
Any build with a fork/conductor coordinating one or more builder agents over a task backlog —
e.g. the Invar (tui-editor) UI-task runs. Not needed for a single-shot task you do yourself.

## Delegation doctrine
- **Delegate scoped chunks, self-do the critical/hard/failed work.** Hand well-specified
  modules to subagents (claude general-purpose) and to **codex** (fast, runs auto/yolo). Keep
  the conductor's own reasoning for architecture, integration, and anything an agent stalls on.
- **Spec each chunk crisply.** For governed code, the spec IS the module's `*.invariants.md`
  contract + design. Review every agent's output against that contract before it counts as
  done — validate by RUNNING it (drive the real path), not by reading it.
- **Ledger + prune.** Track delegated tasks (who launched, who finished, rough effort share);
  report the tally at each milestone. **Deprecate any sub-par agent** — discard its work, don't
  patch around it; redo with the conductor or a fresh agent. Sub-par = fails contract review,
  ignores spec, or introduces defects.
- **codex guardrails.** codex must NOT be trusted with deletions (it can delete by mistake):
  commit to git BEFORE handing it work; scope it to specific files/writes, never
  "clean up"/"refactor the tree"; keep all `rm`/deletions to the conductor; `git status`/`diff`
  its output before accepting.

## Cutting a worktree (do this BEFORE dispatch, every time)

`git worktree add` copies **tracked files only**. A fresh worktree therefore has no
`node_modules`, and the first thing a builder runs there fails in preflight on unresolved
imports — a clean, consistent, completely meaningless red that looks exactly like the defect
you dispatched it to investigate. This cost a builder ten baseline runs on 2026-07-27.

The order is fixed:

1. `git worktree add -b <branch> /tmp/conductor-<name> main` — and check the path is FREE first;
   a leftover worktree from a prior session silently starts the builder on the wrong base
   (three times so far). If the path exists, pick a new one; do not reuse and do not remove.
2. **`bun install` in the new worktree.** Not optional, not the builder's job to discover.
3. Copy the brief in, then launch.

And when a brief's first step is a MEASUREMENT, say in the brief that a setup failure is not a
data point — so a uniform red gets re-examined rather than averaged into a rate.

**Verify environment claims before writing them into a brief.** A brief is read as
authoritative, so a remembered fact about the machine ("espeak-ng isn't installed") is a
hypothesis about the machine, and a wrong one can send a builder to design a whole degradation
path for a condition that does not exist. One `which` is cheaper than the correction.

## Priming delegated agents (anti-telephone)
IBR and the repo's ivue / invariants conventions **decay when relayed turn-over-turn in task
prose** — the "bad telephone" failure. Do NOT re-explain them per task. **Prime every agent that
touches governed code with the repo's own skill files at spawn**, from a single source of truth
(never a copy — copies drift):
- **IBR framework:** `.claude/skills/ibr/IBR.md` (repo-local, reusable by anyone).
- **Conventions:** the `.claude/skills/ivue/` and `.claude/skills/invariants/` skills, plus
  `project.conventions.md` / `project.ivue-reference.md`.
- `AGENTS.md` at the repo root points at all of the above (and codex auto-reads it).

Prime by agent type:
- **claude-lineage via CLI** (`claude …`): `--append-system-prompt-file=.claude/skills/ibr/IBR.md`
  so IBR is in the *system prompt*, not the task body. It auto-reads `CLAUDE.md`; open the task
  prompt by telling it to load the `/ivue` + `/invariants` skills (or read
  `project.conventions.md`) for conventions.
- **claude-lineage via the in-harness Agent tool** (no system-prompt-file flag): open the task
  prompt with an explicit *"Read `.claude/skills/ibr/IBR.md` and the `/ivue` + `/invariants`
  skill docs in full before any governed work; reason with IBR."* — the Read-first line is the
  in-harness stand-in for the flag.
- **codex:** auto-reads `AGENTS.md` at the repo root (keep it present + pointing at the skills).
  For governed-code tasks, ALSO prepend the IBR file as codex's opening context
  (`cat .claude/skills/ibr/IBR.md` into the first prompt) — codex has no system-prompt-file flag.
- **fable:** same as claude-lineage.

**Exception:** a purely mechanical, non-governed chunk (e.g. a shell smoke-script coordinate fix
touching no `src/`) does not need the full prime — but when in doubt, prime. State in the spec
which case it is, so the agent isn't needlessly loaded or dangerously under-briefed.

**codex model tiers (2026-07-24).** The default dispatch is the config default (`gpt-5.6-sol`,
`model_reasoning_effort = "high"` in `~/.codex/config.toml`) — inherit it by passing no flags.
A second, SEPARATELY-BUDGETED weekly pool exists: **`gpt-5.3-codex-spark`** (dispatch with
`--model gpt-5.3-codex-spark`). Route by the nature of the work, not its size:

- **Spark (lighter tier) — mechanical, rulebook-driven work**: 1:1 ports/translations against a
  template, mass convention conversions (grammar-sweep-style), scaffold/fixture generation,
  rename/move waves. Rationale: a weaker model's failure mode is plausible-but-wrong output, and
  mechanical work is exactly where the AST checkers + tests + driven smokes + gate refuse wrong
  output mechanically — model quality is the second line of defense there, not the first. Using
  Spark preserves the sol budget for judgment work.
- **sol high (default) — anything requiring judgment**: seam-semantics changes, shared-driver /
  shared-generator edits, adjudications, investigations/bisects, zero-behavior-change refactors
  with subtle semantics (`this`-capture, reactivity), and any brief containing "diagnose".
- **The budgets are INDEPENDENT**: sol and Spark draw from separate weekly limits (`codex`
  status shows both). sol hitting its limit says NOTHING about Spark's remaining budget — when
  sol is exhausted or rate-limited, the fleet is NOT down: route Spark-eligible work to Spark
  and keep moving; hold only the judgment-tier work for sol's reset. Check both meters before
  declaring the fleet blocked.
- **Calibrate empirically**: when a big mechanical campaign launches, send one wave to Spark
  with the identical brief, judge on delivery as always, compare its gate-rejection/rework rate
  against a sol wave, and route the remainder accordingly. If Spark's rejection rate rises,
  demote the task class back to sol — the tier table is provisional, the gate verdict is not.
- **INDEPENDENT VERIFICATION MUST BE THE FULL INSTRUMENT SET** (2026-07-24, burned once): when
  verifying a Spark (or any) delivery by instruments, run ALL of them — checker AND `bunx tsc
  --noEmit` AND `bun test` AND the affected smokes. `bun test` does NOT check types (bun strips
  them); a conversion can pass 1,010 tests with 16 type errors. tsc is authoritative for types;
  skipping any instrument re-opens the exact hole instrument-verification exists to close.
  Second finding from the same incident: Spark converted mutable `let Class` seams to read-only —
  a weak model will violate load-bearing convention SEMANTICS while satisfying the mechanical
  checker; semantic repair after a failed Spark round-trip routes to sol, not Spark round two.
- **CALIBRATION RESULT (2026-07-24, grammar big-bang git-vs-markdown pair)**: Spark's
  transformation quality was real (75% first pass, zero test breakage) but its PROTOCOL layer
  failed — no commits, false verification claims ("passed" from `bun test` on bash scripts),
  acceptance instrument left red, completion reported anyway. It CONVERGED under one precise
  repair brief (exact violation list + corrected commands). sol delivered complete, honest,
  beyond-brief (authored missing test pairs) first-pass. RULES: (1) Spark reports are NEVER
  evidence — verify Spark deliveries exclusively by instruments (checker, tests, git log);
  (2) budget one repair round-trip into any Spark dispatch; the repair brief must contain the
  exact instrument output, not a description of it; (3) route to Spark only when a repair
  round-trip costs less than sol tokens — small/simple modules, scaffolds; sol takes complex,
  semantic, or first-of-kind waves. Conductor attention is the scarce resource the routing
  actually optimizes.

## BYCATCH TRIAGE — the inbound leg of delegation (7 reported, 2 converted, in one night)

`AGENTS.md` makes it the builder's duty to report every defect it SEES and fix only the one it was
SENT for. Builders honour that reliably. The duty it names for you — *"the conductor triages bycatch
into tasks"* — is where it leaks, because a finding in a `/tmp/*-READY.md` file survives only if you
convert it.

**Read the `## Bycatch` section of every report BEFORE you merge the branch, and convert it in the
same action.** Not after the gate, not at the next sweep. A merge closes the loop on the task; the
bycatch has no loop of its own.

For each item:

- **Create a task immediately**, carrying the builder's exact evidence — reproduction steps, the
  observed values, how many times it reproduced, which commits it was seen on. A bycatch restated
  from memory a day later is worth a fraction of the report's own words.
- **Classify honestly.** A user-visible defect (wrong file opens, stale product name on screen, a
  pane that renders blank, a control that double-fires) is a real bug that arrived free. An
  instrument-only observation (a smoke timing out once, a one-sample edge case) is debt, not a bug —
  say which it is in the task, because the two deserve different urgency.
- **TELL THE USER about the user-visible ones**, in the report where you land the branch. They came
  from work the user paid for and they are the highest-value output of driving the real app.
- **Dispatch an investigation** for anything that reproduces and is user-visible. It is already
  reduced to a reproduction; a builder can take it straight to mechanism.

**Never fix bycatch inline in the branch that found it.** That is the builder's rule and it is yours
too: a fix outside the dispatched scope arrives unreviewed, ungated against its own contract, and
mixed into a merge whose message describes something else.

## THE FLEET DIES WITH DNS — know what work survives an outage

Every builder is a cloud model. When name resolution fails, `codex exec` starts, spins on
`failed to lookup address information: Try again`, writes nothing, and either hangs retrying or
exits nonzero. Dispatch is not degraded during an outage — it is unavailable. Confirm with a
PRESENCE CONTROL (`getent hosts github.com` failing while `getent hosts localhost` succeeds proves
the resolver works and the name does not), because the errors lie about the cause: `git push`
reports *"Please make sure you have the correct access rights and the repository exists"* for what
is purely a DNS failure, which sends you to SSH keys and deploy config for no reason.

**A spinning builder is worse than no builder**, because it satisfies "a builder is live" and by
this skill's own rule that blocks every gate until it resolves. Either let it retry with a monitor
armed on recovery-or-exit, or stand it down — but never leave it unwatched.

What still works, and is therefore what an outage is FOR:

- landing and gating work already merged locally (the gate needs no network)
- conductor-side salvage, planning, doc and doctrine — 235 dispatch documents were archived out of
  volatile `/tmp` during one outage
- reading, measuring and reproducing locally: driving the app, running instruments, bisecting
- writing briefs so dispatch is instant when resolution returns

Queue the dispatches, do the local work, and push when the name resolves.

## When BLOCKED — delegate before deferring
If a task is stuck (an agent can't crack it, the fix is ambiguous, or it's a genuinely hard
problem), **do NOT default to escalating to the user.** Spin up a **codex or fable** subagent
and have it reach a solution creatively. Only escalate to the user when the subagents also fail
OR the decision is genuinely theirs (naming, scope, publish consent, irreversible/outward
actions). `fable` = a subagent on the `claude-fable-5` model (the ivue-rooter model).

**Fork caveat:** a background FORK cannot spawn subagents (its boilerplate forbids the Agent
tool). So a blocked fork reports UP to the conductor, and the conductor brings in codex/fable.
This delegate-when-blocked rule is wired into the hourly orchestration loop.

## A GREEN GATE IS NOT A CLAIM ABOUT WHAT THE USER FEELS (2026-07-27, cost the user a usable app)

The statics anchor migration passed a FULL gate ALL-PASS — 69 OK steps, `RETRY TALLY: clean
green`, `idle-quiescence violations=0` — **twice**, and made the app unusable within minutes of
the user opening it. Two idle instances burned 52% and 65% CPU while a pre-migration instance sat
at 0.8%. Reverted; the user confirmed the revert fixed it.

  **The gate proves the properties it encodes, and nothing else.** It never claimed the app stays
  responsive under the user's real conditions — their workspace, LSP, git watcher, open files —
  because no contract measures that. A clean green is evidence about the contract set, not about
  the product.

Operating rules that follow:

- **Optional cleanup carries all the risk and none of the reward.** This migration was explicitly
  "mechanism cleanup, not a fix for a live defect" — nothing was silently recomputing. A change
  that buys nothing must clear a HIGHER bar than a fix, not the same one, because a fix at least
  pays for its risk. When a 144-file refactor's stated benefit is "one mechanism instead of two",
  the correct question is not "is it green" but "what would it cost us to be wrong".
- **On a live user outage, REVERT optional work before diagnosing it.** Reverting took four
  minutes and restored a tree that had run all day; diagnosing took an hour and produced three
  refuted hypotheses. Prove equivalence by `git diff` against the last known-good tree — do not
  infer it — then diagnose on a branch. Park the reverted merges under `reverted/<name>` tags so
  nothing is lost.
- **Re-landing needs the missing contract FIRST, red-then-green.** Do not re-land a change the
  gate could not see until a contract exists that WOULD have caught it. Otherwise the second
  landing is the first landing with more confidence and no more information.
- **CPU that RISES with uptime is accumulation, not per-operation cost.** 52% at 45 s and 65% at
  4:57 is the signature of undisposed effects/listeners, not of a slower instruction. A fixed cost
  does not grow. Read the trend before theorising about the mechanism.
- **Headless is not a reproduction of a PTY app.** Booting with `> log 2>&1 < /dev/null` and
  measuring 1–2% CPU proves nothing: the render loop may never run. Reproduce with a real PTY
  (`PtyTestDriver` / the harness / `bun run drive`) or you have built an instrument that cannot
  fail — the exact defect class this file warns about, committed while diagnosing it.

## Stop a monitor in the ACTION that consumes its result

A gate monitor exists to tell you the verdict once. The moment you act on that verdict — land the
merge, revert, re-gate — `TaskStop` it in the SAME action. Not "later", not "when convenient": the
landing and the stop are one operation, exactly like arming a replacement monitor and stopping its
predecessor.

Left running, it expires on its own timeout and emits a "[Monitor timed out — re-arm if needed]"
line long after its subject is history. Each one is individually harmless and collectively it is
noise that trains you to skim monitor events — which is precisely the channel that must stay
trustworthy. Five of these accumulated on 2026-07-27 alone.

## Merge safety (each of these cost real time when missed)
- **Commit before gating.** A green gate on an uncommitted/staged tree is NOT durable —
  `git worktree remove --force` discards it (this lost a whole task's work once). The commit is
  the safe signal.
- **Gate the COMBINED tree, and re-check at LANDING time.** A branch cut from an OLD main must
  `git merge main` FIRST, then gate — otherwise you validate the wrong (stale-base) code. This is
  not only a pre-gate condition: **a green gate names the COMMIT it ran on, not the branch.** If
  main moved while the branch sat (it does — landings are hourly), the green was earned on a tree
  that no longer exists, and merging produces a combined state no gate has seen. Nearly landed
  #149 on such a green on 2026-07-27: gate green at `1d72df0`, but #137 had landed meanwhile, so
  the merge-base was three commits back. Merge main in and re-gate; it costs one gate cycle.
- **Verify branch scope with `merge-base`, NEVER `main..HEAD`.** When main has moved, a
  main-relative diff reports main's newer additions as **deletions by your branch** — and
  "this branch deletes the driver we shipped an hour ago" is the one finding that would make you
  refuse a merge. #149 showed `scripts/harness/Drive.ts | 512 ---------` and deleted nothing.
  Use `git diff --stat $(git merge-base main <branch>)..<branch>`, and when a deletion still looks
  alarming, confirm with the positive control: `git diff --name-only $BASE..$BRANCH | grep <file>`
  → empty means main gained it, your branch did not remove it.
- **Count ROOT gates** (a real `merge-gate.sh` process), never `pgrep -c` name-match — transient
  smoke children inflate the count and cause false cap-1 self-blocks. When gates run as tracked
  background children they don't reparent to ppid=1 either, so **gate-LOG step activity is the
  authoritative liveness signal**, not process topology.
- **One checkout, one writer.** Worktree-per-writer is mandatory for concurrent agents. The main
  session and its own fork writing the same checkout collide (renames swept into the wrong
  commit). Give each agent a topology note at spawn (who you are, who your children are, who
  commits, who else writes here).
- **Advance main — NEVER `update-ref` a branch checked out in ANY worktree.** Here `main` IS
  checked out in the primary `/home/parallels/dev/tui-editor` (the user runs Invar from there).
  `git update-ref refs/heads/main <new>` moves only the pointer and leaves that worktree's index +
  files on the OLD commit — a phantom "staged revert of the last merge" that also serves the user
  stale code (this bit us; `git reset --hard <new>` repaired it). Advance a checked-out branch by a
  merge that moves the files too: `git pull --ff-only` / `git merge --ff-only` IN that worktree, or
  merge in a separate worktree and push to origin. Reserve bare `update-ref` for a ref that
  `git worktree list` confirms is checked out NOWHERE.
- **Untracked files don't travel with `git merge`.** Before merging an agent branch,
  `git status` its worktree + `git add -A` — a SKIP is not a PASS.

## NEVER SEARCH FOR A PROCESS YOU INTEND TO KILL (cost two builders on 2026-07-26)

`pkill -f "merge-gate.sh"` — meant to stop one gate — killed two BUILDER agents, because every builder
brief contains the sentence "do NOT run `scripts/merge-gate.sh`", so their command lines matched. One
builder lost ~25 minutes of uncommitted work. **An agent carrying instructions ABOUT a tool is
indistinguishable from that tool to a text search over command lines.**

The rule, and it is absolute:

- **NEVER `pkill`/`killall`/`pgrep -f` with a pattern that could appear in a brief, a prompt, or an
  argument.** Every tool name we write about appears in some agent's arguments.
- **Stop a gate with `bash scripts/stop-merge-gate.sh [worktree]`.** The gate publishes its pid; the
  script positively identifies the process (cmdline AND cwd) before signalling, kills the process GROUP
  derived from that pid so the worker pool goes with it, and **refuses, killing nothing, if it cannot
  identify a gate.** A refusal is always cheaper than destroying work.
- **To stop a builder, resolve the pid from its working directory** and kill only that:
  `for p in $(pgrep -f "^codex exec"); do [ "$(readlink /proc/$p/cwd)" = "/tmp/conductor-X" ] && kill "$p"; done`
  — the cwd is the identity; the command line is not.
- Before any kill, state which of the two reasons applies: killing to SEQUENCE (legitimate) or killing to
  DIAGNOSE (never — it destroys the evidence you were about to read).
- A builder killed mid-flight loses everything uncommitted. Restarting it is not free and the work is not
  recoverable, so treat a kill as a destructive operation with the same care as `git branch -D`.

## Never destroy recovery points (branches, worktrees, files)
Destructive git ops are irreversible and have already caused real data loss here (a
`git worktree remove --force` on an uncommitted tree discarded a whole task). **Preservation is
the DEFAULT; destruction requires explicit, per-instance user authorization.**
- **Never delete a branch** (`git branch -d/-D`) without the user explicitly OK'ing that specific
  branch. Not as cleanup, not because "it's merged", never as a side effect of finishing.
- **Never `git worktree remove --force`.** Plain `git worktree remove` (which refuses on a dirty
  tree) is allowed ONLY after verifying the branch's work is committed AND merged (tip reachable
  from `origin/main`) — and even then the BRANCH stays; you only reclaim the worktree's disk.
- **Never force-overwrite work:** no `git push --force[-with-lease]`; no `git reset --hard` /
  `git checkout -f` / `git clean` that discards uncommitted or unmerged changes; no `update-ref`
  that rewinds a branch. (A `reset --hard` to SYNC onto a commit that already contains all the
  work — zero loss — is fine; verify with `git status` first. When in doubt, `git stash`, don't
  discard.)
- **"Done" is a MARK, not a delete.** When a worktree/branch's task merges, record it finished and
  LEAVE it in place: `git tag finished/<branch> <merge-hash>` (an immutable recovery point,
  greppable via `git tag -l 'finished/*'`) and add a line to `project.delegation-log.md`
  (branch · tip · merged-into · date). Cleanup of accumulated finished branches happens ONLY in an
  explicit, user-authorized sweep — never inline, never automatic.
- **Abandoned ≠ deleted — mark it ORPHANED.** A branch that will NEVER merge (superseded, a dead-end
  experiment, otherwise abandoned) is NOT deleted either. If it has unique commits worth keeping as a
  recovery point: `git tag -a orphaned/<branch> -m '<why abandoned>'` + a `project.delegation-log.md`
  line. If it's empty / DOA (no unique commits vs main — nothing to preserve): a log line alone is
  enough, no tag. This completes the model — every branch is ACTIVE (untagged; a live worktree/agent),
  FINISHED (`finished/`), or ORPHANED (`orphaned/`); the two terminal states are MARKED, never deleted,
  and greppable (`git tag -l 'finished/*'` / `'orphaned/*'`). Pruning orphaned branches happens only in
  an explicit, user-authorized sweep.

## Liveness & visibility
- **A task is `in_progress` only while a NAMED builder is driving it.** The status is a claim about
  the fleet, so it needs the same evidence as any liveness claim: a worktree, a brief, a log. With no
  driver, set it back to `pending` — an item that looks attended gets no pressure, so a lying status
  outlives an honest backlog.
- **Verify, don't assume.** Key on fork-specific evidence only: worktree writes in the last
  cycle, gate-log transitions, new branch/main commits, and the builder's own PTY processes
  resolved by `/proc/<pid>/cwd`. NEVER treat the
  user's own interactive instances as fork liveness, and never kill them.
- **NEVER key a verdict on your own vocabulary appearing in content the builder processes.**
  Argv is the famous case — a brief's TEXT matches its own tool names — but the class is wider
  and the argv-only phrasing let it back in: a monitor grepping a builder's LOG for
  `quota|rate limit|401` fired a QUOTA BLOCK on both live builders, because line 474 of the log
  was repo documentation reading *"CAUTION: it consumes Codex quota"*. The builders were 90
  seconds in and healthy; the monitor stopped itself on the false verdict. Same shape as
  `pgrep -f` matching its own argv, grepping for my own wording of a rule the builder had
  rephrased, and `sed` re-matching a duplicated bare value. **A log contains the brief, the
  docs, and the agent's narration of both — so it contains every word you would search it for.**
  Key on STRUCTURE instead: an exit-code sentinel the wrapper writes, process existence resolved
  by cwd, log mtime via `-mmin`, commit counts. Those cannot be uttered by the thing being
  watched.
- **Commits are the #1 progress signal — and a `find … -not -path '*/.git/*'` MISSES them.** A
  worktree-writes scan that excludes `.git/` makes a just-committed agent look idle. Always include
  branch-commit detection (`git -C <wt> rev-list --count origin/main..HEAD`). And external snapshots
  (transcript mtime, git status) LAG an in-flight agent — hold "stalled/uncommitted" diagnoses
  loosely; a suspected-dormancy nudge should ask the agent to SELF-REPORT (authoritative), not assert
  a stall. The nudge is harmless when wrong.
- **`find -newermt '-10 minutes'` matches NOTHING — use `find -mmin -10`.** GNU find parses that
  argument as a date, and the leading-minus relative form is not the relative-past spelling it
  expects, so the scan silently reports zero writes for worktrees that are actively being written.
  This probe has failed toward "dead" three separate times, once for three live builders at once —
  and a liveness probe that can only fail toward "dead" is how you take over work that was fine.
  Every liveness scan gets a POSITIVE CONTROL in the same command: `touch <wt>/.liveness-probe`
  first, require the count to be ≥1, then delete it. If the control is missing, the probe is broken,
  not the builder. Cheapest cross-check with no date parsing at all:
  `find <wt> -type f -not -path '*/.git/*' -printf '%TH:%TM  %p\n' | sort -r | head`.
- **Arm a Monitor on a long gate's log** whose result must be acted on — the tracked-bg completion
  re-invoke is unreliable (agents go dormant on finished gates). A Monitor on the named gate log wakes
  the agent reliably; the loop-check is the floor under it.
- **Tracked background, never nohup.** Run every gate/long command as a TRACKED background child
  (the harness re-invokes you on completion and keeps you visible in /tasks). `nohup … &` leaves
  you with no live children and the harness drops you from view.
- **Run parallel gates within the machine's soft resource ceiling.** Keep
  sessions and artifacts PID-namespaced, and cap the product of gates and pool
  workers. Do not clear a PTY-harness red by rerunning it alone: a blocking
  verdict must survive contention, so a solo-only green is evidence of an
  environment or ordering defect. Keep builders out of gate windows because a
  builder may enter its own verification phase without warning.
  LANDING INVARIANT SIGNAL (2026-07-25): the gate's end-of-run "encode the invariants" reminder
  is read by NO ONE (builders bypass via SKIP_GATE; conductor sentinels grep only GATE_EXIT/FAIL)
  — its function lives in brief requirements + this check: AT LANDING, before the ff-push, run
  `git diff --stat <main>..<tip> -- '*.invariants.md'`. Code-diff with ZERO contract changes is a
  two-second question, not a block: did this landing genuinely teach nothing? (Refactors with
  zero-behavior-change contracts often legitimately answer yes; features rarely do.)
  CLEARANCE PROVENANCE (2026-07-24, learned the hard way): a rerun only clears a red if it runs the
  EXACT COMMITTED TIP being landed — `git status` the worktree and diff the failing smoke file
  between the gate's tree and the rerun's tree first. If the file differs (e.g. the builder's
  worktree carries an uncommitted smoke repair), the green rerun proves nothing and the red may be
  DETERMINISTIC: sbrate's agent-pane-ux red pattern-matched "load flake" perfectly yet was a real
  glyph-assertion break, briefly landing a red smoke on main. The thing you verified must be the
  thing you land.
- **Heartbeat over PID-watching.** PIDs rotate every turn; give long workers a heartbeat artifact
  (phase + last-progress timestamp + done-flag) so "still building" ≠ "done-and-stranded" ≠
  "crashed". File mtimes are the fallback read.

## Compaction resilience
Long autonomous runs must survive context compaction. Keep a `HANDOFF.md` with a
`MUST RE-READ ON RESUME` ordered doc list, refreshed every few turns by **reconstructing from
disk** (git log, gate logs, worktree state), not from the dropped summary. A parent can't see a
child's context %; detection is behavioral (re-reads, re-litigation) or self-reported. A parent
CAN force-compact a child on a chosen boundary by sending a message whose content *begins with*
`/compact <focus>` (a background agent can't self-invoke it).

## Instantiating a fresh conductor (resume after context loss)
This skill (doctrine) + `project.conductor.md` (lessons) transfer the METHOD — but NOT the live
build state or the fleet. A clone needs all three. Read in this order:
1. `CLAUDE.md` → `AGENTS.md` → this skill → `project.conductor.md` (conventions, doctrine, lessons).
2. `project.handoff.md` (its TOP resume anchor = current status) → `project.progress.md` (task ledger).
3. Project frame: `project.brief.md`, `project.requirements.md` (the north star), `project.architecture.md`, and the `/ibr`, `/ivue`, `/invariants` skills.
4. **Ground-truth the docs against reality** — docs lag, git is authoritative: `git log --oneline -15 --all`, `git tag -l 'finished/*'`, `git worktree list`, `git status`.

**DURABLE vs EPHEMERAL — the load-bearing distinction for resume:**
- DURABLE (survives context loss, lives in the repo): commits, branches, `finished/*` tags, the
  `project.*.md` docs, the skills, `.claude/settings.json` guardrails.
- EPHEMERAL (dies with the session — must be RE-ESTABLISHED, never assumed alive): background
  agents (the fork + workers — their agent-IDs are gone; you cannot reattach, only respawn an
  equivalent for genuinely unfinished work), crons (loop-check + hourly — recreate via CronCreate),
  harness PTY sessions and their temp roots, and the session-local scratchpad HANDOFF.

On resume: read the anchor for what was in flight → verify each in-flight branch/worktree by git →
respawn missing crons → respawn a worker ONLY for unfinished work (never duplicate a live one) →
refresh `project.handoff.md`'s top anchor from disk every few turns so the NEXT clone starts from
truth. The scratchpad HANDOFF is a convenience mirror; the committed `project.handoff.md` is the
one a clone will actually find.

## Verify by driving
Verify EVERYTHING by driving the real user path — the **PTY harness** (`PtyTestDriver` +
frame probe) — never internal values. **The PTY harness is THE driving mechanism**; see Rule Zero,
this is also the builder's inner loop, not only the gate's instrument.

> **tmux is LEGACY and demoted.** ~44 `*_full_tmux_smoke` registrations survive as an opt-in audit
> tier that the gate SKIPS unless `INVAR_FULL_TMUX=1` (weekly/audit runs). Per #105 an unrun smoke
> is not coverage — it is a file that LOOKS like a contract. Never write a new tmux smoke; port or
> extend a PTY-harness one. Reproduce before diagnosing. Ratchet a verified behavior into a gated smoke so it can't
silently regress.

**Smoke-coverage ratchet (on every ALL-PASS gate).** A green gate only proves what the smokes
actually DRIVE — an invariant with no driving smoke is a silent hole (the drag-select regression:
the "scrollable surface is drag-selectable" invariant existed, but no smoke drove the hover card's
drag, so the gate stayed green while it broke). So on ALL-PASS, ask: *did this change touch or add a
LOAD-BEARING, user-facing behavior that no smoke drives?* If so, ratchet it in. Rules:
- **Regression → permanent smoke (HARD).** Every user-flagged bug fix MUST land with a driven smoke
  for that behavior, so it can never silently regress again.
- **Invariant without a driving smoke = a coverage hole** — prefer to close it. A future checker that
  maps invariants↔smokes (by annotation) and flags the un-driven ones makes this objective, the way
  `check_invariants --refs` did for annotations. Build it when there's slack.
- **Guard against smoke bloat (the gate is a ~7min time budget).** Grow coverage in ASSERTIONS folded
  into existing PTY-harness smokes rather than new scripts; add a NEW smoke only for a genuinely new
  surface. Only load-bearing, user-relied-on behaviors earn a smoke — not every internal detail. An
  unrunnably-slow gate destroys the doubt-elimination it exists to provide.

**When a diagnostic is SELF-CONTRADICTORY, suspect the instrument, not the system.** A value that
cannot occur — an errno the syscall never returns, a count that contradicts a check made two lines
earlier, two mutually exclusive impossible values at one call site — means the number does not belong
to the event it is attached to. Stop reasoning from it immediately; every conclusion drawn downstream
is drawn against a lie. This is how `OpenPty F_SETFL failed with errno 9 / errno 11` survived two
write-offs as an "infrastructure flake" on 2026-07-26: `EAGAIN` is impossible for `F_SETFL`, and
`EBADF` contradicted a successful `F_GETFL` on the same descriptor in the same synchronous function.
The contradiction was the finding.

**"Nothing asynchronous ran in between" does not mean nothing changed.** Single-threaded-therefore-safe
is valid only for state no other thread can touch. The moment the resource is an OS handle — a file
descriptor, a lock, a shared mapping — the JS event loop is not the whole story, and a runtime's own
I/O threads can mutate it between two synchronous statements. On 2026-07-26 this reasoning made me
dismiss a real descriptor-theft bug as an "infrastructure flake" twice: `F_GETFL` succeeded and
`F_SETFL` failed a few statements later, which I called impossible. The closer was Bun's read stream on
an I/O thread, and the victim was a DIFFERENT object than the one being disposed. **Using a valid
argument to declare an observation impossible is how you end up rejecting the evidence instead of the
model.**

Corollary for briefs: **when a rival hypothesis is cheap to separate, find the separating observation
BEFORE writing the brief.** The tell was already in the data — `F_GETFL` fails as often as `F_SETFL`,
and `F_GETFL` ignores the argument my hypothesis blamed. What saved the task was briefing an EXPERIMENT
(probe before belief, named rivals to reconstruct, "say so plainly if the number comes out zero")
rather than a confident cause. A brief written as an experiment survives being wrong; one written as a
diagnosis does not.

Corollary for probes: **a lifetime or ownership defect needs at least two participants in the
experiment.** A probe that creates one object, exercises it, and disposes it cannot see a theft, because
the corruption requires a close to overlap a LATER allocation. Concurrency in the probe is not a tuning
parameter, it is the hypothesis.

**You cannot demand a quiet machine you are not providing.** When the effect being measured is the
same size as what fleet load adds, do NOT brief "measure on a quiet machine" while running builders —
brief PAIRED sampling: measure the candidate and a fixed reference back to back, alternating, and judge
on the within-pair delta. Load that inflates the candidate inflates its paired reference too. This also
weakens the requirement from "the absolute populations must not overlap" to "the paired delta must
separate from zero", which is the correct claim anyway, and the reference's own readings become a
load-calibration trace. Sequential sampling under varying load does not merely add noise: it INVERTS
bisect steps, and an inverted step sends the search confidently down the wrong half of the range.

**Landing over a red gate — the narrow rule.** Permitted only when the red is proven PRE-EXISTING with
evidence from before the branch existed (an isolated re-run passing, the same failure on an unrelated
branch earlier, a perf-history row predating the branch). Then: name it in the landing report, and file
the defect as its own task with the evidence attached. Blocking user-directed work on a defect already
sitting on main is hostage-taking, not rigour — but "re-run until green" is the same action with none of
the accounting, and is never acceptable.

**Optional instruments are indexed in `project.tools.md` — point builders at it.** Some questions no
assertion can answer: does scrolling FEEL smooth, does popup latency grow with item count, what
graphics tier does this terminal actually negotiate, which reactive reads are unobserved. Those live
as standalone measuring scripts that are deliberately NOT in the gate (they are load-bound, or they
answer a judgement call the gate cannot make). An instrument nobody knows about gets re-invented
badly, so: every instrument gets a row in `project.tools.md` naming its question, its known results
and its gotcha; every brief that asks for a measurement names the instrument to use; and
`AGENTS.md` points at the index so a cold builder finds it without being told.

Two rules that belong with the instruments themselves:
- **A check that can only fail toward "pass" is a decoration.** Give every instrument a positive
  control — plant the defect it claims to detect and require a red — before trusting a green.
- **Replace load-bound verdicts before tolerating them.** A measured duration
  or rate is a function of machine load; widening its tolerance hides the
  signal. Block on ordering or work counts, and retain durations only as
  report-only trends.

**Harness blind spot.** The PTY/SGR harness proves LOGIC but cannot exercise terminal-SPECIFIC paths —
a terminal's mouse protocol (SGR-1006 vs X10, the 223-col clamp), glyph tier, or escape-sequence support.
A real user "break" that won't reproduce in-harness is often such a path (the macOS Terminal.app mouse
case). Do NOT fabricate a code fix for a bug that doesn't reproduce (it ships a no-op) — diagnose the
terminal-capability path defensively from the code, and flag that final verification needs the user's
real terminal, not the harness.

## Loop shape (the hourly orchestration cron)
0. **Verify the loops are actually armed — `CronList` first, every fire.** A cron is session-only
   in-memory state; this file is a durable *copy of the words*, and a copy is not evidence that the
   job exists. On 2026-07-25 the user asked whether both crons were live: the skill said yes, and
   `CronList` returned only the hourly. The 10-minute heartbeat had died in a restart and only the
   hourly was restored, so for an unknown span the floor under builder liveness was gone while the
   doc claimed it was there — the failure was silent precisely because a missing heartbeat produces
   no output. If a recorded loop below is absent from `CronList`, re-arm it from the verbatim text
   *in this fire*, before any other work, and say so in the report. Never infer a cron is live from
   this file, from a previous fire's report, or from the fact that fires have been arriving — the
   hourly arriving tells you nothing about the other one. THE CURRENT PAIR (as of 2026-07-26): the
   hourly orchestration loop, and the 30-minute RECONCILIATION SWEEP at `11,41 * * * *`. The old
   10-minute liveness poll is RETIRED — do not re-arm it (its history is at the bottom of the
   cron-prompts section).
1. **Drain the real backlog first** — the task list (HANDOFF → the numbered UI tasks → polish
   requests → follow-ups). Ensure the fork is driving each unfinished task; nudge or take over.
   No creative experiment while any core task is unmerged.
2. **If blocked** → codex/fable before deferring (see above).
3. **Only once drained** → invent + run ONE creative parity experiment on an `experiment-*`
   branch cut from latest main, gated. **NEVER merge experiments to main.**
   **INVENTORY THROTTLE (2026-07-24):** if **2 or more** gate-green experiments already sit parked
   awaiting the user's adoption call, SKIP invention this fire and hold — report the shelf instead.
   The step's generator is user value, not production count: unadopted inventory only accrues
   rebase drift and review burden, and the adoption signal (which experiments the user actually
   wants) should steer what gets invented next. Resume inventing once the shelf drops below 2.
   When a feature wave has just landed and docs are reality-synced, a stronger alternative to
   inventing is the **generator audit** — the reproducible independent-review procedure in
   `.claude/skills/generator-audit/SKILL.md` (review-as-reduction; first run predicted the
   provider-identity bug before the user reported it). Trigger it deliberately, not hourly.
4. Append lessons to `project.conductor.md` (repo root); AND when a lesson generalizes into durable
   doctrine, **refine THIS skill** (`.claude/skills/conductor/SKILL.md`) and commit it — the loop is
   explicitly allowed to improve its own method (IBR self-application), including the verbatim cron
   prompts recorded below, which it keeps in sync.
5. Keep the fleet alive; sync local main to origin/main (clean ff). Report concisely.

## Live cron prompts (verbatim — the running loop's exact words)

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

## Gate concurrency

Run gates concurrently when useful; cap the product of gates and pool workers
to the machine's CPU, memory, and inotify capacity. Blocking verdicts are
ordering- and count-based, so another gate's load does not invalidate them.
The input-byte millisecond series and FPS canaries remain report-only.

Keep builders as the blocker. Before launching any gate, including an
implicitly gated `git commit`, enumerate live builder processes by exact
process name and resolve their working directories through `/proc/<pid>/cwd`.
Wait while a builder may still enter its own verification phase. Do not infer
builder idleness from quiet logs.

Treat gate process searches as informational only. Never wait on a `pgrep -f`
pattern that appears in the waiting command, and never act on a command-line
match without resolving its working directory. A gate publishes its own PID;
use that identity for stopping or monitoring it. Give every long wait a deadline
and a distinct expiry line in its log: a wait that can never fire is
indistinguishable from one still waiting, and one such waiter spun for 24 hours
before anyone noticed its gate had never run.

Keep every gate's application sessions and failure artifacts namespaced.
Land serially even after speculative gates run in parallel: each landing
changes the combined tree and may require the remaining branch to integrate
and verify again.

Use deliberate contention as a robustness probe. A blocking red under load is
a defect in the product or instrument, not grounds to widen a duration
threshold or declare the measurement invalid. The machine-wide quiet lock
belongs only to soft performance reports and never narrows blocking gate
concurrency.

## Diagnosis rules earned 2026-07-25

- A red naming a smoke UNRELATED to the branch's diff: test MAIN first. Retry-once absorbs starvation
  but MASKS races; the same smoke failing across unrelated branches means the defect is on main. Land
  the branch that fixes main before re-gating branches that merely inherited its red.
- After a deliberate-exit action (Ctrl+Q, F10, quit), assert on the EXIT, never on a frame.
- A repro count only counts on a QUIET machine. N-of-N under churn measures the churn.
- Diagnostic probes must run the ENTIRE instrument; a probe that truncates at the suspected wait will
  "confirm" a wrong hypothesis (it did, three times).
- Where syntax cannot decide reactivity or type-shape, use the TYPE (the tsc program the gate already
  builds). A syntactic rule over a reactive codebase produces confident false positives.
- Landing checklist: clean tree; no tracked TASK files; checker verified by BOTH `--all` and `--refs`
  EXIT CODES; blame-ignore hashes proven as HEAD ancestors at landing time; doc-section conflicts
  unioned by RECONSTRUCTION from the authoritative file, never regex splicing; fresh worktrees get
  `bun install` before any instrument.
- Machine hygiene is gate hygiene: full swap or a memory-hungry neighbour produces exactly the
  timeout-class red signature. Check `free -h` and the top RSS consumers before blaming a branch.

## Diagnosis rules earned 2026-07-26

- **An absence found by grep is a HYPOTHESIS, not a mechanism.** "Nothing watches this ref, therefore the
  update never repaints" was tidy and false: a coarse effect read the ref and Vue tracked it
  transitively. Before briefing "X is not wired" as the CAUSE, either break the alleged edge and watch
  the symptom appear, or rank it as one candidate among several with independent evidence. Brief the
  candidates, demand proof-of-fail-before for the primary one, and let the wrong one collapse cheaply.
- **Search for the CONCEPT stem, not a guessed identifier spelling.** `heldKey|repeatRate|keyRepeat`
  found nothing and I declared a feature absent that exists as `accelerationRun`. Ask for `acceler`, and
  read the invariants file — it names features outright. A user correcting a claim that their own feature
  does not exist is almost always right.
- **A `-f` pattern match hits ARGUMENTS, not programs.** `pgrep -f "merge-gate.sh"` matched a builder
  whose brief text says "do not run merge-gate.sh". Identify a running program by cwd, parent, elapsed
  time, or the artifact it writes.
- **Knowing a class does not exempt you from sweeping it.** After any vocabulary or identifier swap,
  search for the BARE token with no quoting assumption and re-run until the search returns nothing —
  `'⌕'` missed `'⌕ file-073'` minutes after I briefed a builder about exactly that coupling.
- **Several smokes changing verdict under load is ONE finding, not several.**
  Find the shared clock, timeout, namespace, or resource dependency and repair
  that generator. Never widen thresholds or restore whole-gate quiet locking
  to hide a blocking verdict that is not load-independent.
