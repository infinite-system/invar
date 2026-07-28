# TASK — #200: is the POOL the shared cause? Two smokes, one hypothesis. BLOCKS A GREEN MAIN.

Work ONLY in this worktree. Branch `fleet/200-pool`. Do NOT push, merge, tag or delete. Report to
`/tmp/200-pool-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh` — you will need it at several worker
counts, which is the whole point. Take the machine-wide quiet lock for timing runs and check
`/tmp/invar-quiet-lock.journal` for a `degraded` entry afterwards (#183).

**You are in an INTERACTIVE session.** The user can attach and steer. If something is ambiguous, ASK
rather than guessing — a question costs a minute, a wrong assumption costs a run.

## The evidence that makes this one task instead of two

The combined #196+#197 gate on `577fd6b` failed exactly two steps, both RETRY-then-FAIL:

- `smoke: reserved chord harness` — `Timed out waiting for Quick Open selects small.txt from the typed
  query`. FIFTH sighting (#194), and it has failed in the MAIN checkout before, so it is not
  branch-specific.
- `smoke: panel-split harness` — `Timed out waiting for status condition:
  status.panelContentOrder.join(',') === 'agent,terminal' && status.panelCellIds.join(',') ===
  'agent,terminal'`. Previously #192's weakest member, seen once and passing on retry. Now a hard red.

Three facts turn this into a single hypothesis:

1. **Neither smoke, nor its subject (`src/modules/panel`, `src/modules/search`), changed in this tree.**
   Verified by `git diff --name-only a93b7e8..577fd6b` over those paths: empty. So the tree under test
   did not cause either.
2. This gate ran **6 workers**. #196's own final gate — essentially the same code — was **ALL-PASS at 2
   workers**, 60 jobs on first attempt, clean retry tally.
3. Both are POOL members that were never required to prove pool-safety. #178 demanded **10/10 in-pool
   runs** before promoting a smoke; #170 and the panel-split registration never did that (#190).

So the hypothesis is not "two flaky smokes." It is: **pool concurrency is the shared cause, and pool
membership was granted without evidence.** #190 already exists for the mechanism; this task is its
measurement.

## THE MEASUREMENT — do this before touching any smoke

Run the FULL gate at several worker counts on this unchanged tree and report ordered results, never
rates. `INVAR_GATE_WORKERS=<n> bash scripts/merge-gate.sh`.

- `n=6` (default) — N>=3
- `n=4` — N>=3
- `n=2` — N>=3
- `n=1` — N>=2

For each run record: which steps failed, whether on first attempt or retry, and the total time. Then
state which of these the data supports, and say plainly if it supports none:

- **A monotonic worker-count relationship.** Failures appear at or above some n and vanish below it —
  the signature of resource contention. If so, name the resource: the ceilings already measured here are
  ~250 MB RSS per app, inotify `max_user_instances=128` with one instance per app, ~1.5 load per serial
  gate. The quantity to reason about is gates x workers, not gates.
- **Independent intermittents that merely correlate with load.** Each has its own rate at every n.
- **Something else entirely** — say so and show the numbers.

Also run each smoke STANDALONE N>=10 at the same tree. If they are 10/10 standalone and fail in-pool,
that is the population separation and it is the finding.

## THEN, and only then, fix

If the pool is the shared cause, the repair is NOT to widen a timeout and NOT to silently reduce the
default worker count. Two legitimate outcomes:

1. **Reclassify with evidence.** Move the affected smokes to serial with a stated reason, exactly as
   #178 left agent-permissions and overlay-dialog serial. Report the wall-clock cost — #178 bought
   6m31s -> 4m02s and giving that back needs to be a visible decision, not a side effect.
2. **Make them pool-safe.** If a smoke times out under load because it waits on something whose
   arrival is load-dependent, the wait is the defect. Both messages are `Timed out waiting for` a
   condition, which is the right FORM — so ask the harder question: is the condition REACHABLE under
   load? For reserved-chord the top candidate remains #194's: the per-run HOME at
   `/tmp/invar-reserved-chord-home-*` sits directly in `/tmp`, and a project-picker flake was once
   traced to `/tmp` holding 3,752 entries, so scoring scaled with how full the machine's temp directory
   was. Record the `/tmp` entry count beside every run.

**If the answer is that these two must be serial, then implement #190's default inversion as part of
this task**: a smoke is SERIAL unless it declares pool membership with its evidence (date + N/N pool
runs). Grandfather the currently-pooled set with a dated note saying the evidence is historical rather
than backfilling proof nobody took. Positive control both directions: an undeclared throwaway smoke must
run serially, and adding the declaration must move it into the pool.

## Required reading

`AGENTS.md` at this worktree root has the skills index; codex does not auto-see `.claude/skills/`.
For this task load `.claude/skills/ibr/IBR.md` (you are choosing between rival explanations, so reduce
before building) and `.claude/skills/ast-query/SKILL.md` (use `bun scripts/ast-query.ts` for any
structural question about pool registration, never grep). The brief's Repo law section below is a
FRAGMENT, not the discipline.

## Forbidden

Do not widen a timeout or tolerance. Do not lower the default worker count to make the gate pass. Do not
mark a smoke pool-safe without the runs. Do not touch `smoke-editor-harness` or anything in
`src/modules/editor` — #196 just landed there and its contract must stay green.

## BYCATCH

Every defect you SEE, under `## Bycatch`, with exact reproduction, repetition count, and **whether you
verified it at the merge base** — name the commit and show the implicated files had no diff.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is exempt.
Invariant records at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full
descriptive identifier names. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (**zero problems** — do
not chase an annotation COUNT floor; the "930" figure originally written here was carried over from a
different tree and this task's merge base resolves 928. The builder correctly refused to manufacture
two annotations to satisfy it. A count floor is only meaningful when it is read off the tree the task
actually sits on),
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`, the worker-count table,
the standalone sequences, and a full gate reaching ALL-PASS **at the default worker count**.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
