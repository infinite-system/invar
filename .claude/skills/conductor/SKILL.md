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

## BYCATCH ON THE CHANGED TREE CANNOT TELL "I REVEALED THIS" FROM "I CAUSED THIS"

#168 reported eight failing harnesses as *"candidates for defects the old over-broad waits were
absorbing."* Plausible, attractive, and wrong for at least one of them. It ran every harness against
its OWN worktree, which already contained its changes, and never compared against the merge base.

Two minutes of separation settled it:

    smoke-settings-applied at 4e7abd0 (before the change)   exit 0, ALL-PASS, 0 tree errors
    smoke-settings-applied at d9e66e5 (the change alone)    exit 1, FAIL,    10 tree errors

**It was reporting its own regressions as pre-existing findings**, which turned a fix into a red main
and would have sent the next builder hunting phantom historical defects.

**Require in every brief: a bycatch item must state whether it was verified at the merge base.** The
method is cheap and should be named so nobody reinvents it — one `git worktree add --detach`,
`bun install` ONCE, then `git checkout` between commits reusing `node_modules`.

The asymmetry worth noticing: #168 applied this discipline flawlessly to someone ELSE'S change. It
population-separated #178 across two detached worktrees and correctly exonerated it. **Builders audit
other people's changes and trust their own** — the same shape as a conductor who follows a rule where
it is written and misses the case it generalises to.

Corollary for the conductor: when a builder reports bycatch as pre-existing, that is a HYPOTHESIS
inheriting the builder's incentive to prefer it. Verify the first one yourself before converting the
rest — it is minutes, and it changes whether you are opening tasks or reverting a merge.

## THE CLASS IS "ASKING FOR EVIDENCE OF A CHANGE THAT WILL NOT HAPPEN"

Name the class at the right level or the fix reproduces it. This happened in one night:

- **#168** removed 75 waits that demanded "the next completed frame." Correct: an action whose target
  is already painted emits no frame, so the wait could never complete. It even deleted the primitive.
- **#188** then found that #168's OWN replacement did the same thing one level up. It converted the
  editor smoke's loop to a generic `awaitScreenChange`, seeking two new tabs when the fixture had one
  unopened file left. Once that file opened, the next gesture was inert at the last tree row — **no
  screen change could exist.**

The fix for waits-that-cannot-complete introduced a wait that cannot complete. So the class was
never "frame ordinals":

> **A result condition is only safe when the result is REACHABLE.** Frame ordinals are one way to ask
> for the unreachable; a screen-change predicate on an idempotent gesture is another; #187's wheel at
> a clamp is a third. Converting from one to another fixes nothing by itself.

**The question to ask of every wait, in this order:**

1. what must be TRUE after this action? (not "what will move")
2. is that thing FALSE right now? — if it is already true, the correct wait is a no-op, not a timeout
3. what makes it become true, and can that fail to happen in a valid ordering?

Step 2 is the one that keeps getting skipped, and it is the whole defect. #159's mutation had no
publication carrier, #161's settle preceded its own publisher, #168's frame 59 did not exist, #188's
screen change had no cause, #187's clamped wheel had nothing to repaint. Five spellings, one
question unasked.

## REMOVE THE CAPABILITY, NOT THE MISUSE — an API that does not exist cannot be misused

#168 had 75 call sites waiting on "the next completed frame," a pattern an established invariant
already forbade. The obvious fix is to correct 75 callers. What it did instead was **delete the
primitive**: `awaitNextCompletedFrame`, `awaitQuiescence` and `awaitNextCompletedFrameSnapshot` are
gone, verified by a structural post-check reporting zero remaining identifiers under
`scripts/harness`.

The difference is whether the defect can come back. Correcting callers leaves a loaded gun on the
table for the next person who needs "just wait for a repaint." Removing the capability makes the
wrong thing unwriteable.

**When a brief targets a recurring misuse, ask whether the thing being misused should exist.** Three
tells that it should not:

- the misuse recurs across many independent sites (75 callers, 40 files) — a sign the API invites it;
- an invariant record already forbids the pattern, so its existence contradicts the contract;
- each correct use can be expressed as something narrower and more honest — here, "what should be
  TRUE after this action," which three callers turned into a *narrower* claim than the repaint they
  had been asking for.

