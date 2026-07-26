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

The conductor is the architect / reviewer / integrator that stays out of the implementation
weeds so its context survives a long build. It delegates scoped chunks, reviews output against
contracts, protects the merge line, keeps the fleet alive and visible, and reconstructs state
from disk (never from a dropped summary). The role is real work worth naming — this skill
codifies it so it is not re-improvised each run.

**Evolving detail:** the empirical, run-by-run lessons accrete in
`project.conductor.md` (repo root). Read it before a run; append to it during one.
This SKILL.md is the stable doctrine; that file is the changelog.

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

## When BLOCKED — delegate before deferring
If a task is stuck (an agent can't crack it, the fix is ambiguous, or it's a genuinely hard
problem), **do NOT default to escalating to the user.** Spin up a **codex or fable** subagent
and have it reach a solution creatively. Only escalate to the user when the subagents also fail
OR the decision is genuinely theirs (naming, scope, publish consent, irreversible/outward
actions). `fable` = a subagent on the `claude-fable-5` model (the ivue-rooter model).

**Fork caveat:** a background FORK cannot spawn subagents (its boilerplate forbids the Agent
tool). So a blocked fork reports UP to the conductor, and the conductor brings in codex/fable.
This delegate-when-blocked rule is wired into the hourly orchestration loop.

