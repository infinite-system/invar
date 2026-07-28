# TASK — The scroll throttle and the residual input latency: find the common cost (#110)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-scrollperf`
(branch `fix-scroll-latency-residual`, forked from main at `d61124d`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Commit and report to
`/tmp/scroll-latency-READY.md`. `bun install --frozen-lockfile` first.

## The user's review, verbatim (they connected two open threads)

> "Scrolling is still a bit slowed down than we had before, something is nagging it a bit, if I
> increase the speed Vertical fling ceiling to 320 from default, Scroll accel gain -> 62, Scroll
> friction -> 0.015 that almost gets to how it was before but still i see there is something / some
> calculation that is throttling it, thought at these settings it's almost imperceptible now, still
> we need a fix to make it and KEEP it perfect"

> "1.2ms -> 4.5ms degradation you guys logged should be investigated deeper, could that also be
> causing the scroll slowdown, need deeper investigation"

Their hypothesis is structurally plausible and you should TEST it, not assume it: wheel events ARE
input bytes, so the same per-input-byte cost behind the residual keystroke latency would delay every
wheel notch, and per-notch delay reads as throttled scrolling. Their manual tuning (fling 320, gain
62, friction 0.015) is a SYMPTOM measurement — do not ship tuned defaults to mask a mechanical cost.

## Known ground (read before measuring)

- `.perf-history/input-byte-flush.ndjson`: baseline p50 2.970 (reviewed), 2.326 measured on 07-24.
  The 07-25/07-26 write-queue work raised it to ~5.5-6.2; the setTimeout(0)-clamp fix (landed
  b0ff3ea: inline drain) recovered ~1.2 ms to ~4.5-4.9. **~1.7 ms above baseline remains
  unexplained.** The bisect for it was never completed (builder died mid-task; its brief is
  /tmp/TASK-input-latency-regression.md and its preserved methodology correction: PAIRED
  INTERLEAVED sampling against a fixed pre-regression reference — sequential sampling under load
  INVERTS bisect steps).
- `project.tools.md` indexes `measure-scroll-smoothness` and `input-byte-flush` instruments, with
  the gotcha that a scroll gesture must be sent as ONE PTY write.
- Earlier scroll findings (pre-existing, user-felt): 19-23 fps vs 30 target; 45% peak-velocity
  deficit on consecutive flings (gain derived from decaying velocity).

## The work

1. **Finish the bisect with paired sampling.** Window: 07-25T00:24 → 07-26T05:28 samples, minus the
   already-explained clamp cost. Reference = a commit at the 2.3-2.9 era. Report the ladder
   (reference p50 / candidate p50 / delta / load) and the guilty commit(s) WITH mechanism — what
   work sits on the input-byte path that was not there before. Suspects worth testing, not
   trusting: the write QUEUE itself (buffer copy + queue push per byte batch), the quiescence
   observer, the frame-expectation marking, the dup()'d read stream's extra descriptor. `bun
   scripts/ast-query.ts` for call-path tracing.
2. **Correlate with wheel feel.** At the reference and at HEAD, run the scroll-smoothness
   instrument (same gesture, one PTY write) and report notch-to-frame latency and FPS side by side
   with the input-byte p50. If they move together, the user's hypothesis is confirmed and one fix
   closes both; if not, say so plainly and split the scroll residue into its own finding with its
   own mechanism.
3. **Fix what the mechanism names.** Move the cost off the per-input-byte path. Re-measure paired:
   input-byte p50 AND scroll instrument, before/after, same table.
4. **KEEP it perfect (the ratchet, the user asked for this explicitly):**
   - Re-review the input-byte-flush BASELINE to the post-fix value (the reviewed-baseline invariant
     record in `scripts/harness/harness.invariants.md` is where the justification lives).
   - Build the TREND DETECTOR the earlier brief specified and nobody built: the gate compares the
     trailing history window against the baseline era; a sustained shift WARNs loudly even when
     individual runs pass. Positive control: synthesize a shifted history, require the check to
     name it. Report-only/WARN, not blocking.
5. Do NOT change ScrollPhysics constants/defaults in this task. If after the mechanical fix the
   feel still differs from the user's tuned values, report the delta and the numbers — the tuning
   decision is the user's.

## Verification — exact exit codes

Full checker suite; the paired before/after tables with load averages; three runs of any smoke
touched; coverage declarations; the trend detector's positive control in the suite. Quiet lock:
your measurement runs should take quiet-exclusive (the instruments may already; verify via the
journal /tmp/invar-quiet-lock.journal).

## Rules

Full descriptive names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree.
