# TASK — #178: bring the gate from 6m31s to 2-3 minutes, without weakening one blocking check

Work ONLY in `/tmp/conductor-gate2min` (branch `feat-gate-two-minute`, cut off latest main).
You WILL run `scripts/merge-gate.sh` — as an INSTRUMENT, repeatedly, because it is the subject.
Do NOT push, merge, tag or delete. Report to `/tmp/gate2min-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a fresh worktree has no
`node_modules` and every preflight reds on unresolved imports until you do.

**THE MACHINE IS QUIET AND MUST STAY THAT WAY.** No other builder runs, deliberately. Your
deliverable is a table of durations; contention destroys it. Take the machine-wide quiet lock
for every timing run — #84 built it, #147 fixed its degrade-to-UNLOCKED-but-still-report-a-number
defect, so its verdict is trustworthy.

## Where the time is

    parallel-safe phase   0m51s   57 jobs, 6 workers   <- already fast; DO NOT TOUCH
    serial tail           5m16s   7 steps              <- 80% of the gate
    total                 6m31s

Serial tail contents:

    behavioral-contracts (felt invariants)
    smoke: inline rewrite harness
    smoke: agent-permissions harness
    smoke: terminal stage harness
    smoke: overlay-dialog harness
    input byte first-frame ordering + timing trend (5 sessions)
    perf-baselines (memory/CPU/latency)   [SOFT — reports, does not block]

## STEP 1 — make the gate print per-step durations. Nothing else until this exists.

The gate prints three phase totals and no per-step timings. That is why the figure below is an
INFERENCE rather than a reading, and it is the same defect that let a 17x pool regression sit
unnoticed in #172: the instrument was reporting phase totals all along and nothing compared them.

Add per-step duration output to the serial tail, and slowest-N job durations to the pool.

**Positive control, mandatory:** plant a `sleep 30` in one serial step and require that step's
printed duration to move by ~30s. A timer that cannot report a delay it did not cause is a
decoration.

## The one number I have, and how I got it

`gate-panelchrome` serial was `8m38s` INCLUDING a failed behavioral-contracts attempt plus its
retry. `gate-three` serial was `5m10s` with no retry. Delta ≈ **3m28s for one behavioral-contracts
run** — about two-thirds of the serial tail, over half the whole gate.

Two data points. It is the leading candidate, not a fact. Replace it with a real measurement in
step 1 and report both so the inference can be checked.

**A free elimination, already paid for:** serial was `5m10s` BEFORE #172's boot fix and `5m16s`
after. behavioral-contracts did NOT benefit from it, so whatever dominates it is not app-relaunch
cost. Look at the actual driving instead.

## STEP 2 — candidates, cheapest first, each measured before and after

1. **`perf-baselines` is SOFT and in the blocking path.** It cannot fail the gate yet costs
   minutes every run. A step whose verdict cannot stop you should not slow you down. Move it to
   nightly/on-demand — the same placement #77 chose for mutation testing, for the same reason.
   Zero coverage cost. Do this first and report the delta.
2. **Are all five serial smokes actually timing-sensitive?** They are serial because measurements
   need isolation. #155 converted blocking checks to counts and frame ordering — a smoke asserting
   only counts and content may be POOL-SAFE. Promote only ones you can prove.
3. **behavioral-contracts.** The dominant cost and the real sieve. Do NOT thin it blindly. Measure
   which contracts cost what. If one scale or gesture dominates, ask whether the same invariant is
   provable with less driving — #133 established scale-invariance as a RATIO on load-invariant
   counts, and a ratio may need fewer samples than an absolute.
4. **`input byte … (5 sessions)`** — five is a sampling choice. If the trend check is sound at
   three, that is minutes back. Justify from the variance actually in `.perf-history`, not from
   preference.

## The failure mode this task must not have

**Making the gate fast by making it weaker is the entire danger, and it is invisible — a fast
green looks exactly like a fast correct green.**

- NEVER delete or skip a blocking check to save time.
- Moving a SOFT step out of the blocking path costs no coverage. Say so plainly and do it.
- Moving a BLOCKING step to nightly is a real coverage decision. It must be named in the report,
  justified, and recorded as DECLARED DEBT — #105 exists because an unrun smoke still looked like
  a contract for a day.
- Reclassifying a serial smoke as pool-safe requires PROOF: run it in the pool N>=10 and show it
  does not flake.

## Read #177 before you promote anything

There is an open hypothesis that the gate's flakes are ONE shared cause, not many: exactly one
retry in four of five gates, a different smoke every time, never a repeat. If a smoke you promote
starts appearing in the retry tally, that is EVIDENCE FOR #177 — report it as such rather than
demoting the smoke and moving on. Do not fix any individual flaky smoke in this task.

## Acceptance

- Gate still ALL-PASS with the same blocking coverage.
- Before/after per-step table plus totals, quiet lock held, load average beside each number.
- Every reclassification named with its justification.
- Target is 2-3 minutes. **If you can only reach 4, report 4 with the ladder of what remains and
  why** — an honest ladder beats a number hit by cutting a check.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt because it mutates in place. Invariant records
live at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full
descriptive identifier names. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
before/after gate timings.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