**Preserve the legitimate neighbour explicitly, or the removal reads as a regression.** Frame counts
over already-completed history stayed and are still used for measurement; only the prediction that
frame N+1 must exist was removed. Counting the past is sound, betting on the future is not, and
#155's frame-count mode depended on that distinction surviving.

Corollary: **a structural post-check is the proof.** "I converted all the callers" is a claim;
`grep` reporting zero identifiers is a fact, and it keeps being true for the next reader.

## A STRUCTURAL FACT IS NOT A PROBLEM — make the change carry the burden of proof

User directive, 2026-07-28, on the editor flyweight work: *we don't have a problem with the current
implementation; if the solution complicates our stuff downstream we should hold off integrating it.
First it has to be proven that the complexity it may provide does not outweigh the benefits.*

An outside review found that every edit allocates four arrays of length n. Verified — the claim is
true. **But nobody has ever reported slow editing.** Those are two different claims and it is easy to
collapse them, because a precise structural finding FEELS like a mandate.

The order that keeps this honest:

1. **Prove the problem is felt.** Measure the thing a user would notice. If it is imperceptible at
   the largest realistic scale, STOP AND REPORT THAT — a well-measured "not worth it" is a better
   deliverable than a shipped optimisation nobody needed.
2. **Prove the benefit exceeds the complexity cost, measured DOWNSTREAM rather than in the diff.** A
   clever structure inside a shared index is paid by every future reader of it, forever — including
   every agent that has to reason about it before touching anything nearby.
3. **Prove nothing downstream got harder.** Enumerate the consumers and confirm each is unaffected.

Such work builds on an `experiment-*` branch and **staying there indefinitely is a legitimate
outcome.** Provenance decides main, not quality: a change can be correct, measured, and elegant, and
still not belong in main because nobody asked for the problem to be solved.

The tell that this rule is being violated: a brief whose first step is "implement the fix" rather
than "establish the cost of not fixing it."

### The sharper test the user named: GENERATIVITY, not cost/benefit

*"It has to prove it's truly an invariant unlock. If a true invariant is found for this, it will
generate solutions downstream rather than block further development — true invariants reinforce each
other. If that does not happen, we do not adopt the complexity."*

Cost/benefit is a judgement call, and once someone is invested in a diff it can be argued either way.
Generativity is CHECKABLE, so make it the acceptance criterion:

- **A true invariant generates.** Finding it makes neighbouring problems easier or dissolves them, and
  it makes neighbouring invariant records SHORTER and more definite.
- **A partial invariant blocks.** It needs exception rules, forces consumers to know things the seam
  exists to hide, and increases branching.

Operationally, and this is what makes it a test rather than a slogan: **name the specific downstream
things that should get easier BEFORE implementing, then report against that list.** A prediction made
afterwards is a rationalisation.

Failure signals, any one of which is disqualifying regardless of the numbers:

- a consumer must know which internal path produced its answer — that is leakage
- an exception rule is required for some case
- branching, states, or hot-path conditions increase
- another invariant record must be weakened or qualified to accommodate it
- the invariant record gets LONGER or more conditional
- it is correct but nobody can explain it in a paragraph

This is the acceptance form of what the repo already knows: a true invariant increases power while
decreasing rules. If rules went up, it was not the invariant.

## READ LOGS AS A SERIES — three regressions hid in numbers that were already printed

Every one of these was reported by an instrument that was working correctly. Nothing compared the
value to its own history, so it took a human reading runs in sequence to see it — and twice nobody
did for a day.

