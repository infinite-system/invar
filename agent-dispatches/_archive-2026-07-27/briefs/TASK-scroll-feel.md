# TASK — Scroll feel: rest-equivalent fling gain + glide cadence (#121)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-scrollfeel`
(branch `fix-scroll-feel`, forked from main at `4d98ee8`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete. Commit and report to `/tmp/scroll-feel-READY.md`.
`bun install --frozen-lockfile` first.

## Context — what is already settled (do not re-litigate)

#110 landed (4d98ee8): the input-byte path is NOT the cause of scroll feel (notch-to-frame flat
between the pre-queue reference and HEAD). The remaining feel has two MEASURED mechanical
components, and the user has felt both ("something is nagging it"; their manual tuning — fling
ceiling 320, gain 62, friction 0.015 — approximated a fix by inflating everything).

## Component 1 — follow-on fling deficit (the 48 vs 36 rows split)

Measured: first fling from rest travels 48 rows (~190 rows/s peak); the second and later flings of
the SAME physical gesture travel 36 rows (~140 rows/s), because progressive impulse gain derives
from the DECAYING velocity present at gesture start. Fix the derivation: an identical gesture
produces identical travel regardless of residual velocity — gain computed from rest-equivalent
state (or the gesture's own notch cadence), never from what the previous fling left behind.
Momentum COMPOSITION stays (a fling during glide still adds to motion); it is the GAIN CURVE INPUT
that must not be the decayed velocity. Read `ScrollPhysics` / `Momentum` /
`ScrollableTextViewport`; the one-writer, contrary-direction, first-frame obligations and glide
monotonicity are recorded invariants — keep them.

## Component 2 — glide cadence (~20 FPS vs the declared 30)

Find where the frame budget goes BEFORE touching anything: instrument one glide and attribute
frame-to-frame gaps (render-loop pacing? paint cost? timer resolution?). If the loop paces at a
timer whose clamp yields ~50 ms ticks, that is the same defect family as the setTimeout clamp.
Fix the pacing mechanism, not the constant, and show ≥28 FPS sustained on the standard gesture
WITHOUT raising paint cost per frame (bytes-per-frame stays flat).

## Acceptance (instruments, not adjectives)

`measure-scroll-smoothness` (one PTY write per gesture, quiet-exclusive), before/after, same table:
- follow-on fling travel within 10% of from-rest travel (today: 36 vs 48 = 25% deficit);
- sustained glide ≥ 28 FPS (today ~20);
- input-byte-flush p50 unchanged (trend detector is live; baseline 4.928 — do not trip it);
- glide monotonicity, scrollbar thumb stability, idle-quiescence all green;
- DEFAULT constants only if the mechanical fix genuinely needs retuning — report old/new and why;
  the user vetoes feel. Their tuned values are a reference point, not a target.

## Verification — exact exit codes

Full checker suite; three runs of every touched smoke; one loaded run; coverage declarations
(counted grammar, APPEND). Record/refine invariants: fling gain is gesture-derived, not
residual-velocity-derived; glide cadence meets the declared frame target.

## Rules

Full descriptive names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK files.