## Merge safety (each of these cost real time when missed)
- **Commit before gating.** A green gate on an uncommitted/staged tree is NOT durable —
  `git worktree remove --force` discards it (this lost a whole task's work once). The commit is
  the safe signal.
- **Gate the COMBINED tree.** A branch cut from an OLD main must `git merge main` FIRST, then
  gate — otherwise you validate the wrong (stale-base) code. Confirm `git diff --name-only
  main..HEAD` shows only that task's files.
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
- **Verify, don't assume.** Key on fork-specific evidence only: worktree writes in the last
  cycle, gate-log transitions, new branch/main commits, builder tmux sessions. NEVER treat the
  user's own interactive instances as fork liveness, and never kill them.
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
- **Parallel gates are OK now — cap ~2–3 concurrent (soft CPU ceiling), no longer strictly serial.**
  Gates USED to require strict "one gate at a time" because `smoke-settings-applied` launched tmux
  sessions with FIXED names (`sa-sbt-a`…) and read `artifacts/frame-<session>.json` — tmux names are
  global to the one server, so two gates clobbered each other's session + frame dump, a DETERMINISTIC
  collision that threw `IndexError` in the frame probe. Fixed (2026-07-23): every smoke now
  PID-namespaces its sessions (`sa-$$-…`, matching what all other smokes already did), so concurrent
  gates no longer collide — run them in PARALLEL. The remaining limit is SOFT: ~4–5 simultaneous gates
  starve CPU enough to flake timing-sensitive smokes (word-wrap caret, frame-settle). Keep ~2–3
  concurrent; if a smoke fails oddly while several gates run, RE-RUN IT ISOLATED before treating it as
  real (a load flake re-runs green). Over-spawn → tell the fleet to cap. When adding a smoke, PID-
  namespace its tmux sessions from the start, or it silently re-breaks concurrent gating.
  QUIET-MACHINE SURVIVES THE HARNESS ERA (2026-07-24, paid for twice): marker/condition waits
  killed the flake class, but two shapes remain TIME-COUPLED and load-sensitive: (1) ABSENCE
  assertions ("no frame/blame/repaint in this window") — proving a negative needs a clock, and
  load stretches when frames land into the window; (2) any TIMEOUT-bounded wait — load can push a
  legitimate completion past the bound. Therefore: NO builder launches while a gate runs and no
  gate launches while builders churn, exactly as before the harness. "The suite is deterministic"
  is not an exemption — determinism holds for what happens, not for when.
  DETERMINISTIC-INSTRUMENT REDS ARE DEFECTS (2026-07-24): the clearance/rerun protocol exists ONLY
  for timing-sensitive instruments (tmux smokes). A PTY-harness smoke red is never "cleared" by
  rerunning — determinism is its contract, so an in-gate red after solo greens is evidence of an
  environment/ordering defect in the port or driver (first instance: goto-definition's
  frame-ordinal wait — coalescing made frame counts unstable; fixed at the shared seam, rule now
  in harness.invariants.md: waits are conditions or quiescence, never frame ordinals). Diagnose,
  fix at the generator, re-gate. If a harness red DOES re-run green solo, that green is itself the
  bug report.
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
  tmux harness sessions, and the session-local scratchpad HANDOFF.

On resume: read the anchor for what was in flight → verify each in-flight branch/worktree by git →
respawn missing crons → respawn a worker ONLY for unfinished work (never duplicate a live one) →
refresh `project.handoff.md`'s top anchor from disk every few turns so the NEXT clone starts from
truth. The scratchpad HANDOFF is a convenience mirror; the committed `project.handoff.md` is the
one a clone will actually find.

## Verify by driving
Verify EVERYTHING by driving the real user path (tmux harness + frame probe), never internal
values. Reproduce before diagnosing. Ratchet a verified behavior into a gated smoke so it can't
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
  into existing smokes over new slow tmux-launch scripts; add a NEW smoke only for a genuinely new
  surface. Only load-bearing, user-relied-on behaviors earn a smoke — not every internal detail. An
  unrunnably-slow gate destroys the doubt-elimination it exists to provide.

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
- **Normalise a load-bound metric before tolerating it.** A metric measured per FRAME is a function
  of machine load by construction; widening the tolerance to absorb that hides the signal. Convert
  to a load-independent quantity first (per unit time, not per frame), then set the tolerance.

**Harness blind spot.** The tmux/SGR harness proves LOGIC but cannot exercise terminal-SPECIFIC paths —
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
   hourly arriving tells you nothing about the 10-minute one.
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

(4) Append lessons to /home/parallels/dev/tui-editor/project.conductor.md; when a lesson generalizes into doctrine, REFINE the /conductor SKILL.md and commit. If you change a cron prompt, recreate the cron AND update the skill's verbatim copy — the words are the durable artifact (crons are session-only and die on restart; this fire may be running on a restored cron proving exactly that).

(5) Fleet hygiene: verify builders by evidence (worktree writes, gate logs, branch commits — never process counts; never kill user Invar instances). Cap builders ~2-3. ONE gate at a time across the fleet, and the conductor holds its OWN heavy work (tsc/tests/smokes) while any gate runs. Verify by DRIVING the real user path. Keep the user's checkout synced to origin/main (clean ff after each landing; rebase their local doc commits on top when present). Report concisely, timestamp first if the user is away.
```

### 10-minute liveness check — `3,13,23,33,43,53 * * * *` (every 10 min)

```
Loop check (every 10 min): VERIFY — do not assume — that the currently active builder agents (whatever this session has in flight: check recent task notifications / SendMessage pins) are actually progressing. IMPORTANT: the USER runs their OWN interactive Invar instances (from /home/parallels/dev/tui-editor, /tmp/tui-demo, or any /tmp/wt-* worktree they opened) — do NOT treat raw `src/main.ts` process count or instance age as a liveness or hang signal, and NEVER kill a process from those paths. Key ONLY on builder-specific evidence: (1) writes in the active build worktrees (/tmp/wt-*) in the last ~10 min (exclude .git and node_modules); (2) gate-log transitions in /tmp/*gate*.log (ALL-PASS / FAILURES / GATE_EXIT / still-appending); (3) new commits on main or on the active feature branches (git -C /home/parallels/dev/tui-editor log --oneline --all --since='12 minutes ago'); (4) builder jsonl mtimes under ~/.claude/projects/-home-parallels-dev-ibr/*/subagents/. If a builder is DORMANT on a red or finished gate: read the gate log, diagnose the failing step, nudge via SendMessage with the precise fix. If genuinely STALLED across a FULL cycle (no worktree writes, no gate activity, no commits): take over — diagnose, fix, gate, merge. If progressing, note it briefly. ALSO treat a GREEN gate whose branch is still unlanded as a stall — landing is the conductor's job and a finished gate that nobody merges is wasted wall-clock. Flag over-spawn (cap builders ~2-3) and CPU contention. GATES DO NOT OVERLAP LIVE BUILDERS: a gate and a builder's verification phase are the same resource, and 'the builders look quiet' is not a launch condition (a quiet builder reaches its own tests inside the gate's 5-minute window, and log growth is what a READING builder produces). Hold gating while any builder is alive, then drain the gate queue back-to-back on a quiet machine — a re-run costs 5 minutes, a wait usually costs less. Gates MAY run concurrently with each other (two gates 6m04s/6m07s vs 8m03s serial), but a pool phase must not overlap another gate's quiet timing tail until the machine-wide quiet lock lands. Before calling a timeout-class red a defect, ask what else was running and re-run that ONE smoke solo on an idle machine. Report concisely.
```

Refreshed 2026-07-24 after a session restart proved the doctrine: the in-memory crons died, the
verbatim copies here restored them. This refresh generalized the stale specifics (the finished
11-task batch, the stood-down fork id, the old baseline SHA) into evidence-based forms.

Refreshed again 2026-07-25: the 10-minute heartbeat was found **absent** from `CronList` while this
file still recorded it as live, which is what step 0 above now guards. Its verbatim text was also
carrying a superseded rule (one gate at a time) — a stale recorded prompt is worse than none, since
a restored cron would have re-imposed a constraint the fleet had already measured its way out of.
Rule earned: when doctrine in this skill changes, the verbatim prompts are part of the change set,
not a separate chore.

## Gate concurrency (superseding one-gate-at-a-time, as of 2026-07-25)

Two or more gates MAY now run simultaneously. The rule existed because of two shared-namespace
collisions, both fixed in 9f6c617 — the pre-gate reaper killed every `/tmp/tui-*` app (executing a
peer gate's in-flight smokes and producing reds indistinguishable from starvation), and the failure-log
directory was a single path wiped at gate start. An orphan is now PARENT-GONE, and failure dirs are
per-run with a symlink to the latest.

Operating limits, measured on a 16-core box: inotify `max_user_instances` is 128 and each app is one
instance; each app is ~250MB RSS; a serial gate contributes ~1.5 load. CPU binds first at roughly
12-14 CONCURRENT APPS, so reason about the PRODUCT `gates x pool workers`, not the gate count.

**BUT A GATE MUST NOT OVERLAP A LIVE BUILDER (learned the hard way, 2026-07-25 evening).** A gate and a
builder's verification phase are THE SAME RESOURCE. The rule "launch a gate while the builders look
quiet" is wrong twice over: a builder that is quiet at launch reaches its own `bun test` and smokes
minutes later, INSIDE the gate's five-minute window; and "looks quiet" is judged from log growth, which
is exactly what a reading-phase builder produces. Two reds tonight looked identical and had opposite
causes — `smoke-workspace-tabs` failed 1-of-2 SOLO at load 0.28 (intrinsic, a fixture reading the
machine's /tmp), while `smoke-editor-harness` timed out twice with a builder mid-verification
(contention, my scheduling). So: HOLD gating while any builder is alive, then drain the gate queue
back-to-back on a quiet machine — UNLESS a contention red would still be DIAGNOSTIC (e.g. the known
flakes are already fixed and you want a realistic-load validation), in which case take the exception
deliberately and state the reason. Never gate blind while builders verify. And note the reframe: a quiet
machine is a CRUTCH that hides fragility — a smoke that cannot survive load is not robust, it has merely
not been asked. Load is the discriminator (fails only under load = clock/existence-bound assertion;
fails idle = real race or defect; survives both = genuinely poolable). Serial gates on a quiet machine beat overlapped gates end-to-end,
because a re-run costs five minutes and a wait usually costs less.

Diagnosis discriminator: before attributing a timeout-class red to a defect, ask what else was running,
then re-run that one smoke SOLO on an idle machine. It costs about a minute and it separated intrinsic
from contention for two smokes that failed the same way tonight.

The machine-wide quiet lock, when it lands, must therefore be acquirable by BUILDER verification runs
too — not only by gates. A lock only gates respect leaves the largest contention source outside it.

Use concurrency for PARALLEL SPECULATIVE VERIFICATION — gate every ready branch at once to discover
all their defects in one wall-clock window — then LAND SERIALLY: ff-only merges force each branch to
rebase onto the new main and re-verify, and semantic conflicts across landings are routine, not rare.

Treat concurrency as a HAZARD-FINDING instrument too: load-sensitive races are invisible on an idle
machine. The first two-gate run exposed a latent await-after-terminal-action race that dozens of
serial runs had missed.

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
- **Several smokes flaking under load is ONE finding, not several.** Four distinct smokes failed in gate
  runs tonight and all four passed solo on a quiet machine. Rank the machine-wide quiet lock above the
  individual smokes, and never let retry-once turn one missing lock into four phantom defects.