| what hid | the number that was already there |
|---|---|
| input latency doubled (#106) | TWELVE consecutive elevated samples in `.perf-history/input-byte-flush.ndjson`, straddling the FAIL line so the retry read passes as noise |
| gate 17x slower (#172) | `parallel-safe phase 1m22s`, then `0m45s`, then `12m54s`, in three consecutive logs |
| six "separate" flakes may be one (#177) | exactly one retry in four of five gates, a DIFFERENT smoke each time, never a repeat |

**When you have more than two runs of anything, read them as a series before diagnosing any one of
them.** A single run's number is not a fact about the system; the sequence is. The retry-tally shape
was invisible in every individual gate and unmistakable across five.

Two corollaries:

- **A rate destroys the shape.** "50% failure" told nobody anything; a perfect 0,1 alternation named
  wall-clock phase instantly. Always ask builders for ordered sequences, never rates — and apply the
  same rule to your own reading.
- **Prefer making the comparison automatic over remembering to do it** (#179). The conductor
  noticing is the weakest possible mechanism, and it is the one that failed twice.

## KNOWING A RULE IS NOT KNOWING WHERE IT BINDS — ask what the tool actually walks

Three times in one night the same property mattered: **repo checkers walk the FILESYSTEM, not
git, so `.gitignore` does not protect a directory from them.** I knew this. I still got it wrong
twice in a row, in opposite directions:

- I argued AGAINST worktrees at `.invar/worktrees/` because `check-file-grammar.ts` walks the tree.
  It does — but `filesForArguments` defaults to `['src/modules']` and the gate invokes it with no
  arguments, so it never sees the repo root. The fear was misplaced.
- I then moved 1.1 GB of agent transcripts into `tmp/` without asking the same question, and reddened
  the gate with hundreds of `contract not found`. `check_invariants.mjs` walks from the repo ROOT,
  and builders quote `invariant:` lines constantly, so it read agent chatter as source.

Holding the rule as a WORRY produced a false positive and a false negative. What settles it is one
grep per tool — *what root does this walk start from, and what does it exclude?* — and it takes
seconds:

    grep -nE "EXCLUDED|readdir|process.argv|default.*\[" <the-checker>

**A location decision is also a tooling decision.** Before moving a large or annotation-shaped
directory into the repo, enumerate what scans the destination. The gitignore tells you what git
does; it tells you nothing about what the checkers do.

Corollary for exclusions: when you add one, prove it with a POSITIVE CONTROL rather than by the
green that follows. Plant the thing the checker exists to catch, require the red, remove it,
require the green. An exclusion that silently over-reaches looks exactly like a fix.

## EVIDENCE HAS AN AGE — a count tells you history, not status

I called a healthy builder stuck for two consecutive sweeps on two proxies, both of which were
facts about its PAST:

- `grep -c ERROR` returned 7, so I reported it erroring. Six of the seven were startup lines 17-20
  of a log that had reached 14,627 lines. **A count conflates "did this ever happen" with "is this
  happening".** Ask WHERE the last one sits relative to the end, then read what came after it.
- `git status` in the dispatched worktree showed 0 writes, so I reported it idle. Its brief asked
  for a population separation, so it had created its OWN comparison worktrees and was working
  there. **For a measurement-first task, writes in the dispatched tree are the wrong signal
  entirely** — the first phase produces numbers, not files.

Then I over-corrected to "all the errors are in the first 17 lines", which was also wrong: there
were later ones at 4,500 and 13,555, both non-fatal. Correcting a bad read with another quick read
repeats the mistake in the opposite direction.

**What actually establishes a builder's state, cheapest first:**

1. log SIZE GROWTH over a short interval — is output still being produced;
2. log CONTENT at the tail — is it task work or retry noise;
3. task-specific progress markers the brief itself implies (this one printed
   `parallel-safe phase 0m46s` and `12m50s`, which was the deliverable appearing in real time);
4. process liveness by `/proc/<pid>/cwd`;
5. writes and commits — LAST, and only meaningful once the task should be producing them.

I had the log the whole time and read a counter instead.

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


### Second instance, 2026-07-28: I compared one subsystem against the whole frame budget

#169 declined a flyweight conversion because `measure-editor-edit-path.ts` put the wrap-index sync at
1.327-3.763 ms at 100k and under 9.124 ms at 500k, against a 16 ms frame. I called that inside budget.

The user then drove a real 500,000-line file and reported editing as "super slow." The measurement was
not wrong. **The acceptance threshold was.** 9 ms is ONE subsystem; the same frame also runs the fold
projection, the render, the scrollbar sync and the gutter. Sustained typing at 9 ms of sync per
keystroke queues input, so "one keystroke fits in 16 ms" was never the same claim as "typing feels
instant."

The general error: **a component budget is not the frame budget.** When an instrument measures a
boundary rather than the whole path, its number needs a share of the budget, not the whole of it — and
the share has to be stated before the measurement is taken, or the comparison gets chosen to fit the
result.

Two things that made this recoverable rather than expensive. The user's report carried a detail that
NARROWED the cause for free — "even not on the widest line" rules out the champion path #186 fixed and
localizes the cost to the per-edit allocations. And the hand-test shipped a small-file control beside
the large one, so "the app is broken" was excluded before the first question was asked.


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

## A THRESHOLD I HAVE TO INVENT IS ONE I WILL GET WRONG

#169 measured the wrap sync at "under 9.124 ms at 500k" and I accepted it against a 16 ms frame. The
number was real; the COMPARISON was invented. I had no principled basis for giving one subsystem the
whole frame budget, so I gave it the only figure I had, and the user then felt what I had called fine.

The fix is not "pick a better fraction of 16 ms." It is to prefer a formulation that removes the
choice. ivue's flyweight invariant supplies one:

  Everything costs proportional to what's observed; nothing costs proportional to what exists.

Rendered as an acceptance test: **count the array writes and allocations per keystroke, and require the
count to be IDENTICAL at 2k and 500k lines.** No budget to apportion, nothing to argue about, and a
faster machine cannot beat it — where a millisecond threshold is beaten by hardware every year. The
repo already had the idiom from #133: "scale-invariance as the contract, asserted on load-invariant
counts." I did not reach for it.

So, before accepting any performance verdict: **is there a scale-invariant form of this claim?** If
yes, that is the contract, and the millisecond figure becomes a report rather than a gate. Only when no
invariant form exists does a threshold need inventing — and then say out loud that it was invented, and
what share of what budget it assumes.

### Read the SUBSTRATE's invariants, not only the module's

The 2026-07-25 lesson was to read a subsystem's invariants file before changing it, because
Rejected-alternatives sections are a design review that already happened. This is the same rule one
level out. The acceptance test above was sitting in `ivue/examples/.../Flyweight.invariants.md` — our
own substrate, with an impossibility boundary that already forbids what the editor does ("an
interaction whose cost is O(total cells)"; "a full-document recalculation, ever"). The user had to
point me at it. When a decision turns on cost or scale, check whether the substrate has already ruled
on it.

## AN INSTRUCTION IS AN ASSERTION — RUN IT BEFORE YOU HAND IT OVER

I generated a 500,000-line workspace for the user and printed
`bun run start <directory>` as the way to open it. I never ran that command.
`start` is pinned to `bun src/main.ts .` and `AppLoader` reads only
`process.argv[2]`, so the appended path became `argv[3]` and was silently
dropped — Invar opened its own repository instead. The user reported the files
did not exist. They did exist; the instruction was wrong.

This is the same defect the fleet spent the night repairing, in the one place it
reaches a human. I asserted a behaviour without checking it was reachable, and
the failure mode was the worst kind: **correct work looked broken.** A silently
ignored argument is indistinguishable from a missing file.

Every brief I write is full of commands. A command I have not run is a claim I
have not checked, and shipping it to a builder costs a cycle; shipping it to the
user costs their trust in the artifact. So:

- run the command, from the directory the reader will run it from, before writing
  it down — including the ones that look too simple to fail;
- when the instruction is generated by a script, make the script's self-test
  cover its own printed output, not only the file it produced;
- prefer the invocation with no hidden state (`bun src/main.ts <path>`) over a
  convenience wrapper whose arguments you have not traced (`bun run start`).

Corollary worth carrying: a wrapper that accepts an argument and ignores it is
worse than one that rejects it. Silence at the interface is the same defect as
silence in a wait.

## PARTIAL COVERAGE THAT PRESENTS AS TOTAL — the day's most repeated defect

Three instances in one day, each found by someone else, each invisible because the thing
still WORKED — just never on the path that mattered:

- **#197** — the LSP size budget guarded every WRITE (openDocument, syncDocument, synchronize)
  and no READ. Four request methods queried a document we had refused to send, so hover
  returned types while the notice said "language features off."
- **My brief's "Repo law"** — restated a fragment of the ivue rules (anchor, Static/Reactive,
  80 columns) in a way that reads as the complete discipline, so nothing prompts a builder to
  load the actual skill.
- **#196's `EditorFrameAttribution`** — wrapped the document for read counting and forwarded
  most of it, but silently dropped `lastLineChange`. The renderer's document identity could
  therefore never take the new incremental path: a 1.8-second cost, from one unforwarded fact.

The generator: **a boundary that covers part of a surface, with nothing at the boundary that
knows the surface has more.** A guard listing three call sites cannot tell you about the fourth.
A decorator forwarding nine fields cannot tell you about the tenth. A restated fragment cannot
tell you it is a fragment.

So when reviewing any wrapper, guard, adapter, or restatement, do not ask "does it handle the
cases named here." **Enumerate the surface independently — from the interface, from an AST
census, from the producer — and diff it against what the boundary covers.** #197's fix was one
guard at the shared seam rather than four call sites precisely so a fifth method inherits it;
prefer the seam that cannot be partially covered over the list that can.

The tell in all three: it worked, so nothing failed loudly. A partially-covered boundary does
not error — it quietly takes the slow path, or answers when it should decline, or lets a reader
believe they have the whole rule.

## A REPAIRED INSTRUMENT NEEDS ITS SUBJECT'S STATES ENUMERATED, NOT THE LAST FAILURE REPLAYED

Three delivery confirmations for one channel in one day, 2026-07-28. Each replacement was verified
against the failure that had just burned it, carried a positive control proving it caught that case,
and shipped blind to a state neither had met yet:

- *went busy* — one reachable outcome against an already-busy session.
- *no `[Pasted Content]` placeholder* — blind to text TYPED into the composer, which renders as
  ordinary visible lines. Reported success while ~1900 characters sat unsent. **The user caught it.**
- *a probe from the message is gone* — blind to a message that SUBMITTED, because the agent echoes the
  submitted turn into the transcript, so the text never leaves the screen. Reported failure on success.

The right observable had been available all along: the CHANNEL's own state (the composer line),
captured while known-empty and compared afterwards — valid for submit, queue and stuck alike.

**The rule is not about any of those three checks.** It is that a positive control which replays only
the last incident licenses the next one. So before trusting a repaired instrument, ENUMERATE THE STATES
ITS SUBJECT CAN OCCUPY and evaluate the new predicate against every one. Here that was three; the
fixtures should have covered three from the start.

This is the impossibility boundary applied to instruments: name what the check must say NO to, not only
what it must say YES to. A check verified against one state is a check with one tested outcome.

Three corollaries earned the same day:

- **Confirm on the channel, not on the payload's fate.** Every check that guessed *where the message
  text ended up* was wrong for some state; the one keyed on the input surface itself was not.
- **A liveness or rewrite monitor must require EXISTENCE, not just difference.** A monitor keyed on
  "content hash differs from baseline" fired mid-rewrite while the file did not exist, because absence
  hashes to nothing and therefore differs from anything.
- **The same operator applies to FIXTURES, and that is where it cost the most.** #203 extended the
  editor for folding and every latency table in both of its reports used the NESTED fixtures — its
  "unfolded" rows were nested JSON with nothing collapsed, not the flat `.ts` axis. The flat file that
  MOTIVATED the original flyweight work quietly lost its measurement, and that is precisely where the
  user found a regression, by driving, while every count contract stayed green. I read both reports and
  did not notice that a whole axis was missing.

  So: **when work extends a subsystem for a NEW case, re-measure the OLD case.** The new case gets
  attention by construction — it is what the task is about. The old case is where the regression hides,
  because nobody is looking at it and its numbers are assumed to carry over. Require a report to
  ENUMERATE the fixtures and axes it covered *and name the ones it did not*, the same way a repaired
  instrument must enumerate its subject's states. An unnamed axis reads as a covered axis.

  Second-order, and the reason this is doctrine rather than a note: counts were flat and identical
  before and after, verified independently, while the user felt a clear slowdown. When a count contract
  and a human disagree, the count is the one with the narrower view — it measures one currency
  (array writes) and a new cost can arrive in another (comparisons, document reads, snapshot
  validation, first-paint work landing inside the typing window). A green count is evidence about
  counts, not about speed.

## A PRE-SATISFIED WAIT LAUNDERS A NO-OP INTO A GREEN

The reachability class has an inverse that is worse than a timeout, and #192 found
it. `smoke-scrollbars-harness` waited for "any dot anywhere" in the scrollbar as
proof that an edit had painted an overview mark. File-tree and document dots already
satisfied that predicate **before any edit** — and because focus was still `files`,
the driven `End` and `X` never edited anything at all. The smoke then asserted the
result of an edit that had not happened, and **passed.**

So the diagnostic question I already had written down — *is the thing FALSE right
now?* — has a second consequence I had not stated. A wait whose condition is already
true does not merely fail to wait:

- it lets the smoke proceed as though the action succeeded;
- every later assertion runs against a state the action never produced;
- and those assertions can PASS, because the fixture's resting state often satisfies
  them.

A timeout is loud. This is silent, and it is indistinguishable from coverage. The
smoke was green for the wrong reason for an unknown length of time, and nothing in
the retry tally, the coverage ratchet, or the assertion count could see it — the
ratchet counts calls, and every call was still there.

The tell is a predicate that would be satisfied by the fixture at rest. When
reviewing any wait, ask what the screen looks like BEFORE the action, and whether
the predicate is already true of it. If it is, the wait is load-bearing in name only.

Corollary for briefs: when a smoke has been quietly green and then starts failing
after a nearby change, the change may have made a REAL assertion reachable for the
first time. Do not assume the change broke it.

## MY OWN MONITOR ASKED FOR EVIDENCE THE GATE NEVER PRODUCES

On 2026-07-28 I armed a Monitor on `until grep -q 'GATE_EXIT=' <gate log>` and went
back to work. **`scripts/merge-gate.sh` never prints `GATE_EXIT`.** Every older log
containing that string got it from a wrapper that echoed `GATE_EXIT=$?` after the
run. The gate finished at 07:54 with two hard reds; I learned that at 07:58 from the
reconciliation sweep, and the monitor would have spun to its timeout in silence.

This is the night's dominant defect class — asking for evidence of a change that will
not happen — committed by me, inside the instrument whose whole job is to notice the
evidence. It is the second instance in one hour: earlier the same sweep read
`grep … | tail -1 || echo RUNNING`, where the `||` cannot fire because `tail` succeeds
on empty input, so a live gate reported as finished.

Both have the same shape as every wait the fleet has been repairing all night, and
both would have been caught by the rule already written down for probes: **a check
that can only fail toward one answer needs a positive control.** I never once
confirmed the sentinel existed in a log the gate itself had written.

### How to watch a gate I launched myself

Key on what the script actually prints at its two terminal outcomes —
`merge-gate: ALL-PASS` and `merge-gate: FAILURES — commit/merge BLOCKED` — and cover
process death as well, so a crash before either line still wakes the lane:

    until grep -qE 'merge-gate: (ALL-PASS|FAILURES)' "$log" || ! kill -0 "$gate_pid" 2>/dev/null
    do sleep 20; done

If a sentinel is wanted, the launcher must WRITE it:
`bash scripts/merge-gate.sh > "$log" 2>&1; echo "GATE_EXIT=$?" >> "$log"`. Do not
inherit a sentinel from another wrapper's habit — verify it in the target log before
arming anything on it.

Generalises past gates: **before waiting on a string, grep the producer for it.** One
`grep -n` in the script that is supposed to emit it. If the producer does not contain
the string, the wait is already dead.

## THE CONDUCTOR'S OWN NAMING IS PART OF THE TEST ENVIRONMENT

#191's blocker — eight consecutive gate failures, "pre-existing at the merge base",
the hard red that held main all night — resolved to a predicate that required the
text `fixtures` in a themed terminal header. In a task worktree the header read

  `parallels@ubuntu2:/home/parallels/.../191-terminal-stage-compound-p`

clipped at the panel-heading boundary, so the suffix it wanted was **outside the
cell**. The path was that long because I named the worktree
`191-terminal-stage-compound-predicate`.

Two things follow, and the second is the one I did not see coming.

**The predicate was over-specified and the fix is right regardless** — it asserted a
fixture suffix when the behaviour under test was "the header shows shell identity
and a working directory."

**But every observation of that failure came from a worktree**, and the fleet's
worktree paths are the longest paths in this repo *because I choose the slugs.*
Nothing about the product or the user's checkout was involved. "Pre-existing at the
merge base" was true and misleading: it was pre-existing in every environment I had
ever run it in, and those were all mine.

The general form: **a probe that asserts text can be broken by the length of the
path it runs in**, and the conductor supplies that path. Anything keyed to a
rendered path — headers, breadcrumbs, tab titles, status bars — inherits the
worktree name as a hidden input. This is the coordinate-coupling class one level
out: not a hardcoded cell, but a hardcoded *string* whose visibility depends on how
much room the environment left it.

Operationally: keep dispatch slugs SHORT, and when a probe asserting rendered text
fails only in worktrees, compare against the main checkout before believing the
diff. The discriminator is one run.

## A MASS CONVERSION NEEDS PER-SITE PROOF, NOT CLASS-LEVEL PROOF

#168 converted **75 wait sites** off a forbidden primitive and proved the class:
zero identifiers remain under `scripts/harness`, structurally post-checked, plus
10/10 serial behavioral runs green. That proof was real and it was not enough.
Five harnesses have now regressed from that one task — two found by #188, three
more by #189 — and every one failed the same way: the site received the GENERIC
replacement predicate ("the driven input produces an observed screen change")
where its actual claim was specific.

A generic predicate is a PROXY at any site whose claim is narrower than "something
repainted." #189's scrollbar case is the clean example: the wait observed any byte
change in the scrollbar row, so an intermediate 44-cell thumb satisfied it before
the exact horizontal extent arrived. The repair was to observe the claim itself —
`frame.thumbLength < stableHorizontalFrame.thumbLength`.

So when briefing a sweep over N sites, the deliverable is not "N sites converted
and the census is zero." It is: for each site, **the named result it asserts** —
and an explicit list of the sites that legitimately claim only "something
repainted." #168 named three such sites and gave the other 72 the generic wait.
The three it named were right; the ratio was the defect.

Ask for the exceptions to be enumerated, not the conversions counted.

## A RETRY INSIDE THE POOL CANNOT RESCUE A POOL-CAUSED FAILURE

The gate's retry-once runs in the same 60-job pool as the first attempt. So
"retried and still failed" is NOT evidence that a failure is deterministic — for
any load-dependent failure the retry has no discriminating power at all, because
it reproduces the condition it was meant to rule out. Read that line as "failed
twice under load," never as "fails everywhere."

The discriminating run is standalone and quiet, and the honest reading of a
double in-pool failure is "unexplained," not "deterministic."

**The illustration I first wrote here was wrong, and how it failed is the more
useful lesson.** I recorded `reserved-chord`'s two in-pool gate failures as a
confirmed load-dependent flake and briefed it that way. #189 measured it: 5/5
standalone PASS and **3/3 PASS in three actual six-worker merge-gate pools**. It
also refuted the reachability mechanism I proposed, by reading the fixture —
`await Bun.write(...small.txt)` completes before `PtyTestDriver` is even
constructed, so the file cannot still be being written when the query runs.

So the principle stands on its own logic — an in-pool retry cannot discriminate a
load flake, because it reproduces the condition it was meant to rule out — but I
had used it to license a conclusion the measurement did not support. Two gate
failures at one commit and eight subsequent passes is an **unreproduced** red.
Name it that way, and let the builder find the population rather than confirm mine.

## A PROOF STANDARD LIVES IN DOCTRINE OR IT DIES WITH THE BRIEF

#178 required **10/10 pool runs** before promoting a smoke into the concurrent
pool, and proved both of its promotions that way. Nine hours later #170 added a
brand-new smoke to the pool as pool-safe by DEFAULT, with zero pool runs.

The gap is real and worth closing (#190). What I got wrong was the consequence I
attached to it: I wrote that the unproven smoke "became one of two things blocking
main," and #189 then measured it green 8/8. The registration gap did not cause the
red. A gap in evidence is a gap in evidence — it does not become a diagnosis
because a failure happened nearby.

The transferable part: the standard existed only inside #178's brief, and briefs
do not read each other. Any bar worth requiring twice belongs here, in the
checkers, or in `project.tasks.md` — the conductor is the only shared memory
between two builders who never meet. When a task earns a rule, land the rule.

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
