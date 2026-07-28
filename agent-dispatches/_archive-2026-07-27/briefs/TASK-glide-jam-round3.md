# ROUND 3 — the contract that blocks you cannot say WHY. Fix the instrument, then the boundary.

Work ONLY in `/tmp/conductor-glidejam` (branch `fix-glide-input-interference`, at `2442d8f`).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to
`/tmp/glide-jam-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Rounds 1 and 2 are ACCEPTED — the impulse queue, 150/150 preservation, 57-58 projection passes,
the runtime-derived settings-applied drive, the layout verdict, and both repaired smokes all
stand. Do not redo them. The full gate is now red on ONE step, in the area your own bycatch
flagged twice.

## What the gate said

```
FAIL behavioral-contracts (felt invariants)
FAIL separated peaks or rapid ceiling duration failed
  (default=19,22,24, raised=19,31,35, delays=211.1,234.7,213.6,201.3ms
```

Input byte latency in the same run was FINE (p50 2.549 ms against a 4.928 ms baseline), so this
is not a performance regression.

## Job 1 — the instrument is the first defect. Fix it before diagnosing anything.

`scripts/behavioral-contracts.sh` lines ~514-528: `accumulation_production_holds` is ONE flag
fusing two independent properties — separated flick peaks climbing, and rapid input sustaining
the ceiling. And then:

- the PASS branch prints `rapidCeilingFrames=$n/$required`, `rapidSequence`,
  `defaultSequences`, `raisedSequences` — rich detail nobody needs when it is green;
- the FAIL branch prints peaks and delays and **omits `rapidCeilingFrames` entirely** — the one
  number needed to tell which clause broke.

**A failure message must carry at least as much diagnostic detail as the success message.** That
is backwards today, and it is why this red needs an investigation instead of a glance.

Split the fused flag into two separately-reported conditions, each with its own message naming
its own measurement — exactly as the settings-applied harness was repaired this session, where
empty-enumeration and uncovered-fields became separate failures. Then the message alone tells the
next reader which property failed and by how much.

Do this FIRST, re-run, and quote the newly-specific failure. Diagnosing a compound assertion by
guessing which half broke is how a five-minute red becomes an hour.

From the numbers we do have, both peak series climb monotonically (19<22<24 and 19<31<35), so
separated-peaks looks healthy and rapid-ceiling duration is the likely failing clause — but treat
that as a hypothesis your new message will confirm or refute, not as the answer.

## Job 2 — the boundary itself (tracked as #144)

This contract promises a fixed number of saturated-tail frames, and it has now produced 23
against 24 THREE times:

- round 1 at an 850 ms candidate cap — which is why 850 was rejected and 900 chosen;
- round 2 at the shipped 900 ms default, on the committed behavioral run (24 on an earlier run
  from identical semantic source);
- this gate run.

So 900 ms did not buy the margin its selection argument claimed. The same input yields 23 or 24
depending on phase. That is the signature of a frame-count assertion whose window is not an
integer multiple of what it counts — the same family as the audio-narration defect found this
session, where a wall-clock phase relationship (the status-bar clock's minute boundary) produced
a perfect 0,1,0,1 alternation that read as randomness until someone printed the sequence.

**Print the sequence over 10 runs before theorising.** A rate hides phase; a sequence exposes it.

Then diagnose what determines 23 versus 24. Candidates to MEASURE, not assume: the cap boundary
falling mid-frame; tick cadence versus the cap in milliseconds; a rounding step in the frame
budget.

Then choose the structural fix:
- assert a property that does not depend on frame phase (total rows travelled, or a floor derived
  from the mechanism rather than from one lucky observation); or
- quantise the cap to the tick so the boundary cannot fall mid-frame.

**FORBIDDEN:** widening the tolerance to 23, and retuning the accepted 900 ms production default
to make the number come out. Both hide the coupling, and you correctly declined both last round.
If you conclude the honest answer is that the contract asserts the wrong thing, say so and change
the contract WITH its reasoning — that is a refinement, not a weakening, but it must be argued
rather than silently applied.

## Bycatch already filed — do not chase

#145 (`smoke-settings-applied.sh` gain-120 premise) and #146 (the 100 ms cap dead zone) are
tracked from your round-2 report. Out of scope here.

## Verification — quote exact exit codes

`bash scripts/behavioral-contracts.sh` **3x** (quote each), plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Plant a red for EACH newly-split condition and quote
both — a split that cannot fail on either side proves nothing. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree
clean.
