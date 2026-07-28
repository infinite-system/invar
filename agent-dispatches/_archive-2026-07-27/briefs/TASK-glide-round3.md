# ROUND 3 — your envelope changed single-gesture travel; two smokes are red. Quantify, then fix.

Work in `/tmp/conductor-foldfeel` (branch `fix-fold-smoothness`, tip `dc6184a`). No merge-gate, no
push/tag/delete. Append to `/tmp/fold-feel-READY.md`.

Your rounds 1-2 are ACCEPTED (bisect, ceiling-relative envelope, defaults-first tables). The gate
(run 787893) found what your verification set missed — neither smoke below was in your round-2 list:

- `smoke: scrollbars harness` — `Timed out waiting for grid condition: the deep widest line is
  visible during the wheel drive` — FAILED, retried, still failed.
- `smoke: settings-applied harness` — `Timed out waiting for grid condition: the notch-driven
  editor viewport reaches its changed resting position` — same.

Both drive a FIXED notch count and expect a specific travel. Your envelope reserves velocity in
flick one, so a single gesture now travels LESS at a given ceiling. The smokes encode the OLD
physics. (Also in that run: overlay-dialog red — pre-existing, tracked, NOT yours; ignore it.)

## Job 1 — QUANTIFY the single-gesture travel change first (this is the finding)

Drive one 12-notch flick at the default 220, old code vs yours (you have both in git), and report
rows-travelled-to-rest for each. This number is a FEEL TRADE the user must be able to see: how much
single-flick travel was spent to buy accumulation headroom. If the reduction at 220 is large
(rule of thumb: >15%), STOP after measuring and report before fixing smokes — the envelope's
reservation fractions (0.75 gain, 1/3-ceiling cap) may need retuning so flick one keeps more, and
that decision shapes everything downstream.

## Job 2 — fix both smokes to the honest physics

If the trade is acceptable (small reduction), fix the smokes by driving the REAL physics: more
notches or a second gesture to reach the same landmark — never by widening timeouts, never by
weakening the landmark condition. Each smoke keeps proving what it proved (widest-line visibility;
settings-change reflected at rest); only the drive that gets there changes. Run each fixed smoke 3x.

## Job 3 — close your verification hole

Your round-2 list ran editor + code-folding smokes but not the other WHEEL-CONSUMING smokes. Grep
the harness for wheel/notch drivers, list them in the report, and run each once on the final tree.
Momentum is a shared generator — its blast radius is every wheel consumer, and your verification
set must match the blast radius, not the files you edited.

Then full checker suite once, exact exit codes. Drive-first as always.
