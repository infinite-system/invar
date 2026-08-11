# 551 — quick open enter race census

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

Two smokes have now failed because they typed a file name into Quick
Open and pressed Enter before the ranked result was ready — the file
never opened and a later wait timed out. The shared
openFileThroughQuickOpen helper fixes it (it waits for the exact query,
a result, the active buffer, and focus). Sweep the whole smoke suite for
the same latent race and route every site through the helper.

## Evidence (2026-08-11)

- #354 (move-line): typed sample+Enter without the helper; the extra
  welcome row perturbed timing and exposed the race. Fixed via the
  helper.
- #550 (scrollbars): typed the fixture name+Enter on a
  wait-for-any-screen-change; deterministically red on main, masked in
  the contention tier. Fixed via the helper.
- The helper: HarnessSmoke.Class.openFileThroughQuickOpen.

## Outline (the #530 blind-press census pattern)

Mechanical census across scripts/harness/*.ts: every site that sends a
Quick Open query (Control+P / the open-file chord) then Enter WITHOUT
going through openFileThroughQuickOpen — classify each SAFE (already
waits for the ranked match / active buffer) or RACE (Enter on a
screen-change or bare wait). Fix every RACE by routing through the
helper. Positive control: a fixed smoke's old bare-wait form, planted,
still races under load. Name the census query used; per-site verdicts.

## Bonus (verification-integrity)

The deeper lesson from #550: a smoke deterministically red on main
hid in the NON-BLOCKING contention tier for days. Consider (separate
proposal in the report, not this task's scope): a periodic solo-run of
every contention-tier smoke on main, so a deterministic red cannot
masquerade as a flake.
