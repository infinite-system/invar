# TASK — #155: convert the gate to frame-count mode, retire the last clock-gated blocking step

Work ONLY in `/tmp/conductor-framecount` (branch `fix-gate-frame-count`, cut off latest main
`2e6c207`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/framecount-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why this exists — the prize is not tidiness

ONE gate step still blocks on a wall-clock threshold: `input byte flush measurement (5-session
median)`, reviewed baseline p50 4.928 ms, WARN > 6.406, FAIL > 9.856. That single step is why the
machine-wide quiet lock (#84) exists, why a contended run declares `MEASUREMENT INVALID` (#147), and
why gates cannot overlap. **Retire it and the serialization rule retires with it**, so the fleet can
gate in parallel. That is the deliverable; the conversion is the means.

`perf-baselines` is SOFT and does not block — leave its blocking status alone (its own defects are
#154, out of scope here).

## Step 1 — census and CLASSIFY, do not convert blindly

`scripts/behavioral-contracts.sh` measures 130 count-based references vs 10 clock-ish. The 10 are
NOT one population. Classify each into three kinds and act differently:

**(a) CONFIGURED INPUT — keep, converting these is cargo-culting.**
`maximumGlideDurationMilliseconds`, `glideCapEasingDurationMilliseconds`,
`maximumAnimationDeltaTimeSeconds`. These are settings that count-based bounds are DERIVED from,
not assertions about elapsed time. A contract that reads a configured millisecond value to compute
an expected row count is already count-based.

**(b) MEASURED DURATION ASSERTED AGAINST A THRESHOLD — these are the targets.**
The `actual*Milliseconds` family: `actualPauseBeforeMilliseconds`, `actualDelayMilliseconds`,
`actualInputDurationMilliseconds`, `completedFrameGapSequenceMilliseconds`. For each, name the
ORDERING or COUNT property the duration was standing in for, then assert that instead.

**(c) INHERENTLY A DURATION.** If any survive classification, say so with the argument rather than
forcing a conversion that loses the property.

**Report the table before converting anything.** A conversion that changes WHAT is asserted is a
silent contract change, and those are worse than the clock.

## Step 2 — the byte-flush step, which is the whole point

4.928 ms is a PROXY. What the user feels is not milliseconds, it is *"the glyph is there in the next
frame I see."* So the invariant is an ORDERING one:

    the DEC-2026 end-marker byte arrives, and the glyph is present, in the FIRST completed frame
    after the input byte was written — not the second.

Load-invariant by construction, which is exactly why the quiet lock stops being necessary.
`scripts/harness/measure-input-byte-flush.ts` already collects `frameByteCounts` and a
`medianFrameByteCount`, so a count-shaped quantity exists in the same instrument. Start there rather
than building a new one.

**Name the loss honestly, in the report AND in the invariant record.** At 30 FPS one frame is ~33 ms,
so a regression from 4.9 ms to 25 ms would stay inside one frame and PASS. That is a real reduction
in sensitivity, accepted deliberately because:

1. a delay the user cannot perceive is not a defect; and
2. the millisecond series does not disappear — it stays in `.perf-history/input-byte-flush.ndjson`
   with the trailing-trend comparison built in #106, as a WARN that reports without blocking.

**Blocking moves to the frame-ordering assertion; sensitivity moves to the trend. Do NOT delete the
measurement.**

If the frame-ordering assertion turns out to be satisfiable by a build with a visibly laggy
keystroke, the design is wrong — say so and STOP rather than shipping a contract that cannot fail.

## Step 3 — the consequence, which is the actual deliverable

Once no blocking step reads a clock:

- determine whether the quiet lock (#84) can be scoped to the soft perf step only, or retired;
- `MEASUREMENT INVALID` (#147) should no longer be reachable from a blocking step;
- **update `.claude/skills/conductor/SKILL.md`'s gate-concurrency section**: builders remain the
  blocker, but the "one gate at a time" narrowing can go. AMEND THAT RULE IN PLACE — per AGENTS.md a
  skill is an order, not a log: imperative, no dates, no narrative. The dated account belongs in
  `project.conductor.md`.

## Acceptance

- the classification table for all 10, with (a)/(b)/(c) and the property each (b) stood in for;
- every (b) converted, each with a POSITIVE CONTROL: plant a defect that pushes the glyph to the
  second frame (or breaks the ordering), quote the red, then quote the green after removing the
  plant. **A count-based check that cannot fail is worse than the clock it replaced** — this repo has
  six recorded members of that family, do not add a seventh;
- `grep` proof that no BLOCKING gate step compares a measured duration to a threshold;
- the byte-flush millisecond series still recorded and still trend-compared, non-blocking;
- **TWO GATES RUN CONCURRENTLY on this machine and both reach a correct verdict.** This is the driven
  proof that the serialization constraint is gone and it is the acceptance criterion that matters
  most. You may not run `scripts/merge-gate.sh` yourself — so instead, demonstrate the property the
  concurrency depends on: show that every blocking step's verdict is independent of machine load, by
  running the blocking steps under deliberate contention and showing identical verdicts. State
  clearly that the two-gate run itself is left to the conductor.
- `project.invariants.md` and `src/modules/ui/scroll.invariants.md` mechanism text updated wherever
  it cites a millisecond threshold as the gate's authority.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`.

Note: invariant records are cited by ROOT-RELATIVE path (`src/modules/ui/scroll.invariants.md`),
never by bare filename — a bare name silently orphans the annotation. `--refs` must stay at 884
resolved / 67 lattice links / 0 problems or higher.

## Forbidden

- widening any threshold to make a red go away;
- deleting the millisecond measurement;
- converting a class-(a) configured input;
- touching `perf-baselines`' soft/hard status (that is #154).

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
