# Brief 424-1 — make assert-after-switch smoke waits into conditions

Read the task file in this folder: two gate reds on one day, two
different smokes, same defect family — a frame sampled right after a
theme/preview switch with no condition wait. Both standalone-green;
they fail only under gate load. Fix the family, not the two sites.

Work order:
1. Reproduce by DRIVING first: run each named smoke under load (run
   the full unit suite concurrently in the background of the same
   machine) until you see at least one red. If a site refuses to
   reproduce under load, say so plainly — do not fabricate a fix.
2. Census EVERY scripts/harness/smoke-*.ts for the pattern: an
   assertion reading frame content immediately after a switch
   (theme, preview, mode) without waiting on the CONDITION it
   asserts. List every site found in the report, fixed or not.
3. Fix: wait on the condition (bounded frame-ordinal retries — the
   frame shows the expected tone/background), NEVER a widened sleep
   or wall-clock timeout. The wait and the assertion are one act.
4. Both arms: after fixing, plant the wrong tone/background once and
   prove the assertion still goes red. Then remove the plant.
5. One verification pass at the end: the two named smokes standalone,
   plus each under the same background load, green.

Rules: do NOT run scripts/merge-gate.sh; do not push; commit on your
branch; READY report in this folder.

End state: report exists; census table in it; both named sites fixed
condition-style; planted-defect red proven; load-run green.

## Invariants in scope
None recorded for harness smokes — refute if you find one binding.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
