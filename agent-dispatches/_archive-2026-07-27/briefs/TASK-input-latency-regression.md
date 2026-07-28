# TASK — Keystroke-to-byte latency doubled and the gate has been calling it noise (#106)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-latency`
(branch `fix-input-latency-regression`, forked from `main`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch and write your report.

## The finding — measured, not suspected

`scripts/harness/input-byte-flush-gate.ts` measures p50 latency from an input byte written to the PTY
master to the arrival of the DEC 2026 end marker. It is the most user-visible number in this product:
how long a keystroke takes to produce bytes. The reviewed baseline is **p50 2.970 ms**, WARN above
3.861, FAIL above 5.940.

`.perf-history/input-byte-flush.ndjson` (14 samples, appended by the gate itself) shows this:

| timestamp (UTC) | p50 ms | p95 ms |
| --- | ---: | ---: |
| 2026-07-24T21:42 | 2.326 | 3.422 |
| 2026-07-25T00:24 | 3.766 | 9.024 |
| 2026-07-26T05:28 | 5.725 | 7.340 |
| 2026-07-26T05:51 | 5.303 | 7.364 |
| 2026-07-26T05:55 | 5.762 | 9.430 |
| 2026-07-26T05:57 | 3.492 | 5.460 |
| 2026-07-26T06:02 | 5.568 | 6.866 |
| 2026-07-26T06:07 | 3.553 | 4.192 |
| 2026-07-26T06:11 | 5.514 | 7.172 |
| 2026-07-26T08:29 | 5.655 | 6.578 |
| 2026-07-26T09:35 | 5.873 | 9.331 |
| 2026-07-26T09:59 | 6.195 | 8.322 |
| 2026-07-26T10:00 | 5.976 | 7.736 |
| 2026-07-26T10:02 | 4.219 | 7.481 |

**Read what this says.** The two samples from 07-24 and 07-25 sit at or near the reviewed baseline.
Every one of the twelve samples from 07-26 is elevated, most of them 5.3–6.2 — roughly double. The
distribution straddles the 5.940 FAIL line, so the gate fails on some runs and passes on others, and
the retry logic ("a real regression fails twice") has been interpreting the passes as evidence of
ambient noise. **It is not noise. It is a regression parked on the threshold.**

Two specific data points that kill the load-only explanation:

- The `09:35` sample (p50 5.873) is a gate run on plain `main` that **passed by 0.067 ms**. Main is
  already carrying this; it stayed green by luck.
- The `10:02` sample (p50 4.219) was taken deliberately on a quiet machine — `uptime` load average
  0.49 — and is the LOWEST of all twelve 07-26 samples, yet still a WARN at 1.42× baseline. Load
  moves the number, but it does not explain the floor moving.

## What to do

### 1. Bisect it. Do not reason about it first.

The regression entered between the `2026-07-25T00:24` sample and the `2026-07-26T05:28` sample. Get
the commit range from the history file's own commit field if present, otherwise from
`git log --since` over that window. That window contains many commits, several of them touching
input, the render loop, the terminal, and the reactive substrate — which is exactly why guessing is
worthless here. **Four separate structural diagnoses were overturned by measurement in this project
last night.** Bisect.

Bisect discipline, because this metric is noisy:

- Each bisect step must take **enough samples to separate ~3 ms from ~5.7 ms**. The gate's own 5
  sessions is probably adequate given the gap is ~2 ms and within-run spread is smaller than that —
  but establish that first by running the gate twice at a known-good commit and twice at a
  known-bad one, and reporting the four numbers. If the populations overlap, raise the sample count
  until they separate. **State the separation you achieved before trusting any bisect step.**
- Run bisect steps on a quiet machine. Other builders are active; check `uptime` before each
  measurement and record it alongside the number. A step measured under load is not a data point.
- Report the full bisect ladder — commit, p50, load average — not just the conclusion.

### 2. Name the mechanism, not just the commit

A bisect gives you a commit. It does not give you a cause. Once you have the commit, explain WHY it
costs ~3 ms per keystroke: what work was added to the input-to-flush path, or what was moved onto it.
`bun scripts/ast-query.ts` (parse-don't-grep, see `.claude/skills/ast-query/SKILL.md`) is the right
tool for tracing the call path. The report must connect the commit to the number through a mechanism
a reader can check.

### 3. Then decide what to do about it, and say which you chose

Three honest outcomes, and it is your job to identify which one applies:

- **A defect** — the added work does not need to be on the input path. Move it off, re-measure, and
  show the number returning toward 2.9.
- **A deliberate cost** — the commit bought something the product needs and the cost is intrinsic. Then
  the BASELINE is wrong, not the code: the reviewed baseline must be re-reviewed upward with the
  justification recorded, so the gate stops straddling. Do not do this silently — this is the escape
  hatch that turns a perf gate into decoration, so it requires an explicit written argument.
- **Multiple contributions** — no single commit owns it. Then report the ladder showing the
  accumulation, and rank the contributors by cost.

Do NOT simply widen the FAIL threshold to stop the failures. That converts a real signal into
silence, and this metric is one a user feels directly.

### 4. Fix the instrument's blind spot

Independent of the cause: the gate's ambient-noise retry treats "passed on the second pass" as proof
of noise. A regression sitting on the threshold defeats that by construction. The history file already
holds the evidence that would have caught it — twelve elevated samples in a row — and nothing reads it.
Make the gate compare against its own recent history, not only against a static baseline: a sustained
shift in the trailing samples is a regression even when individual runs straddle the line. Report-only
is acceptable and preferable to a new blocking rule you cannot yet calibrate; a loud WARN naming the
trend would already have caught this a day earlier.

Give whatever you build a positive control — synthesize a shifted history and require the check to
name it — because a trend detector that never fires looks exactly like a healthy trend.

## Rules

- Full descriptive identifier names, no abbreviations. 80 columns, `.prettierrc`.
- Verify by driving the real path; the instrument here already does that, so keep its boundary
  (input-write → DEC-2026-end-marker arrival) unchanged. If you change the boundary, the history
  becomes incomparable and you have destroyed the evidence.
- Read `scripts/harness/harness.invariants.md` — the record *Input byte latency uses a reviewed gate
  baseline* governs this instrument. If the outcome is a re-reviewed baseline, that record is where
  the justification goes.
- Exact exit codes for every check, never a log tail: `bunx tsc --noEmit`, `bun test`,
  `bun scripts/check-file-grammar.ts`, both invariant checker passes,
  `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh`.

## Coordination

Two other builders are live. **`src/modules/keybindings/`, `src/modules/app/Bootstrap.ts`,
`src/modules/app/HandlerGuard.ts`, `src/modules/commands/CommandDefaults.ts`** belong to the
keyboard-invariant builder; **`src/modules/theme/ThemeIcons.ts`, `src/modules/ui/CompletionPopup.ts`,
`src/modules/lsp/`** belong to the glyphs builder. If your fix lands in the first group, say so in the
report and keep the edit surgical — I will sequence the merges.

## Report to /tmp/input-latency-READY.md

The separation check (two runs at known-good, two at known-bad); the full bisect ladder with load
averages; the guilty commit or commits; the mechanism connecting commit to milliseconds; which of the
three outcomes you chose and why; the post-fix numbers if you fixed it; the trend-check you added with
its positive control; and exact exit codes.
