# TASK — #172: the gate's parallel phase went 0m45s to 12m54s. Measure before you explain.

Work ONLY in `/tmp/conductor-gateslow` (branch `fix-gate-parallel-slowdown`, cut off latest main).
Do NOT run `scripts/merge-gate.sh` as a verification step for your own change; you WILL run its
parallel phase as an INSTRUMENT, which is different and is explained below. Do NOT push, merge, tag
or delete. Report to `/tmp/gateslow-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules`.

**THE MACHINE IS QUIET AND MUST STAY THAT WAY.** No other builder is running, deliberately. Your
entire deliverable is a pair of timings; contention destroys it. Do not launch parallel work, and
take the machine-wide quiet lock for each measurement (#84 built it; #147 fixed its
degrade-to-UNLOCKED-but-still-report-a-number defect, so its verdict can be trusted).

## The observation

Three consecutive gates, same machine, same 57 jobs, same 6 workers:

    d5ba738 (14 commits)   parallel 1m22s
    1597f40 (#159)         parallel 0m45s    serial 8m38s
    current (#161+62+63)   parallel 12m54s   serial 5m10s    total 18m29s, ALL-PASS

The serial phase got FASTER and that is already explained — the 8m38s run included a failed
behavioral-contracts attempt plus its retry; the 18m29s run had no retry. **Do not treat serial as
a second data point.** It is the parallel phase, and only the parallel phase, that moved.

## Step 1 — POPULATION SEPARATION, before any reading of code

Run the parallel phase alone at two commits and report both numbers:

- **before:** `1597f40`
- **after:** current main

Same job count, same workers, quiet lock held, three runs each so a single outlier cannot carry the
result. Report the ordered sequence of durations, not an average — a mean hides a bimodal
distribution and this project has been burned by exactly that.

**If the gap does not reproduce, say so plainly and stop.** A slowdown that will not reproduce is
not a slowdown that is gone, but it is also not something to fix by guessing. Report the numbers
and what you varied.

## Step 2 — only if the gap reproduces: which of the three merges?

Bisect across the three merge commits, not across the individual builder commits — they landed as
three merges and that is the smallest honest unit.

**The leading candidate, and it is a HYPOTHESIS:** #161 replaced a 120 ms false-success timeout in
boot with observing OpenTUI's actual `renderer.idle()` before marking the app started
(`src/modules/app/Bootstrap.ts`). Every smoke boots the app, often several times. It is the only
one of the three on a path every job traverses, and the asymmetry fits — parallel runs 57 jobs
where serial runs 5, so a per-boot cost inflates parallel about eleven times harder.

There is a suggestive number already on the record: the same gate's soft perf tier measured in-app
boot at **228, 233, 233, 228, 231 ms**. The timeout that was deleted waited **120 ms**. If those
are causally linked, the old path was declaring the app started roughly 110 ms early on every
boot, and the suite was silently banking that time — which is precisely how a file tree blank on
20 of 20 boots survived to ship.

**Do not report that as the cause until the bisect says so.** Five structural diagnoses were
overturned by measurement in this project in two nights, and one of them was built and shipped as
a fix before it was refuted. The number above is a reason to look, not a finding.

## Step 3 — if it IS the boot change, do NOT revert it

The fix is correct and it closed a real user-visible defect. The question is whether the full
settle must be paid on EVERY boot, or only where an assertion depends on the tree being painted.
Name the options with their costs and recommend one; implement only the one you can defend by
measurement:

- pay full idle everywhere (status quo, correct, slow);
- pay full idle only when a smoke declares it needs a settled first paint;
- find what makes idle take 230 ms and reduce THAT — the most valuable outcome if the settle is
  slower than it needs to be, because it makes the app faster for the user, not just the suite.

The third is the real reduction. Check it before settling for the second.

## Constraints

- **Never widen a timeout or restore the 120 ms shortcut.** That trades a correct gate for a fast
  one and re-opens #161.
- Whatever instrument you build to compare phases needs a positive control: plant a delay in one
  job and require the reported number to move. A comparison that cannot report a slowdown is a
  decoration.
- If the answer is ambient load rather than any merge, prove it — quote load average beside every
  number, and remember the last time contention was blamed here the red turned out to be intrinsic.

## Second, smaller finding in the same gate — report on it, do not fix it here

The soft tier printed `FAIL orphan bun processes from this run: 3340795`. Ninety seconds later that
process had exited on its own with no intervention. So the orphan detector may be sampling while a
process is still shutting down and calling normal termination a leak. Establish whether it waits
for exit or merely snapshots, and say which. If it snapshots, the detector is the defect and that
belongs to #154.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt because it mutates in place. Invariant records
live at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full
descriptive identifier names. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit. The conductor converts them into tasks.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
before/after timing sequences.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
