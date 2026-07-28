# TASK — #147: a contended measurement must declare itself INVALID, not print a number

Work ONLY in `/tmp/conductor-lockvalid` (branch `fix-quiet-lock-validity`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/lockvalid-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## What happened

Two gates ran concurrently. The `input byte flush latency (5-session median)` step logged:

```
QUIET-LOCK WARNING: 'merge-gate quiet serial tail' waited 120007 ms for quiet-exclusive;
holders: merge-gate quiet serial tail (pid 1854077, quiet-exclusive).
Proceeding unlocked so scheduling cannot wedge the machine.
```

Then it measured anyway, under contention, and printed `session 1/5: p50 5.240 ms` — formatted
exactly like a clean measurement. The conductor read the number, the step name, and the FAIL, and
concluded "latency regression". It was not one. A solo re-run was green with the lock held.

**The degradation itself is a defensible trade** — not wedging the machine is worth something. The
defect is that the degradation does not travel with the RESULT. It appears as a warning line dozens
of lines earlier in a 200-line log, so the number outlives the caveat.

## Fix, in this order

1. **Carry the invalidity into the result.** When the lock degraded, the step must not report a
   comparable number. Either fail with an explicit "measurement abandoned — quiet lock unavailable
   after 120 s, holders: <names>", or skip with that same declared reason. **A missing number is
   honest; a contended number is not.**
2. **Do not append contended samples to `.perf-history/input-byte-flush.ndjson`** — or tag them so
   trend analysis can exclude them. This is the more serious long-tail harm: #106 established that
   the trailing history is what detects a regression parked on the threshold, and silently poisoning
   it with contended samples degrades that detector permanently and invisibly.
3. **Preserve the datum if you can do it safely** — recording it tagged `contended: true` is better
   than discarding it, provided every consumer filters on the tag. If you cannot guarantee every
   consumer filters, drop it.

## Second, separable defect in the same step — fix it too

The failure was NOT slowness. The real error was:

```
error: Input-byte-flush session 2 failed with exit 1
error: Measured Left press 14 did not move the terminal cursor
```

A FUNCTIONAL assertion failure, reported under a step named `input byte flush latency (5-session
median)`. Anyone skimming reads "latency". This is the same defect shape as the fused accumulation
flag fixed in #144: **one label covering two independent failure modes, so the message cannot say
which fired.**

Separate them. A measurement harness that also asserts correctness must report which it failed on —
"measurement invalid", "measurement too slow", and "the driven behaviour was wrong" are three
different verdicts and need three different messages.

## The asymmetry worth encoding

Note in the record: contention biases timing checks toward **false FAILS**, not false passes. Every
timing-adjacent contract here is a lower bound (enough frames) or a latency ceiling (fast enough),
and contention makes both harder to satisfy. So a GREEN under a degraded lock is trustworthy — it
passed while handicapped — and a RED under a degraded lock is ambiguous and must be re-run solo.
If you find a timing contract that is an UPPER bound on a per-unit-time count (where slowness could
cause a spurious PASS), name it, because it would break this asymmetry.

## Positive controls — both required

- Hold the quiet lock from a second process, run the step, and require it to report
  invalid/abandoned rather than a number. Quote the output.
- Make the functional assertion fail while the lock IS held, and require the message to say the
  behaviour was wrong rather than that latency regressed. Quote it.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus the input-byte-flush step run BOTH with the lock free
and with it held. Never read `$?` after a pipeline.

Update `scripts/harness/harness.invariants.md` — it documents the quiet lock, including the
"waits at most 120 seconds, then warns and proceeds unlocked" mechanism, which this changes.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
