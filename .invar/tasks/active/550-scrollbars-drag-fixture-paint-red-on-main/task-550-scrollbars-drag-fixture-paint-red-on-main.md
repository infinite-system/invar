# 550 — scrollbars drag fixture paint red on main

Priority: verification-integrity
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

smoke-scrollbars-harness is DETERMINISTICALLY red on main, solo, on the
"<N>-line drag fixture paints in the editor" wait. It has been hiding in
the non-blocking contention tier, so every gate "passed" while the smoke
was actually broken. That is broken gate coverage — a scrollbar behavior
nobody is really testing.

## Evidence (conductor, 2026-08-11)

- 3/3 solo timeouts on current main (post-#547) at "500-line drag
  fixture paints in the editor" (smoke-scrollbars-harness.ts, the wait at
  PtyTestDriver awaitGridCondition). Gets 6 PASSes first (incl the #540
  scrollbar-row assertions), then stalls.
- 2/2 timeouts at #547's PARENT (22f06fd9~1) — SAME wait — so #547's
  render watchdog did NOT cause it; the regression is older.
- Contention-tier appearances (masking it as flake): #354 r3/r5, #547
  gate — those logs cite the 100000-line variant of the same wait.

## Wanted

1. Bisect: the wait is deterministic, so a clean solo repro exists.
   Find the commit that broke "<N>-line drag fixture paints" (candidates
   in today's scroll work: #531 deep-widest wheel fix, #540 scrollbar
   reserves-its-row, or older). git bisect with the smoke as the test.
2. Diagnose by driving: does the drag fixture genuinely fail to paint
   (product bug), or does the wait's condition no longer match what
   paints (smoke bug)? The #540 reserved-row change shifted editor
   geometry by one row — the wait may look for content at a row the
   reservation moved.
3. Fix the actually-wrong thing; ratchet. Both polarities.

## The bar

Never widen the timeout. A deterministic red is a gift — reproduce, fix,
prove green 5x solo. If a landed change shifted geometry and the smoke's
row expectation is now wrong, that is a smoke fix (state it); if the
fixture truly does not paint, that is a product regression.
