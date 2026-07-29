# TASK — the gate's retry population: find the shared causes, one flake class at a time

Main is green and just landed four merges, but it needed THREE quiet retries to get there. The retry
population is the largest remaining source of noise in this repo's verification, and it has resisted
several single-smoke fixes. Your job is to convert retries into either repaired contracts or named,
measured causes — not to make the retries stop being reported.

## Read these first

- The conductor skill's sections on **asking for evidence of a change that will not happen** (this
  repo's dominant defect class, now seven spellings), **a pre-satisfied wait**, and **a repaired
  instrument needs its subject's states enumerated, not the last failure replayed**.
- [scripts/harness/drive.md](../../../../scripts/harness/drive.md) and [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).
- IBR: several of these are probably ONE defect wearing different names. Reduce before repairing. A
  repair that fixes one smoke and leaves its four siblings is a symptom fix.

## THE LESSON THAT SHOULD SHAPE YOUR FIRST MOVE

Today a flake that had resisted four sightings and three investigations turned out to be an
ENVIRONMENT difference, not a timing one. `reserved-chord` failed 12/12 for the conductor and passed
10/10 for a previous builder ON THE SAME COMMIT. Cause: codex ships its own ripgrep at
`~/.codex/packages/standalone/releases/*/codex-path/rg` (verified, 15.1.0 and 15.2.0), which a
codex-launched app inherits, while the conductor's shell has `rg` only as a Claude Code shell FUNCTION
that no child process can inherit. The smoke's Quick Open silently found zero files, and the wait could
never be satisfied.

So before reaching for timing: **for each flaky smoke, ask what EXTERNAL TOOL or inherited environment
it depends on, and whether that dependency is present, absent, or different between launchers.** A
smoke whose subject is absent fails in a way that looks exactly like a race. Enumerate each smoke's
external dependencies explicitly — binaries on PATH, git presence, HOME contents, terminal
capabilities, TMPDIR location — and say for each whether it is provisioned or inherited. Inherited is
the defect.

## The population, with everything already measured

From today's landing gate (`/tmp/final-landing-gate.log`, ALL-PASS in 4m18s, three retries):

- `scrollbars harness` — timeout-class, retried, passed
- `clipboard frame boundary harness` — timeout-class, retried, passed
- `terminal stage harness` — timeout-class, retried, passed

From an eleven-gate census run earlier at plain main (`agent-dispatches/200-pool/report.md` — read it,
it is thorough and its negative finding is sound):

- `terminal-stage` ×4, `scrollbars` ×3, `panel-chrome` ×1, `bounded-list-popup` ×1, `git-watch` ×1,
  `editor` ×1, `clipboard-frame-boundary` ×1
- `markdown` hard-failed once on a missing `| Ragged` preview row (not timeout-class, so no retry) —
  that is #174 and it is a DIFFERENT class; do not fold it in
- fold-dense behavioural contract travelled 995 rows against a 1,000-row shape requirement once — #193,
  also a different class
- Only **1 of 11** gates was retry-clean. An earlier census over 121 gate runs found 33 masked retries
  (~27% retry-clean). The rate is getting worse, not better.

That census established a real NEGATIVE finding you must not re-litigate: **pool concurrency is not the
shared cause.** Its fatal counterexample is a single-worker run that timed out in `scrollbars` with no
pool siblings at all. Failure counts did fall with worker count (3/3 at n=6, 3/3 at n=4, 1/3 at n=2,
1/2 at n=1), so load correlates — but load is not the generator.

## Two specific leads, both already traced

**1. `terminal-stage` still retries although #191 repaired it.** #191 split a compound
prompt-plus-colour predicate and that half is fixed. The failure now observed is a DIFFERENT wait:
`scripts/harness/smoke-terminal-stage-harness.ts:388`, "the expanded tool result shows the current
terminal input". Structural candidate, unconfirmed: the click coordinate at line 378 comes from
`readResultSummary` captured from a snapshot taken at line 363 and is never re-verified at press time.
If the transcript scrolls between snapshot and press, the click lands on the wrong row and the
expansion never happens — which presents as a timeout. Confirm or refute by instrumenting what the
click actually lands on; do not accept it because it is written here.

**2. `scrollbars` waits for "the deep widest line is visible during the wheel drive."** It failed with
and without pool siblings. Ask the enumerate-the-states question: what states can that predicate
occupy, and is there one where the wheel legitimately produces no further motion (a clamp) so the
condition can never become true? That shape has already been found twice in this repo (#187, #198).

## What must be proven

- For EACH smoke you touch: a population separation before and after, at least 10 consecutive runs per
  arm with exact exit codes quoted, plus behaviour inside the six-worker pool. One green run does not
  close a flake.
- A positive control per repair: break the thing you fixed, show the smoke RED with its message, restore
  it, show green. A smoke that passes because its subject is absent is the failure mode here.
- An explicit dependency table per smoke you investigate: external dependency, provisioned or inherited,
  and what happens when it is absent.
- If two or more of these reduce to ONE generator, say so and fix the generator once. That outcome is
  worth more than four independent repairs.

FORBIDDEN: widening any timeout or tolerance; reclassifying a smoke out of the pool to make it pass;
adding a retry; deleting or skipping a contract. If a smoke is genuinely load-sensitive in a way that
cannot be repaired, say so with numbers and propose the contract that would make the sensitivity
visible instead of hidden.

## Scope

Take them in the order above and go as deep as you can on each — partial completion with real
mechanisms beats four shallow guesses. It is fine to return having repaired one smoke and having ruled
out mechanisms for two more, provided the ruling-out is measured.

Do NOT run `scripts/merge-gate.sh` (the conductor owns gating), do not push, merge, tag, or delete
branches.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE
path. Full descriptive identifier names. 80 columns. A fragment, not a substitute for the conventions.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; read the
count off this tree), `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean. Report to
[/tmp/205-flake-population-READY.md](../../../../../../../../../../../tmp/205-flake-population-READY.md): the dependency tables, the before/after run tables with exit
codes, each positive control red then green, any reduction to a shared generator, and everything you
could not establish. An honest partial result with measured mechanisms is the expected deliverable.
